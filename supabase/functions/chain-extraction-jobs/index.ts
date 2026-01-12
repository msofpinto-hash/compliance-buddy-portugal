import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void };

async function monitorAndChain(
  supabase: any,
  currentJobId: string,
  nextOrigin: string,
  batchSize: number,
  parallelBatches: number
) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  console.log(`Monitoring job ${currentJobId} for completion...`);
  
  // Poll every 30 seconds for up to 4 hours
  const maxAttempts = 480; // 4 hours at 30s intervals
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    // Check job status
    const { data: job, error } = await supabase
      .from('sync_logs')
      .select('status, items_processed, items_added')
      .eq('id', currentJobId)
      .single();
    
    if (error) {
      console.error('Error checking job status:', error);
      break;
    }
    
    if (job.status === 'completed' || job.status === 'completed_timeout' || job.status === 'failed') {
      console.log(`Job ${currentJobId} finished with status: ${job.status}`);
      console.log(`Processed: ${job.items_processed}, Added: ${job.items_added}`);
      
      // Start the next extraction
      console.log(`Starting ${nextOrigin} extraction...`);
      
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/extract-requirements-background`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            origin: nextOrigin,
            batchSize: batchSize,
            parallelBatches: parallelBatches,
            useUrl: true,
            background: true
          }),
        });
        
        const result = await response.json();
        console.log(`${nextOrigin} extraction started:`, result);
      } catch (err) {
        console.error(`Error starting ${nextOrigin} extraction:`, err);
      }
      
      break;
    }
    
    console.log(`Job still running (attempt ${attempts}): ${job.items_processed} processed, ${job.items_added} added`);
    
    // Wait 30 seconds before next check
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
  
  if (attempts >= maxAttempts) {
    console.log('Max monitoring time reached (4 hours). Stopping monitor.');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { currentJobId, nextOrigin = 'EU', batchSize = 5, parallelBatches = 3 } = await req.json();
    
    if (!currentJobId) {
      return new Response(
        JSON.stringify({ success: false, error: 'currentJobId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
    EdgeRuntime.waitUntil(monitorAndChain(supabase, currentJobId, nextOrigin, batchSize, parallelBatches));
    
    return new Response(
      JSON.stringify({
        success: true,
        message: `Monitoring job ${currentJobId}. Will start ${nextOrigin} extraction when complete.`,
        currentJobId,
        nextOrigin,
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