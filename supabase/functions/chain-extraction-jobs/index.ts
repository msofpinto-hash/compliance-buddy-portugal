import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void };

type ChainStep = 'PT' | 'EU' | 'RELATIONS';

async function monitorAndChainFull(
  supabase: any,
  currentJobId: string,
  steps: ChainStep[],
  currentStepIndex: number,
  batchSize: number,
  parallelBatches: number
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  console.log(`[Chain] Monitoring job ${currentJobId} (step ${currentStepIndex + 1}/${steps.length}: ${steps[currentStepIndex]})...`);
  
  // Poll every 30 seconds for up to 6 hours
  const maxAttempts = 720;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    const { data: job, error } = await supabase
      .from('sync_logs')
      .select('status, items_processed, items_added')
      .eq('id', currentJobId)
      .single();
    
    if (error) {
      console.error('[Chain] Error checking job status:', error);
      break;
    }
    
    if (job.status === 'completed' || job.status === 'completed_timeout' || job.status === 'failed') {
      console.log(`[Chain] Job ${currentJobId} finished with status: ${job.status}`);
      console.log(`[Chain] Processed: ${job.items_processed}, Added: ${job.items_added}`);
      
      // Move to next step
      const nextStepIndex = currentStepIndex + 1;
      if (nextStepIndex >= steps.length) {
        console.log('[Chain] ✓ All steps completed!');
        
        // Create a completion log entry
        await supabase.from('sync_logs').insert({
          sync_type: 'chain-extraction-complete',
          status: 'completed',
          items_processed: steps.length,
          items_added: 0,
          completed_at: new Date().toISOString(),
        });
        
        break;
      }
      
      const nextStep = steps[nextStepIndex];
      console.log(`[Chain] Starting next step: ${nextStep}`);
      
      try {
        let response: Response;
        let newJobId: string | null = null;
        
        if (nextStep === 'RELATIONS') {
          // Start relations extraction
          response = await fetch(`${supabaseUrl}/functions/v1/extract-legislation-relations`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              limit: 500,
              dryRun: false,
              autoImport: true,
              background: true,
            }),
          });
        } else {
          // Start requirements extraction (PT or EU)
          response = await fetch(`${supabaseUrl}/functions/v1/extract-requirements-background`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              origin: nextStep,
              batchSize: batchSize,
              maxBatches: 100,
              useUrl: true,
              background: true,
            }),
          });
        }
        
        const result = await response.json();
        console.log(`[Chain] ${nextStep} extraction started:`, result);
        
        if (result.success) {
          // Find the new job ID
          const { data: newJobs } = await supabase
            .from('sync_logs')
            .select('id')
            .eq('status', 'running')
            .order('started_at', { ascending: false })
            .limit(1);
          
          if (newJobs && newJobs.length > 0 && newJobs[0].id) {
            const newJobIdValue: string = newJobs[0].id;
            console.log(`[Chain] New job ID: ${newJobIdValue}`);
            
            // Wait a bit then continue monitoring
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Recursively monitor the next job
            await monitorAndChainFull(supabase, newJobIdValue, steps, nextStepIndex, batchSize, parallelBatches);
          }
        }
      } catch (err) {
        console.error(`[Chain] Error starting ${nextStep}:`, err);
      }
      
      break;
    }
    
    if (attempts % 10 === 0) {
      console.log(`[Chain] Job still running (${Math.round(attempts * 0.5)}min): ${job.items_processed} processed, ${job.items_added} added`);
    }
    
    // Wait 30 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
  
  if (attempts >= maxAttempts) {
    console.log('[Chain] Max monitoring time reached (6 hours). Stopping monitor.');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      currentJobId, 
      steps = ['PT', 'EU', 'RELATIONS'],
      currentStepIndex = 0,
      nextOrigin, // Legacy support
      batchSize = 5, 
      parallelBatches = 3 
    } = await req.json();
    
    if (!currentJobId) {
      return new Response(
        JSON.stringify({ success: false, error: 'currentJobId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Legacy support: convert nextOrigin to steps
    let finalSteps = steps;
    if (nextOrigin && !steps.includes('RELATIONS')) {
      finalSteps = nextOrigin === 'EU' ? ['EU', 'RELATIONS'] : ['RELATIONS'];
    }
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Verify the job exists
    const { data: job, error } = await supabase
      .from('sync_logs')
      .select('id, status, sync_type')
      .eq('id', currentJobId)
      .single();
    
    if (error || !job) {
      return new Response(
        JSON.stringify({ success: false, error: 'Job not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (job.status !== 'running') {
      return new Response(
        JSON.stringify({ success: false, error: `Job is not running (status: ${job.status})` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Start background monitoring
    EdgeRuntime.waitUntil(monitorAndChainFull(supabase, currentJobId, finalSteps, currentStepIndex, batchSize, parallelBatches));
    
    return new Response(
      JSON.stringify({
        success: true,
        message: `Monitoring job ${currentJobId}. Chain: ${finalSteps.join(' → ')}`,
        currentJobId,
        steps: finalSteps,
        batchSize,
        parallelBatches
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});