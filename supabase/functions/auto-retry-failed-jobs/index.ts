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
// Supports half-open: degraded sources allow 1 probe job to test recovery
async function getSourceStatus(supabase: any, sourceName: string): Promise<{ available: boolean; degraded: boolean }> {
  try {
    const { data, error } = await supabase
      .from('external_source_status')
      .select('status, blocked_until, failure_count')
      .eq('source_name', sourceName)
      .single();
    
    if (error || !data) return { available: true, degraded: false }; // fail open
    
    // Blocked = hard offline
    if (data.blocked_until && new Date(data.blocked_until) > new Date()) {
      return { available: false, degraded: false };
    }
    
    if (data.status === 'offline') return { available: false, degraded: false };
    if (data.status === 'degraded') return { available: true, degraded: true };
    
    return { available: true, degraded: false };
  } catch (e) {
    console.log(`[SourceCheck] Exception checking ${sourceName}:`, e);
    return { available: true, degraded: false }; // Fail open
  }
}

// Map job types to their required source
// Map job types to their required external source
// Jobs will be skipped automatically if the source is offline/blocked
const JOB_SOURCE_REQUIREMENTS: Record<string, string> = {
  // PT metadata jobs - these use Firecrawl to scrape DRE website pages
  'duplicate_cleanup': 'dre_website',
  'find_dre_urls': 'dre_website',
  'fix_legacy_urls': 'dre_website',
  'fix_missing_dates': 'firecrawl',
  'fix_generic_titles': 'firecrawl',
  'fix_short_summary': 'firecrawl',
  // EU metadata jobs - require EUR-Lex
  'fix_missing_urls_eu': 'eurlex',
  'fix_eu_metadata_all': 'eurlex',
  'fix_eu_metadata_generic_titles': 'eurlex',
  'fix_eu_metadata_short_summary': 'eurlex',
  'fix_eu_metadata_missing_dates': 'eurlex',
  'fix_eurlex_titles': 'eurlex',
  // Requirements extraction - require Firecrawl (PAUSED)
  'priority_requirements_extraction': 'firecrawl',
  'background-requirements-extraction': 'firecrawl',
};

interface JobConfig {
  syncType: string;
  functionName: string;
  defaultPayload: Record<string, unknown>;
  maxParallelJobs: number;
  priority: number; // Lower = higher priority
  checkPendingWork?: (supabase: any) => Promise<{ hasPending: boolean; count: number; ids?: string[] }>;
}

// Check if Firecrawl has available credits by testing the source status
async function checkFirecrawlCredits(supabase: any): Promise<boolean> {
  try {
    // Check for recent 402 errors in sync_logs (credit exhaustion indicator)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentErrors } = await supabase
      .from('sync_logs')
      .select('id, error_message')
      .gte('started_at', fiveMinutesAgo)
      .ilike('error_message', '%créditos%esgotados%');
    
    // If no recent credit errors, assume credits are available
    return !recentErrors || recentErrors.length === 0;
  } catch (e) {
    console.log('[FirecrawlCheck] Error checking credits:', e);
    return false; // Fail closed to avoid wasting attempts
  }
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
      .or('publication_date.is.null,effective_date.is.null');
    
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
// ========== JOB PRIORITY ORDER ==========
// Phase 1: Metadata consolidation (current focus)
// Phase 2: Requirements extraction (PAUSED until metadata complete)
const JOB_CONFIGS: JobConfig[] = [
  // ========== PT METADATA JOBS (require DRE online) ==========
  // Duplicate cleanup - HIGHEST PRIORITY when DRE comes back online
  {
    syncType: 'duplicate_cleanup',
    functionName: 'cleanup-duplicate-legislation',
    defaultPayload: { batchSize: 100 },
    maxParallelJobs: 1, // Only one cleanup at a time
    priority: -1, // Highest priority - before any other PT processing
    checkPendingWork: async (supabase: any) => {
      // Check for duplicate groups by normalized number
      const { data: legislation } = await supabase
        .from('legislation')
        .select('number')
        .is('external_id', null) // PT diplomas only
        .limit(5000);
      
      if (!legislation) return { hasPending: false, count: 0 };
      
      // Count duplicates by normalizing numbers
      const groups = new Map<string, number>();
      for (const item of legislation) {
        const normalized = item.number.toLowerCase().replace(/\s+/g, '').replace(/n\.?º?\s*/gi, '');
        groups.set(normalized, (groups.get(normalized) || 0) + 1);
      }
      
      let duplicateCount = 0;
      for (const count of groups.values()) {
        if (count > 1) duplicateCount += count - 1;
      }
      
      return { hasPending: duplicateCount > 50, count: duplicateCount };
    },
  },
  // Legacy URL fixes - HIGHEST PRIORITY for individual items
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
  // ========== EUR-LEX METADATA JOBS (online - active) ==========
  // EUR-Lex title corrections via SPARQL
  {
    syncType: 'fix_eurlex_titles',
    functionName: 'fix-eurlex-titles',
    defaultPayload: { limit: 50, dryRun: false },
    maxParallelJobs: 2,
    priority: 1.2,
    checkPendingWork: async (supabase: any) => {
      // Count EU legislation with short titles (less than 50 chars)
      const { count } = await supabase
        .from('legislation')
        .select('id', { count: 'exact', head: true })
        .not('external_id', 'is', null)
        .is('revocation_date', null)
        .or('title.eq.external_id,title.lt.50');
      
      // Use a reasonable threshold
      const shortTitles = count || 0;
      return { hasPending: shortTitles > 10, count: shortTitles };
    },
  },
  // EU metadata fix - generic issues
  {
    syncType: 'fix_eu_metadata_all',
    functionName: 'fix-eu-metadata',
    defaultPayload: { mode: 'all', limit: 30, background: true },
    maxParallelJobs: 2,
    priority: 1.5, // Between URL and date fixes
    checkPendingWork: async (supabase: any) => {
      // Count EU legislation with metadata issues
      const { count } = await supabase
        .from('legislation')
        .select('id', { count: 'exact', head: true })
        .is('revocation_date', null)
        .not('external_id', 'is', null)
        .or('summary.is.null,summary.eq.,publication_date.is.null,effective_date.is.null');
      
      return { hasPending: (count || 0) > 5, count: count || 0 };
    },
  },
  // Date corrections - second priority
  {
    syncType: 'fix_missing_dates',
    functionName: 'complete-auto-imported-legislation',
    defaultPayload: { mode: 'missing_dates', limit: 40, dryRun: false, requireUrl: true, randomOffset: true },
    maxParallelJobs: 5,
    priority: 2,
    checkPendingWork: (supabase) => checkPendingMetadataCorrection(supabase, 'missing_dates'),
  },
  // Title corrections - third priority
  {
    syncType: 'fix_generic_titles',
    functionName: 'complete-auto-imported-legislation',
    defaultPayload: { mode: 'generic_titles', limit: 40, dryRun: false, randomOffset: true },
    maxParallelJobs: 5,
    priority: 3,
    checkPendingWork: (supabase) => checkPendingMetadataCorrection(supabase, 'generic_titles'),
  },
  // Summary corrections - fourth priority
  {
    syncType: 'fix_short_summary',
    functionName: 'complete-auto-imported-legislation',
    defaultPayload: { mode: 'short_summary', limit: 40, dryRun: false, randomOffset: true },
    maxParallelJobs: 5,
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
  // Priority requirements extraction - for diplomas that need forceReplace with URL scraping
  {
    syncType: 'priority_requirements_extraction',
    functionName: 'extract-requirements-background',
    defaultPayload: { 
      batchSize: 1, 
      maxBatches: 1, 
      useUrl: true, 
      strictUrlOnly: true, 
      forceReplace: true 
    },
    maxParallelJobs: 1, // One at a time to monitor credits
    priority: 5, // Higher priority than regular extraction
    checkPendingWork: async (supabase) => {
      // Check for priority failures waiting for Firecrawl credits
      const { data: priorityFailures } = await supabase
        .from('legislation_processing_failures')
        .select('legislation_id')
        .eq('failure_type', 'requirements_extraction_priority')
        .eq('is_permanent', false)
        .or('retry_after.is.null,retry_after.lte.now()');
      
      const ids = priorityFailures?.map((f: any) => f.legislation_id) || [];
      return { 
        hasPending: ids.length > 0, 
        count: ids.length,
        ids 
      };
    },
  },
];

// ========== REQUIREMENTS EXTRACTION PAUSE ==========
// CRITICAL: Requirements extraction is PAUSED until metadata is fully consolidated.
// This prevents wasted credits and ensures stable data before extraction.
// To re-enable: remove these from SUSPENDED_JOBS after metadata validation.
const REQUIREMENTS_EXTRACTION_PAUSED = true; // Master switch for requirements

// Jobs to skip by default (can be enabled with specific syncType or force)
const SUSPENDED_JOBS = [
  'extract_relations', 
  'background-requirements-extraction',
  'priority_requirements_extraction', // PAUSED: Wait for metadata consolidation
];

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
      let isDegraded = false;
      if (requiredSource) {
        const sourceStatus = await getSourceStatus(supabase, requiredSource);
        if (!sourceStatus.available) {
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
        isDegraded = sourceStatus.degraded;
        if (isDegraded) {
          console.log(`⚠️ Source ${requiredSource} is DEGRADED - limiting concurrency for ${config.syncType}`);
        }
      }

      try {
        const result = await processJobType(supabase, supabaseUrl, supabaseServiceKey, config, forceRestart, isDegraded);
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
  forceRestart: boolean,
  isDegraded: boolean = false
): Promise<{ stuckFixed: number; restarted: number; pendingCount?: number }> {
  const { syncType, functionName, defaultPayload, checkPendingWork } = config;
  // When degraded, limit to 1 job (probe) to test recovery
  const maxParallelJobs = isDegraded ? 1 : config.maxParallelJobs;

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
  let pendingIds: string[] = [];
  
  if (checkPendingWork) {
    const result = await checkPendingWork(supabase);
    hasPendingWork = result.hasPending;
    pendingCount = result.count;
    pendingIds = result.ids || [];
    console.log(`📊 Pending ${syncType}: ${pendingCount} items`);
  }

  if (!hasPendingWork) {
    console.log(`✅ No pending work for ${syncType}`);
    return { stuckFixed, restarted: 0, pendingCount: 0 };
  }

  // 4.5 Special check for priority extraction - verify Firecrawl credits are available
  if (syncType === 'priority_requirements_extraction') {
    const hasCredits = await checkFirecrawlCredits(supabase);
    if (!hasCredits) {
      console.log(`⏸️ Firecrawl credits not available - skipping priority extraction`);
      return { stuckFixed, restarted: 0, pendingCount };
    }
    console.log(`✅ Firecrawl credits available - proceeding with priority extraction`);
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
  const isPriorityExtraction = syncType === 'priority_requirements_extraction';
  // When degraded, only start 1 probe job regardless of type
  const jobsToStart = isDegraded ? 1 : Math.min(slotsAvailable, isPriorityExtraction ? 1 : isUrlJob ? 3 : isMetadataJob ? 3 : 5);
  console.log(`🚀 Starting ${jobsToStart} new ${syncType} jobs...`);

  let restarted = 0;
  for (let i = 0; i < jobsToStart; i++) {
    try {
      // Build payload - for priority extraction, include specific IDs
      let payload = { ...defaultPayload };
      if (isPriorityExtraction && pendingIds.length > 0) {
        // Process one ID at a time for priority extraction
        const targetId = pendingIds[i] || pendingIds[0];
        payload = { 
          ...defaultPayload, 
          legislationIds: [targetId] 
        };
        console.log(`🎯 Priority extraction for legislation: ${targetId}`);
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        restarted++;
        console.log(`✅ Started ${syncType} job ${i + 1}/${jobsToStart}`);
        
        // For priority extraction, DON'T delete the failure record yet
        // The extraction job itself will handle cleanup on actual success
        // We just update the retry_after to give it time to complete
        if (isPriorityExtraction && pendingIds[i]) {
          await supabase
            .from('legislation_processing_failures')
            .update({ 
              retry_after: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
              failure_reason: 'Extração em curso - aguardar resultado'
            })
            .eq('legislation_id', pendingIds[i])
            .eq('failure_type', 'requirements_extraction_priority');
          console.log(`⏳ Updated retry_after for ${pendingIds[i]} - will check again in 30 min`);
        }
      } else {
        const errorText = await response.text().catch(() => '');
        
        // Detect rate limit or credit exhaustion and back off
        if (response.status === 429 || response.status === 402) {
          console.log(`⚠️ Rate limit/credits exhausted for ${syncType}. Backing off.`);
          
          // For priority extraction, update retry_after instead of deleting
          if (isPriorityExtraction && pendingIds[i]) {
            await supabase
              .from('legislation_processing_failures')
              .update({ 
                retry_after: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                retry_count: supabase.sql`retry_count + 1`
              })
              .eq('legislation_id', pendingIds[i])
              .eq('failure_type', 'requirements_extraction_priority');
          }
          break; // Stop launching more jobs for this type
        }
        
        console.error(`❌ Failed to start ${syncType} job: ${response.status} - ${errorText}`);
      }

      // Delay between job launches - longer when degraded to avoid overwhelming source
      const baseDelay = isPriorityExtraction ? 5000 : isUrlJob ? 1500 : isMetadataJob ? 1000 : 500;
      const delayMs = isDegraded ? Math.max(baseDelay, 3000) : baseDelay;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    } catch (error) {
      console.error(`❌ Error starting ${syncType} job:`, error);
    }
  }

  return { stuckFixed, restarted, pendingCount };
}
