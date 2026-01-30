import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIMEOUT_MINUTES = 6; // Mark jobs as timeout after 6 minutes
const MAX_RETRIES_PER_HOUR = 80; // Increase limit for aggressive processing
const BATCH_SIZE = 10; // Items per job for relations extraction

// ========== SOURCE STATUS CHECK ==========
// Check if an external source is available before launching jobs
async function isSourceAvailable(supabase: any, sourceName: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_source_available', { p_source_name: sourceName });
    if (error) {
      console.log(`[SourceCheck] Error checking ${sourceName}:`, error.message);
      return true; // Fail open to avoid blocking on DB errors
    }
    return data === true;
  } catch (e) {
    console.log(`[SourceCheck] Exception checking ${sourceName}:`, e);
    return true; // Fail open
  }
}

// Map job types to their required source
const JOB_SOURCE_REQUIREMENTS: Record<string, string> = {
  'find_dre_urls': 'dre_website',
  'fix_legacy_urls': 'dre_website',
  'fix_missing_dates': 'dre_opendata',
  'fix_generic_titles': 'dre_opendata',
  'fix_short_summary': 'dre_opendata',
  'fix_missing_urls_eu': 'eurlex',
  'fix_eu_metadata_all': 'eurlex',
  'fix_eu_metadata_generic_titles': 'eurlex',
  'fix_eu_metadata_short_summary': 'eurlex',
  'fix_eu_metadata_missing_dates': 'eurlex',
};

interface JobConfig {
  syncType: string;
  functionName: string;
  defaultPayload: Record<string, unknown>;
  maxParallelJobs: number;
  priority: number; // Lower = higher priority
  checkPendingWork?: (supabase: any) => Promise<{ hasPending: boolean; count: number }>;
}

// Helper to check pending URL corrections for PT (missing URLs)
async function checkPendingUrlCorrectionPT(supabase: any): Promise<{ hasPending: boolean; count: number }> {
  const { count } = await supabase
    .from('legislation')
    .select('id', { count: 'exact', head: true })
    .is('document_url', null)
    .or('no_digital_version.is.null,no_digital_version.eq.false')
    .in('origin', ['PT', 'dre']);
  
  return { hasPending: (count || 0) > 0, count: count || 0 };
}

// Helper to check pending URL corrections for EU (missing URLs)
async function checkPendingUrlCorrectionEU(supabase: any): Promise<{ hasPending: boolean; count: number }> {
  const { count } = await supabase
    .from('legislation')
    .select('id', { count: 'exact', head: true })
    .is('document_url', null)
    .or('no_digital_version.is.null,no_digital_version.eq.false')
    .eq('origin', 'EU');
  
  return { hasPending: (count || 0) > 0, count: count || 0 };
}

// Helper to check pending legacy URL fixes (URLs with old DRE patterns that need updating)
async function checkPendingLegacyUrlFixes(supabase: any): Promise<{ hasPending: boolean; count: number }> {
  const { count } = await supabase
    .from('legislation')
    .select('id', { count: 'exact', head: true })
    .or('no_digital_version.is.null,no_digital_version.eq.false')
    .not('document_url', 'is', null)
    .or(
      'document_url.like.%dre.pt/dre/detalhe%,' +
      'document_url.like.%data.dre.pt/eli%,' +
      'document_url.like.%dre.pt/web/guest%,' +
      'document_url.like.%dre.pt/application/file%,' +
      'document_url.like.%dre.pt/home%,' +
      'document_url.like.%dre.pt/util/getdiplomas%'
    );
  
  return { hasPending: (count || 0) > 0, count: count || 0 };
}

// Helper to check pending metadata corrections
async function checkPendingMetadataCorrection(
  supabase: any,
  mode: 'missing_dates' | 'generic_titles' | 'short_summary'
): Promise<{ hasPending: boolean; count: number }> {
  if (mode === 'missing_dates') {
    const { count } = await supabase
      .from('legislation')
      .select('id', { count: 'exact', head: true })
      .not('document_url', 'is', null)
      .is('publication_date', null)
      .or('no_digital_version.is.null,no_digital_version.eq.false');
    
    return { hasPending: (count || 0) > 0, count: count || 0 };
  }
  
  if (mode === 'generic_titles') {
    const { data } = await supabase.rpc('count_generic_titles');
    const count = data || 0;
    return { hasPending: count > 0, count };
  }
  
  if (mode === 'short_summary') {
    const { data } = await supabase.rpc('count_short_summaries');
    const count = data || 0;
    return { hasPending: count > 0, count };
  }
  
  return { hasPending: false, count: 0 };
}

// Ordered by priority - URLs first, then dates, then titles, then summaries
const JOB_CONFIGS: JobConfig[] = [
  // Legacy URL fixes - HIGHEST PRIORITY (544 items with old DRE patterns)
  {
    syncType: 'fix_legacy_urls',
    functionName: 'fix-broken-urls',
    // IMPORTANT: target only legacy/old patterns using mode=recover + PT origin.
    // Also pass syncType so the URL fixer writes sync_logs with the same sync_type,
    // otherwise the monitor would think nothing is running.
    defaultPayload: { syncType: 'fix_legacy_urls', limit: 50, origin: 'PT', mode: 'recover', background: true },
    maxParallelJobs: 2,
    priority: 0,
    checkPendingWork: checkPendingLegacyUrlFixes,
  },
  // URL recovery for PT (missing URLs) - uses Firecrawl search
  {
    // NOTE: find-missing-dre-urls writes sync_logs.sync_type='find_dre_urls'
    // so we must track it using that value.
    syncType: 'find_dre_urls',
    functionName: 'find-missing-dre-urls',
    defaultPayload: { limit: 20, background: true, dryRun: false },
    maxParallelJobs: 3,
    priority: 1,
    checkPendingWork: checkPendingUrlCorrectionPT,
  },
  // URL recovery for EU (missing URLs)
  {
    syncType: 'fix_missing_urls_eu',
    functionName: 'fix-broken-urls',
    // Use the same URL fixer (it supports EUR-Lex generation). Pass syncType so logs match.
    defaultPayload: { syncType: 'fix_missing_urls_eu', limit: 50, origin: 'EU', mode: 'recover', background: true },
    maxParallelJobs: 2,
    priority: 1,
    checkPendingWork: checkPendingUrlCorrectionEU,
  },
  // EU metadata fix - PRIORITY while PT is offline
  {
    syncType: 'fix_eu_metadata_all',
    functionName: 'fix-eu-metadata',
    defaultPayload: { mode: 'all', limit: 30, background: true },
    maxParallelJobs: 2,
    priority: 1.5, // Between URL and date fixes
    checkPendingWork: async (supabase) => {
      // Count EU legislation with metadata issues
      const { count } = await supabase
        .from('legislation')
        .select('id', { count: 'exact', head: true })
        .is('revocation_date', null)
        .or('origin.eq.EU,origin.eq.eurlex,document_url.ilike.%eur-lex%')
        .or('title.ilike.Documento %,summary.is.null,summary.eq.,publication_date.is.null,effective_date.is.null');
      
      return { hasPending: (count || 0) > 0, count: count || 0 };
    },
  },
  // Date corrections - second priority
  {
    syncType: 'fix_missing_dates',
    functionName: 'complete-auto-imported-legislation',
    defaultPayload: { mode: 'missing_dates', limit: 20, dryRun: false, requireUrl: true, randomOffset: true },
    maxParallelJobs: 3,
    priority: 2,
    checkPendingWork: (supabase) => checkPendingMetadataCorrection(supabase, 'missing_dates'),
  },
  // Title corrections - third priority
  {
    syncType: 'fix_generic_titles',
    functionName: 'complete-auto-imported-legislation',
    defaultPayload: { mode: 'generic_titles', limit: 20, dryRun: false, randomOffset: true },
    maxParallelJobs: 3,
    priority: 3,
    checkPendingWork: (supabase) => checkPendingMetadataCorrection(supabase, 'generic_titles'),
  },
  // Summary corrections - fourth priority
  {
    syncType: 'fix_short_summary',
    functionName: 'complete-auto-imported-legislation',
    defaultPayload: { mode: 'short_summary', limit: 20, dryRun: false, randomOffset: true },
    maxParallelJobs: 3,
    priority: 4,
    checkPendingWork: (supabase) => checkPendingMetadataCorrection(supabase, 'short_summary'),
  },
  // Legacy extraction jobs - lower priority, suspended by default
  {
    syncType: 'extract_relations',
    functionName: 'extract-legislation-relations',
    defaultPayload: { origin: 'PT', background: true, limit: BATCH_SIZE },
    maxParallelJobs: 15,
    priority: 10,
    checkPendingWork: async (supabase) => {
      const { data: allLeg } = await supabase
        .from('legislation')
        .select('id')
        .or('origin.eq.PT,origin.eq.dre,origin.is.null')
        .not('document_url', 'is', null);
      
      const { data: processed } = await supabase
        .from('legislation_relations_processed')
        .select('legislation_id');
      
      const processedIds = new Set(processed?.map((p: any) => p.legislation_id) || []);
      const pending = (allLeg || []).filter((l: any) => !processedIds.has(l.id));
      return { hasPending: pending.length > 0, count: pending.length };
    },
  },
  {
    syncType: 'background-requirements-extraction',
    functionName: 'extract-requirements-background',
    defaultPayload: { batchSize: 5, maxBatches: 20, useUrl: true },
    maxParallelJobs: 5,
    priority: 11,
    checkPendingWork: async (supabase) => {
      const { data: withReqs } = await supabase
        .from('legal_requirements')
        .select('legislation_id');
      
      const { data: allLeg } = await supabase
        .from('legislation')
        .select('id')
        .not('document_url', 'is', null);
      
      const idsWithReqs = new Set(withReqs?.map((r: any) => r.legislation_id) || []);
      const pending = (allLeg || []).filter((l: any) => !idsWithReqs.has(l.id));
      return { hasPending: pending.length > 0, count: pending.length };
    },
  },
];

// Jobs to skip by default (can be enabled with specific syncType or force)
const SUSPENDED_JOBS = ['extract_relations', 'background-requirements-extraction'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const targetSyncType = body.syncType as string | undefined;
    const forceRestart = body.force === true;
    const includeAll = body.includeAll === true; // Include suspended jobs

    console.log('🔄 Auto-retry: Checking for stuck/failed jobs...');

    const results: Array<{
      syncType: string;
      stuckFixed: number;
      restarted: number;
      pendingCount?: number;
      error?: string;
      skipped?: boolean;
    }> = [];

    for (const config of JOB_CONFIGS) {
      // Skip if targeting a specific sync type
      if (targetSyncType && config.syncType !== targetSyncType) {
        continue;
      }

      // Skip suspended jobs unless explicitly requested
      if (!targetSyncType && !includeAll && SUSPENDED_JOBS.includes(config.syncType)) {
        console.log(`⏸️ Skipping suspended job: ${config.syncType}`);
        results.push({
          syncType: config.syncType,
          stuckFixed: 0,
          restarted: 0,
          skipped: true,
        });
        continue;
      }

      // ========== SOURCE AVAILABILITY CHECK ==========
      // Check if the required external source is available before processing
      const requiredSource = JOB_SOURCE_REQUIREMENTS[config.syncType];
      if (requiredSource) {
        const sourceAvailable = await isSourceAvailable(supabase, requiredSource);
        if (!sourceAvailable) {
          console.log(`🚫 Source ${requiredSource} is OFFLINE - skipping ${config.syncType}`);
          results.push({
            syncType: config.syncType,
            stuckFixed: 0,
            restarted: 0,
            skipped: true,
            error: `Source ${requiredSource} is offline or blocked`,
          });
          continue;
        }
      }

      try {
        const result = await processJobType(supabase, supabaseUrl, supabaseServiceKey, config, forceRestart);
        results.push({ syncType: config.syncType, ...result });
      } catch (error) {
        console.error(`Error processing ${config.syncType}:`, error);
        results.push({
          syncType: config.syncType,
          stuckFixed: 0,
          restarted: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const totalFixed = results.reduce((sum, r) => sum + r.stuckFixed, 0);
    const totalRestarted = results.reduce((sum, r) => sum + r.restarted, 0);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Fixed ${totalFixed} stuck jobs, restarted ${totalRestarted} jobs`,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Auto-retry error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function processJobType(
  supabase: any,
  supabaseUrl: string,
  supabaseServiceKey: string,
  config: JobConfig,
  forceRestart: boolean
): Promise<{ stuckFixed: number; restarted: number; pendingCount?: number }> {
  const { syncType, functionName, defaultPayload, maxParallelJobs, checkPendingWork } = config;

  console.log(`\n📋 Processing ${syncType}...`);

  // 1. Find and fix stuck jobs (running for too long)
  const cutoffTime = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000).toISOString();
  
  const { data: stuckJobs, error: stuckError } = await supabase
    .from('sync_logs')
    .select('id, started_at, items_processed, items_added')
    .eq('status', 'running')
    .eq('sync_type', syncType)
    .lt('started_at', cutoffTime);

  if (stuckError) {
    console.error(`Error finding stuck ${syncType} jobs:`, stuckError);
    throw stuckError;
  }

  let stuckFixed = 0;
  if (stuckJobs && stuckJobs.length > 0) {
    console.log(`⚠️ Found ${stuckJobs.length} stuck ${syncType} job(s)`);

    for (const job of stuckJobs) {
      const { error: updateError } = await supabase
        .from('sync_logs')
        .update({
          status: 'completed_timeout',
          completed_at: new Date().toISOString(),
          error_message: `Auto-timeout após ${TIMEOUT_MINUTES} min. Processados: ${job.items_processed || 0}`,
        })
        .eq('id', job.id);

      if (!updateError) {
        stuckFixed++;
        console.log(`✅ Marked job ${job.id} as timeout`);
      }
    }
  }

  // 2. Check how many jobs are currently running
  const { data: runningJobs } = await supabase
    .from('sync_logs')
    .select('id')
    .eq('status', 'running')
    .eq('sync_type', syncType);

  const currentRunning = runningJobs?.length || 0;
  console.log(`📊 Currently running ${syncType} jobs: ${currentRunning}/${maxParallelJobs}`);

  // 3. Check recent restart count to prevent loops
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recentJobs } = await supabase
    .from('sync_logs')
    .select('id')
    .eq('sync_type', syncType)
    .gte('started_at', oneHourAgo);

  const recentCount = recentJobs?.length || 0;
  console.log(`📊 Jobs in last hour: ${recentCount}/${MAX_RETRIES_PER_HOUR}`);

  if (recentCount >= MAX_RETRIES_PER_HOUR && !forceRestart) {
    console.log(`⚠️ Max retries per hour reached for ${syncType}, skipping restart`);
    return { stuckFixed, restarted: 0 };
  }

  // 4. Check if there's pending work using the custom checker
  let hasPendingWork = false;
  let pendingCount = 0;
  
  if (checkPendingWork) {
    const result = await checkPendingWork(supabase);
    hasPendingWork = result.hasPending;
    pendingCount = result.count;
    console.log(`📊 Pending ${syncType}: ${pendingCount} items`);
  }

  if (!hasPendingWork) {
    console.log(`✅ No pending work for ${syncType}`);
    return { stuckFixed, restarted: 0, pendingCount: 0 };
  }

  // 5. Calculate how many new jobs to start
  const slotsAvailable = maxParallelJobs - currentRunning;
  if (slotsAvailable <= 0) {
    console.log(`⏳ No slots available for ${syncType} (${currentRunning}/${maxParallelJobs} running)`);
    return { stuckFixed, restarted: 0, pendingCount };
  }

  // Start new jobs to fill available slots
  // Higher parallelism for faster completion
  const isUrlJob =
    functionName === 'fix-broken-urls' ||
    functionName === 'find-missing-dre-urls' ||
    syncType === 'find_dre_urls' ||
    syncType === 'fix_legacy_urls' ||
    syncType === 'fix_missing_urls_eu';
  const isMetadataJob = syncType.startsWith('fix_');
  const jobsToStart = Math.min(slotsAvailable, isUrlJob ? 3 : isMetadataJob ? 3 : 5);
  console.log(`🚀 Starting ${jobsToStart} new ${syncType} jobs...`);

  let restarted = 0;
  for (let i = 0; i < jobsToStart; i++) {
    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(defaultPayload),
      });

      if (response.ok) {
        restarted++;
        console.log(`✅ Started ${syncType} job ${i + 1}/${jobsToStart}`);
      } else {
        const errorText = await response.text().catch(() => '');
        
        // Detect rate limit or credit exhaustion and back off
        if (response.status === 429 || response.status === 402) {
          console.log(`⚠️ Rate limit/credits exhausted for ${syncType}. Backing off.`);
          break; // Stop launching more jobs for this type
        }
        
        console.error(`❌ Failed to start ${syncType} job: ${response.status} - ${errorText}`);
      }

      // Delay between job launches - shorter for faster completion
      const delayMs = isUrlJob ? 1500 : isMetadataJob ? 1000 : 500;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    } catch (error) {
      console.error(`❌ Error starting ${syncType} job:`, error);
    }
  }

  return { stuckFixed, restarted, pendingCount };
}
