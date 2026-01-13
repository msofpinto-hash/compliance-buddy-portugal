import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIMEOUT_MINUTES = 8; // Mark jobs as timeout after 8 minutes
const MAX_RESTARTS_PER_HOUR = 10; // Prevent infinite restart loops

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('🔄 Checking for timed out extraction jobs...');

    // Find jobs stuck in "running" state for too long
    const { data: stuckJobs, error: stuckError } = await supabase
      .from('sync_logs')
      .select('id, sync_type, started_at, items_processed, items_added, error_message')
      .eq('status', 'running')
      .eq('sync_type', 'background-requirements-extraction')
      .lt('started_at', new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000).toISOString());

    if (stuckError) {
      console.error('Error finding stuck jobs:', stuckError);
      throw stuckError;
    }

    if (!stuckJobs || stuckJobs.length === 0) {
      console.log('✅ No stuck jobs found');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No stuck jobs found',
        stuckJobsFixed: 0,
        restarted: false
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`⚠️ Found ${stuckJobs.length} stuck job(s)`);

    // Check how many restarts happened in the last hour to prevent loops
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recentRestarts, error: restartsError } = await supabase
      .from('sync_logs')
      .select('id')
      .eq('sync_type', 'background-requirements-extraction')
      .gte('started_at', oneHourAgo);

    if (restartsError) {
      console.error('Error checking recent restarts:', restartsError);
    }

    const restartsCount = recentRestarts?.length || 0;
    console.log(`📊 Restarts in last hour: ${restartsCount}/${MAX_RESTARTS_PER_HOUR}`);

    // Mark stuck jobs as completed_timeout
    for (const job of stuckJobs) {
      const { error: updateError } = await supabase
        .from('sync_logs')
        .update({
          status: 'completed_timeout',
          completed_at: new Date().toISOString(),
          error_message: `Auto-timeout após ${TIMEOUT_MINUTES} min. ${job.error_message || ''}`
        })
        .eq('id', job.id);

      if (updateError) {
        console.error(`Error updating job ${job.id}:`, updateError);
      } else {
        console.log(`✅ Marked job ${job.id} as completed_timeout`);
      }
    }

    // Check if there are still pending items to process
    const { data: pendingStats, error: statsError } = await supabase
      .from('legislation')
      .select('id, origin')
      .not('id', 'in', 
        supabase.from('legal_requirements').select('legislation_id')
      );

    // Count pending by origin using a different approach
    const { data: ptPending } = await supabase.rpc('get_pending_legislation_count', { p_origin: 'PT' });
    const { data: euPending } = await supabase.rpc('get_pending_legislation_count', { p_origin: 'EU' });

    // Fallback: count manually if RPC doesn't exist
    let pendingPT = 0;
    let pendingEU = 0;
    
    const { data: allLegislation } = await supabase
      .from('legislation')
      .select('id, origin');
    
    const { data: withReqs } = await supabase
      .from('legal_requirements')
      .select('legislation_id');
    
    if (allLegislation && withReqs) {
      const idsWithReqs = new Set(withReqs.map(r => r.legislation_id));
      for (const leg of allLegislation) {
        if (!idsWithReqs.has(leg.id)) {
          if (leg.origin === 'PT') pendingPT++;
          else if (leg.origin === 'EU') pendingEU++;
        }
      }
    }

    console.log(`📊 Pending: PT=${pendingPT}, EU=${pendingEU}`);

    // Determine which origin needs more work
    let originToRestart: string | null = null;
    if (pendingEU > 0) {
      originToRestart = 'EU';
    } else if (pendingPT > 0) {
      originToRestart = 'PT';
    }

    // Check if we should restart
    if (restartsCount >= MAX_RESTARTS_PER_HOUR) {
      console.log('⚠️ Max restarts per hour reached, skipping restart');
      return new Response(JSON.stringify({
        success: true,
        message: `Fixed ${stuckJobs.length} stuck jobs but skipped restart (max restarts reached)`,
        stuckJobsFixed: stuckJobs.length,
        restarted: false,
        pendingPT,
        pendingEU
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!originToRestart) {
      console.log('✅ All legislation processed, no restart needed');
      return new Response(JSON.stringify({
        success: true,
        message: `Fixed ${stuckJobs.length} stuck jobs, all legislation processed`,
        stuckJobsFixed: stuckJobs.length,
        restarted: false,
        pendingPT,
        pendingEU
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Wait a bit before restarting to avoid race conditions
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Restart extraction
    console.log(`🚀 Restarting extraction for origin: ${originToRestart}`);
    
    const restartResponse = await fetch(`${supabaseUrl}/functions/v1/extract-requirements-background`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        origin: originToRestart,
        batchSize: 5,
        maxBatches: 100,
        useUrl: true
      })
    });

    const restartResult = await restartResponse.json();
    console.log('Restart result:', restartResult);

    return new Response(JSON.stringify({
      success: true,
      message: `Fixed ${stuckJobs.length} stuck jobs and restarted extraction for ${originToRestart}`,
      stuckJobsFixed: stuckJobs.length,
      restarted: true,
      restartedOrigin: originToRestart,
      pendingPT,
      pendingEU,
      restartResult
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in auto-restart-extraction:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
