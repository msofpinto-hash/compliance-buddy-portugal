import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Patterns that indicate invalid references (not real legislation)
const INVALID_PATTERNS = [
  // Article references
  /^artigo\s+\d+/i,
  /^n\.º\s+\d+\s+do\s+artigo/i,
  /^alínea\s+[a-z]\)/i,
  
  // Generic statute/regime references
  /^estatuto\s+(da|do|dos|das)/i,
  /^regime\s+(comum|transitório|geral)/i,
  /^medidas\s+de\s+aplicação/i,
  
  // Date-only entries (not diploma numbers)
  /^\d{2}\/\d{2}\/\d{4}$/,
  
  // Budget references
  /^OE\s+\d{4}$/i,
  
  // Generic approval references
  /^despacho\s+de\s+aprovação/i,
  
  // Treaty articles
  /tratado\s+(sobre|de|da)/i,
];

// Additional specific invalid numbers
const INVALID_EXACT_MATCHES = [
  'medidas de aplicação do Estatuto dos deputados ao Parlamento Europeu',
  'Estatuto da Carreira de Investigação Científica',
  'Regime comum das carreiras próprias de investigação científica em regime de direito privado',
  'Regime transitório da carreira de investigação científica',
];

interface LegislationToDelete {
  id: string;
  number: string;
  title: string;
  has_requirements: boolean;
  has_relations: boolean;
  has_org_assignments: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { dryRun = true, includeWithDependencies = false } = await req.json().catch(() => ({}));

    console.log(`Starting cleanup: dryRun=${dryRun}, includeWithDependencies=${includeWithDependencies}`);

    // Get all legislation without URLs (potential invalid references)
    const { data: candidates, error: fetchError } = await supabase
      .from('legislation')
      .select('id, number, title')
      .is('document_url', null);

    if (fetchError) {
      throw new Error(`Failed to fetch legislation: ${fetchError.message}`);
    }

    console.log(`Found ${candidates?.length || 0} candidates without URLs`);

    // Filter to only invalid references based on patterns
    const invalidRefs: LegislationToDelete[] = [];
    
    for (const leg of candidates || []) {
      const isInvalid = INVALID_PATTERNS.some(pattern => pattern.test(leg.number)) ||
                        INVALID_EXACT_MATCHES.includes(leg.number);
      
      if (!isInvalid) continue;

      // Check for dependencies
      const [reqResult, relResult, orgResult] = await Promise.all([
        supabase.from('legal_requirements').select('id', { count: 'exact', head: true }).eq('legislation_id', leg.id),
        supabase.from('legislation_relations').select('id', { count: 'exact', head: true })
          .or(`source_legislation_id.eq.${leg.id},target_legislation_id.eq.${leg.id}`),
        supabase.from('organization_legislation').select('id', { count: 'exact', head: true }).eq('legislation_id', leg.id),
      ]);

      const hasRequirements = (reqResult.count || 0) > 0;
      const hasRelations = (relResult.count || 0) > 0;
      const hasOrgAssignments = (orgResult.count || 0) > 0;

      invalidRefs.push({
        ...leg,
        has_requirements: hasRequirements,
        has_relations: hasRelations,
        has_org_assignments: hasOrgAssignments,
      });
    }

    console.log(`Identified ${invalidRefs.length} invalid references`);

    // Separate into safe to delete vs has dependencies
    const safeToDelete = invalidRefs.filter(r => 
      !r.has_requirements && !r.has_relations && !r.has_org_assignments
    );
    
    const withDependencies = invalidRefs.filter(r => 
      r.has_requirements || r.has_relations || r.has_org_assignments
    );

    const toDelete = includeWithDependencies ? invalidRefs : safeToDelete;

    let deleted = 0;
    const deletedItems: { id: string; number: string }[] = [];
    const errors: { id: string; number: string; error: string }[] = [];

    if (!dryRun && toDelete.length > 0) {
      for (const item of toDelete) {
        try {
          // Delete in order: requirements -> relations -> org assignments -> legislation
          if (item.has_requirements) {
            await supabase.from('legal_requirements').delete().eq('legislation_id', item.id);
          }
          if (item.has_relations) {
            await supabase.from('legislation_relations').delete()
              .or(`source_legislation_id.eq.${item.id},target_legislation_id.eq.${item.id}`);
          }
          if (item.has_org_assignments) {
            await supabase.from('organization_legislation').delete().eq('legislation_id', item.id);
          }
          
          // Delete category mappings
          await supabase.from('legislation_category_mapping').delete().eq('legislation_id', item.id);
          
          // Delete the legislation itself
          const { error: deleteError } = await supabase
            .from('legislation')
            .delete()
            .eq('id', item.id);

          if (deleteError) {
            errors.push({ id: item.id, number: item.number, error: deleteError.message });
          } else {
            deleted++;
            deletedItems.push({ id: item.id, number: item.number });
          }
        } catch (err) {
          errors.push({ id: item.id, number: item.number, error: String(err) });
        }
      }

      console.log(`Deleted ${deleted} invalid references`);
    }

    return new Response(JSON.stringify({
      success: true,
      dryRun,
      includeWithDependencies,
      summary: {
        totalCandidates: candidates?.length || 0,
        invalidReferences: invalidRefs.length,
        safeToDelete: safeToDelete.length,
        withDependencies: withDependencies.length,
        deleted,
        errors: errors.length,
      },
      safeToDelete: safeToDelete.map(r => ({ id: r.id, number: r.number })),
      withDependencies: withDependencies.map(r => ({
        id: r.id,
        number: r.number,
        requirements: r.has_requirements,
        relations: r.has_relations,
        orgAssignments: r.has_org_assignments,
      })),
      deletedItems,
      errors,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
