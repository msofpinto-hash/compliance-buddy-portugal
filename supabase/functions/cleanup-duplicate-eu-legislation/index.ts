import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil: (promise: Promise<void>) => void };

interface EULegislation {
  id: string;
  number: string;
  title: string;
  summary: string | null;
  entity: string | null;
  publication_date: string | null;
  effective_date: string | null;
  document_url: string | null;
  external_id: string | null;
  origin: string | null;
  created_at: string;
}

interface DuplicateGroup {
  canonicalCelex: string;
  items: EULegislation[];
  keepId: string;
  deleteIds: string[];
}

// ============================================================================
// CELEX EXTRACTION - Same logic as fix-eu-metadata
// ============================================================================

function detectDocumentType(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('directiva') || lower.includes('diretiva')) return 'L';
  if (lower.includes('regulamento')) return 'R';
  if (lower.includes('decis')) return 'D';
  if (lower.includes('recomenda')) return 'H';
  return 'L';
}

function extractCelexNumber(url: string | null, number: string, title?: string): string | null {
  // Priority 1: Extract from URL
  if (url) {
    const celexFromUrl = url.match(/CELEX[:\s]*(\d{5})([A-Z])(\d{4})/i);
    if (celexFromUrl) {
      const year = celexFromUrl[1];
      const urlType = celexFromUrl[2].toUpperCase();
      const num = celexFromUrl[3];
      
      // Verify the type matches the document name
      const correctType = detectDocumentType(number + ' ' + (title || ''));
      if (urlType !== correctType) {
        return `${year}${correctType}${num}`;
      }
      return `${year}${urlType}${num}`;
    }
  }
  
  // Priority 2: Number is already CELEX format
  const directCelex = number.match(/^(\d{5}[A-Z]\d{4})$/);
  if (directCelex) return directCelex[1];
  
  // Priority 3: Parse structured EU number formats
  const patterns = [
    { regex: /Regulamento\s*\([^)]+\)\s*(?:n\.?[ºo°]?\s*)?(\d{4})[\/\-](\d+)/i, type: 'R', yearFirst: true },
    { regex: /Regulamento\s*\([^)]+\)\s*(?:n\.?[ºo°]?\s*)?(\d+)[\/\-](\d{4})/i, type: 'R', yearFirst: false },
    { regex: /Dir[ei]tiva\s*\([^)]+\)\s*(?:n\.?[ºo°]?\s*)?(\d{4})[\/\-](\d+)/i, type: 'L', yearFirst: true },
    { regex: /Dir[ei]tiva\s*\([^)]+\)\s*(?:n\.?[ºo°]?\s*)?(\d+)[\/\-](\d{4})/i, type: 'L', yearFirst: false },
    { regex: /Decis[ãa]o\s*\([^)]+\)\s*(?:n\.?[ºo°]?\s*)?(\d{4})[\/\-](\d+)/i, type: 'D', yearFirst: true },
    { regex: /Decis[ãa]o\s*\([^)]+\)\s*(?:n\.?[ºo°]?\s*)?(\d+)[\/\-](\d{4})/i, type: 'D', yearFirst: false },
    { regex: /Recomenda[çc][ãa]o\s*\([^)]+\)\s*(?:n\.?[ºo°]?\s*)?(\d{4})[\/\-](\d+)/i, type: 'H', yearFirst: true },
    { regex: /Recomenda[çc][ãa]o\s*\([^)]+\)\s*(?:n\.?[ºo°]?\s*)?(\d+)[\/\-](\d{4})/i, type: 'H', yearFirst: false },
  ];
  
  for (const { regex, type, yearFirst } of patterns) {
    const match = number.match(regex);
    if (match) {
      const year = yearFirst ? match[1] : match[2];
      const num = yearFirst ? match[2] : match[1];
      return `3${year}${type}${num.padStart(4, '0')}`;
    }
  }
  
  // Priority 4: Legacy formats
  const legacyMatch = number.match(/(\d{2,4})[\/\-](\d+)[\/\-]?(CEE|CE|EEC|EU|UE|EURATOM)?/i);
  if (legacyMatch) {
    let year = legacyMatch[1];
    const num = legacyMatch[2];
    
    if (year.length === 2) {
      const yearNum = parseInt(year);
      year = yearNum > 50 ? `19${year}` : `20${year}`;
    }
    
    const type = detectDocumentType(number);
    return `3${year}${type}${num.padStart(4, '0')}`;
  }
  
  return null;
}

function isEULegislation(leg: { number: string; origin?: string | null; document_url?: string | null }): boolean {
  if (leg.origin === 'EU' || leg.origin === 'eurlex') return true;
  if (leg.document_url?.includes('eur-lex.europa.eu')) return true;
  if (/^\d{5}[A-Z]\d{4}$/.test(leg.number)) return true;
  
  const euPatterns = [
    /^Regulamento\s*\([UEC]/i,
    /^Diretiva\s*\([UEC]/i,
    /^Decis[ãa]o\s*\([UEC]/i,
    /^Recomenda[çc][ãa]o\s*\([UEC]/i,
    /\/(CEE|CE|UE|EU|EURATOM)$/i,
  ];
  
  return euPatterns.some(p => p.test(leg.number));
}

// ============================================================================
// QUALITY SCORING - Determine which record to keep
// ============================================================================

function qualityScore(item: EULegislation, reqCount: number, relCount: number, catCount: number): number {
  let score = 0;
  
  // Highest priority: has requirements or relations (don't delete these!)
  score += reqCount * 100;
  score += relCount * 50;
  score += catCount * 20;
  
  // Metadata quality
  if (item.summary && item.summary.length > 30) score += 40;
  if (item.publication_date) score += 25;
  if (item.effective_date) score += 20;
  if (item.entity && item.entity.length > 0) score += 15;
  if (item.document_url) score += 10;
  if (item.external_id) score += 5;
  
  // Title quality - longer, non-generic titles score higher
  const genericPatterns = [
    /^\d{5}[A-Z]\d{4}$/,  // Pure CELEX
    /^Documento\s/i,
  ];
  const isGenericTitle = genericPatterns.some(p => p.test(item.title));
  if (!isGenericTitle && item.title.length > 50) score += 35;
  else if (!isGenericTitle && item.title.length > 30) score += 20;
  
  return score;
}

// ============================================================================
// BULK OPERATIONS WITH CHUNKING
// ============================================================================

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function bulkDeleteIn(supabase: any, table: string, column: string, ids: string[]): Promise<void> {
  const chunks = chunkArray(ids, 100);
  for (const chunk of chunks) {
    await supabase.from(table).delete().in(column, chunk);
  }
}

// ============================================================================
// MAIN CLEANUP LOGIC
// ============================================================================

async function processEUCleanup(supabase: any, logId: string) {
  console.log('=== STARTING EU DUPLICATE CLEANUP ===');
  
  let totalMerged = 0;
  let totalDeleted = 0;
  const errors: string[] = [];
  
  try {
    // Fetch ALL EU legislation
    const allEU: EULegislation[] = [];
    let offset = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data: page, error: pageError } = await supabase
        .from('legislation')
        .select('id, number, title, summary, entity, publication_date, effective_date, document_url, external_id, origin, created_at')
        .or('origin.eq.EU,origin.eq.eurlex,document_url.ilike.%eur-lex%,number.like.3_____%')
        .range(offset, offset + pageSize - 1);
      
      if (pageError) throw pageError;
      if (!page || page.length === 0) break;
      
      // Filter to actual EU legislation
      const euOnly = page.filter((leg: EULegislation) => isEULegislation(leg));
      allEU.push(...euOnly);
      offset += pageSize;
      if (offset > 20000) break;
    }
    
    console.log(`Fetched ${allEU.length} EU legislation records`);
    
    // Fetch all counts in parallel
    const [reqResult, relResult, catResult] = await Promise.all([
      supabase.from('legal_requirements').select('legislation_id'),
      supabase.from('legislation_relations').select('source_legislation_id, target_legislation_id'),
      supabase.from('legislation_category_mapping').select('legislation_id'),
    ]);
    
    const reqCountMap = new Map<string, number>();
    for (const req of reqResult.data || []) {
      reqCountMap.set(req.legislation_id, (reqCountMap.get(req.legislation_id) || 0) + 1);
    }
    
    const relCountMap = new Map<string, number>();
    for (const rel of relResult.data || []) {
      relCountMap.set(rel.source_legislation_id, (relCountMap.get(rel.source_legislation_id) || 0) + 1);
      relCountMap.set(rel.target_legislation_id, (relCountMap.get(rel.target_legislation_id) || 0) + 1);
    }
    
    const catCountMap = new Map<string, number>();
    for (const cat of catResult.data || []) {
      catCountMap.set(cat.legislation_id, (catCountMap.get(cat.legislation_id) || 0) + 1);
    }
    
    // Group by canonical CELEX number
    const celexGroups = new Map<string, EULegislation[]>();
    
    for (const leg of allEU) {
      const celex = extractCelexNumber(leg.document_url, leg.number, leg.title);
      if (!celex) continue;
      
      if (!celexGroups.has(celex)) {
        celexGroups.set(celex, []);
      }
      celexGroups.get(celex)!.push(leg);
    }
    
    // Find duplicate groups (more than 1 record per CELEX)
    const duplicateGroups: DuplicateGroup[] = [];
    
    for (const [celex, items] of celexGroups) {
      if (items.length > 1) {
        // Sort by quality score (highest first)
        items.sort((a, b) => {
          const scoreA = qualityScore(a, reqCountMap.get(a.id) || 0, relCountMap.get(a.id) || 0, catCountMap.get(a.id) || 0);
          const scoreB = qualityScore(b, reqCountMap.get(b.id) || 0, relCountMap.get(b.id) || 0, catCountMap.get(b.id) || 0);
          return scoreB - scoreA;
        });
        
        duplicateGroups.push({
          canonicalCelex: celex,
          items,
          keepId: items[0].id,
          deleteIds: items.slice(1).map(i => i.id),
        });
        
        console.log(`CELEX ${celex}: ${items.length} records, keeping ${items[0].id} (score: ${qualityScore(items[0], reqCountMap.get(items[0].id) || 0, relCountMap.get(items[0].id) || 0, catCountMap.get(items[0].id) || 0)})`);
      }
    }
    
    console.log(`Found ${duplicateGroups.length} duplicate groups to merge`);
    
    // Update sync log with total
    await supabase.from('sync_logs').update({
      items_added: duplicateGroups.length,
      items_processed: 0,
    }).eq('id', logId);
    
    // Process each group
    for (let i = 0; i < duplicateGroups.length; i++) {
      const group = duplicateGroups[i];
      const keepItem = group.items[0];
      const itemsToDelete = group.items.slice(1);
      
      try {
        console.log(`\n--- Processing CELEX ${group.canonicalCelex} ---`);
        
        // Step 1: Merge best metadata into keeper
        let mergedTitle = keepItem.title;
        let mergedSummary = keepItem.summary;
        let mergedEntity = keepItem.entity;
        let mergedPubDate = keepItem.publication_date;
        let mergedEffDate = keepItem.effective_date;
        let mergedDocUrl = keepItem.document_url;
        let mergedExtId = keepItem.external_id;
        
        for (const item of itemsToDelete) {
          // Keep longer/better title (non-CELEX)
          if (item.title && item.title.length > mergedTitle.length && !/^\d{5}[A-Z]\d{4}$/.test(item.title)) {
            mergedTitle = item.title;
          }
          // Keep longer summary
          if (item.summary && (!mergedSummary || item.summary.length > mergedSummary.length)) {
            mergedSummary = item.summary;
          }
          // Keep entity if missing
          if (item.entity && !mergedEntity) {
            mergedEntity = item.entity;
          }
          // Keep dates if missing
          if (item.publication_date && !mergedPubDate) {
            mergedPubDate = item.publication_date;
          }
          if (item.effective_date && !mergedEffDate) {
            mergedEffDate = item.effective_date;
          }
          // Keep URL if missing
          if (item.document_url && !mergedDocUrl) {
            mergedDocUrl = item.document_url;
          }
          if (item.external_id && !mergedExtId) {
            mergedExtId = item.external_id;
          }
        }
        
        // Ensure canonical URL with CELEX
        const canonicalUrl = `https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:${group.canonicalCelex}`;
        if (mergedDocUrl !== canonicalUrl) {
          mergedDocUrl = canonicalUrl;
        }
        
        // Update keeper with merged data
        await supabase.from('legislation').update({
          title: mergedTitle,
          summary: mergedSummary,
          entity: mergedEntity,
          publication_date: mergedPubDate,
          effective_date: mergedEffDate,
          document_url: mergedDocUrl,
          external_id: mergedExtId,
          origin: 'EU',
        }).eq('id', keepItem.id);
        
        console.log(`Updated keeper ${keepItem.id} with merged metadata`);
        
        // Step 2: Migrate requirements to keeper
        for (const deleteId of group.deleteIds) {
          await supabase.from('legal_requirements')
            .update({ legislation_id: keepItem.id })
            .eq('legislation_id', deleteId);
        }
        
        // Step 3: Migrate relations to keeper (update both source and target)
        for (const deleteId of group.deleteIds) {
          await supabase.from('legislation_relations')
            .update({ source_legislation_id: keepItem.id })
            .eq('source_legislation_id', deleteId);
          
          await supabase.from('legislation_relations')
            .update({ target_legislation_id: keepItem.id })
            .eq('target_legislation_id', deleteId);
        }
        
        // Step 4: Migrate category mappings (avoid duplicates)
        const { data: existingCats } = await supabase
          .from('legislation_category_mapping')
          .select('category_id')
          .eq('legislation_id', keepItem.id);
        
        const existingCatIds = new Set((existingCats || []).map((c: any) => c.category_id));
        
        for (const deleteId of group.deleteIds) {
          const { data: deleteCats } = await supabase
            .from('legislation_category_mapping')
            .select('category_id')
            .eq('legislation_id', deleteId);
          
          for (const cat of deleteCats || []) {
            if (!existingCatIds.has(cat.category_id)) {
              await supabase.from('legislation_category_mapping').insert({
                legislation_id: keepItem.id,
                category_id: cat.category_id,
              });
              existingCatIds.add(cat.category_id);
            }
          }
        }
        
        // Step 5: Migrate organization assignments (avoid duplicates)
        const { data: existingOrgs } = await supabase
          .from('organization_legislation')
          .select('organization_id')
          .eq('legislation_id', keepItem.id);
        
        const existingOrgIds = new Set((existingOrgs || []).map((o: any) => o.organization_id));
        
        for (const deleteId of group.deleteIds) {
          const { data: deleteOrgs } = await supabase
            .from('organization_legislation')
            .select('organization_id, notes, applicability_type')
            .eq('legislation_id', deleteId);
          
          for (const org of deleteOrgs || []) {
            if (!existingOrgIds.has(org.organization_id)) {
              await supabase.from('organization_legislation').insert({
                legislation_id: keepItem.id,
                organization_id: org.organization_id,
                notes: org.notes,
                applicability_type: org.applicability_type,
              });
              existingOrgIds.add(org.organization_id);
            }
          }
        }
        
        // Step 6: Migrate alerts
        for (const deleteId of group.deleteIds) {
          await supabase.from('alerts')
            .update({ related_legislation_id: keepItem.id })
            .eq('related_legislation_id', deleteId);
        }
        
        // Step 7: Delete from auxiliary tables
        await Promise.all([
          bulkDeleteIn(supabase, 'legislation_relations_processed', 'legislation_id', group.deleteIds),
          bulkDeleteIn(supabase, 'legislation_category_mapping', 'legislation_id', group.deleteIds),
          bulkDeleteIn(supabase, 'organization_legislation', 'legislation_id', group.deleteIds),
          bulkDeleteIn(supabase, 'user_legislation_reads', 'legislation_id', group.deleteIds),
        ]);
        
        // Step 8: Delete duplicates
        const deleteChunks = chunkArray(group.deleteIds, 100);
        for (const chunk of deleteChunks) {
          const { error: delError } = await supabase.from('legislation').delete().in('id', chunk);
          if (delError) {
            console.error(`Delete error:`, delError);
            errors.push(`CELEX ${group.canonicalCelex}: ${delError.message}`);
          }
        }
        
        console.log(`Deleted ${group.deleteIds.length} duplicates for CELEX ${group.canonicalCelex}`);
        
        totalMerged++;
        totalDeleted += group.deleteIds.length;
        
        // Update progress
        await supabase.from('sync_logs').update({
          items_processed: i + 1,
          items_updated: totalDeleted,
        }).eq('id', logId);
        
      } catch (groupError) {
        console.error(`Error processing CELEX ${group.canonicalCelex}:`, groupError);
        errors.push(`CELEX ${group.canonicalCelex}: ${groupError instanceof Error ? groupError.message : String(groupError)}`);
      }
    }
    
    // Final update
    await supabase.from('sync_logs').update({
      status: errors.length > 0 ? 'completed_with_errors' : 'completed',
      completed_at: new Date().toISOString(),
      items_processed: duplicateGroups.length,
      items_updated: totalDeleted,
      items_added: totalMerged,
      error_message: errors.length > 0 
        ? `${errors.length} erros: ${errors.slice(0, 3).join('; ')}`
        : `✓ ${totalMerged} grupos consolidados, ${totalDeleted} duplicados removidos`,
    }).eq('id', logId);
    
    console.log(`\n=== EU CLEANUP COMPLETE ===`);
    console.log(`Merged: ${totalMerged} groups, Deleted: ${totalDeleted} duplicates, Errors: ${errors.length}`);
    
  } catch (error) {
    console.error('EU Cleanup critical error:', error);
    await supabase.from('sync_logs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error_message: error instanceof Error ? error.message : String(error),
    }).eq('id', logId);
  }
}

// ============================================================================
// ENTRY POINT
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').single();
    
    if (!roles) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun || false;
    
    // Dry run: just count duplicates
    if (dryRun) {
      const { data: euLegislation } = await supabase
        .from('legislation')
        .select('id, number, title, document_url, origin')
        .or('origin.eq.EU,origin.eq.eurlex,document_url.ilike.%eur-lex%,number.like.3_____%');
      
      const euOnly = (euLegislation || []).filter((leg: any) => isEULegislation(leg));
      const celexGroups = new Map<string, any[]>();
      
      for (const leg of euOnly) {
        const celex = extractCelexNumber(leg.document_url, leg.number, leg.title);
        if (!celex) continue;
        if (!celexGroups.has(celex)) celexGroups.set(celex, []);
        celexGroups.get(celex)!.push(leg);
      }
      
      let duplicateGroups = 0;
      let recordsToDelete = 0;
      
      for (const [, items] of celexGroups) {
        if (items.length > 1) {
          duplicateGroups++;
          recordsToDelete += items.length - 1;
        }
      }
      
      return new Response(JSON.stringify({
        success: true,
        dryRun: true,
        totalEU: euOnly.length,
        duplicateGroups,
        recordsToDelete,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    // Check for running cleanup
    const { data: runningJobs } = await supabase
      .from('sync_logs')
      .select('id, started_at')
      .eq('sync_type', 'cleanup_duplicate_eu')
      .eq('status', 'running')
      .limit(1);
    
    if (runningJobs && runningJobs.length > 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Já existe uma limpeza EU em execução',
        runningJobId: runningJobs[0].id,
      }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    
    // Create sync log
    const { data: logEntry, error: logError } = await supabase
      .from('sync_logs')
      .insert({
        sync_type: 'cleanup_duplicate_eu',
        status: 'running',
        created_by: user.id,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    
    if (logError) throw logError;
    
    // Run cleanup in background
    const bgTask = processEUCleanup(supabase, logEntry.id);
    
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(bgTask);
    } else {
      bgTask.catch((e) => console.error('Background EU cleanup failed:', e));
    }
    
    return new Response(JSON.stringify({
      success: true,
      message: 'Limpeza de duplicados EU iniciada em segundo plano',
      jobId: logEntry.id,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    
  } catch (error) {
    console.error('EU Cleanup error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
