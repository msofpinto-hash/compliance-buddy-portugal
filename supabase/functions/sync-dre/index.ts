import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DREDocument {
  id: string;
  number: string;
  title: string;
  summary: string;
  entity: string;
  publicationDate: string;
  effectiveDate?: string;
  documentUrl: string;
  category?: string;
  series?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { syncType = 'daily', startDate, endDate, themeId } = await req.json().catch(() => ({}));
    
    console.log(`Starting DRE sync - Type: ${syncType}, Theme: ${themeId || 'all'}`);

    // Create sync log entry
    const { data: syncLog, error: syncLogError } = await supabase
      .from('sync_logs')
      .insert({
        sync_type: `dre-${syncType}`,
        status: 'in_progress',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (syncLogError) {
      console.error('Error creating sync log:', syncLogError);
      throw new Error('Failed to create sync log');
    }

    console.log(`Sync log created: ${syncLog.id}`);

    // Fetch theme categories and keywords for matching
    const { data: categories, error: catError } = await supabase
      .from('theme_categories')
      .select('id, name, keywords, theme_id');

    if (catError) {
      console.error('Error fetching categories:', catError);
      throw new Error('Failed to fetch categories');
    }

    console.log(`Loaded ${categories?.length || 0} categories for keyword matching`);

    // Calculate date range for sync
    const today = new Date();
    let fromDate: string;
    let toDate: string;
    
    if (startDate) {
      fromDate = startDate;
    } else {
      const daysBack = syncType === 'daily' ? 1 : 30;
      const from = new Date(today);
      from.setDate(from.getDate() - daysBack);
      fromDate = from.toISOString().split('T')[0];
    }
    
    toDate = endDate || new Date().toISOString().split('T')[0];

    console.log(`Fetching DRE documents from ${fromDate} to ${toDate}`);

    // Fetch from DRE API - Both Series I and II
    let allDocuments: DREDocument[] = [];
    
    // Generate dates between fromDate and toDate
    const dates = getDatesBetween(fromDate, toDate);
    console.log(`Will search ${dates.length} day(s)`);

    for (const date of dates) {
      console.log(`Fetching documents for date: ${date}`);
      
      // Series I - Main legislation
      const seriesI = await fetchDRESeries(date, 1);
      console.log(`Series I (${date}): ${seriesI.length} documents`);
      allDocuments.push(...seriesI);
      
      // Series II - Secondary legislation
      const seriesII = await fetchDRESeries(date, 2);
      console.log(`Series II (${date}): ${seriesII.length} documents`);
      allDocuments.push(...seriesII);
    }

    console.log(`Total documents fetched: ${allDocuments.length}`);

    let itemsProcessed = 0;
    let itemsAdded = 0;
    let itemsUpdated = 0;

    for (const doc of allDocuments) {
      itemsProcessed++;

      // Check if legislation already exists
      const { data: existing } = await supabase
        .from('legislation')
        .select('id')
        .eq('external_id', doc.id)
        .eq('source', 'dre')
        .maybeSingle();

      let legislationId: string;

      if (existing) {
        // Update existing legislation
        const { error: updateError } = await supabase
          .from('legislation')
          .update({
            number: doc.number,
            title: doc.title,
            summary: doc.summary,
            entity: doc.entity,
            publication_date: doc.publicationDate || null,
            effective_date: doc.effectiveDate || null,
            document_url: doc.documentUrl,
            category: doc.category,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        if (updateError) {
          console.error(`Error updating legislation ${doc.id}:`, updateError);
          continue;
        }

        legislationId = existing.id;
        itemsUpdated++;
        console.log(`Updated legislation: ${doc.number}`);
      } else {
        // Insert new legislation
        const { data: newLeg, error: insertError } = await supabase
          .from('legislation')
          .insert({
            external_id: doc.id,
            source: 'dre',
            number: doc.number,
            title: doc.title,
            summary: doc.summary,
            entity: doc.entity,
            origin: 'Nacional',
            publication_date: doc.publicationDate || null,
            effective_date: doc.effectiveDate || null,
            document_url: doc.documentUrl,
            category: doc.category
          })
          .select()
          .single();

        if (insertError) {
          console.error(`Error inserting legislation ${doc.id}:`, insertError);
          continue;
        }

        legislationId = newLeg.id;
        itemsAdded++;
        console.log(`Added legislation: ${doc.number}`);
      }

      // Match legislation to categories based on keywords
      const matchedCategories = matchLegislationToCategories(doc, categories || []);
      
      if (matchedCategories.length > 0) {
        // Remove existing mappings
        await supabase
          .from('legislation_category_mapping')
          .delete()
          .eq('legislation_id', legislationId);

        // Insert new mappings
        const mappings = matchedCategories.map(catId => ({
          legislation_id: legislationId,
          category_id: catId
        }));

        const { error: mappingError } = await supabase
          .from('legislation_category_mapping')
          .insert(mappings);

        if (mappingError) {
          console.error(`Error mapping categories for ${doc.number}:`, mappingError);
        } else {
          console.log(`Mapped ${matchedCategories.length} categories to ${doc.number}`);
        }
      }
    }

    // Update sync log with results
    const { error: updateLogError } = await supabase
      .from('sync_logs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        items_processed: itemsProcessed,
        items_added: itemsAdded,
        items_updated: itemsUpdated
      })
      .eq('id', syncLog.id);

    if (updateLogError) {
      console.error('Error updating sync log:', updateLogError);
    }

    const result = {
      success: true,
      syncId: syncLog.id,
      itemsProcessed,
      itemsAdded,
      itemsUpdated,
      message: `Sync completed: ${itemsAdded} added, ${itemsUpdated} updated out of ${itemsProcessed} processed`
    };

    console.log('Sync completed:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in sync-dre function:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Generate array of dates between start and end
function getDatesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current <= end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

// Fetch documents from a specific series for a specific date
async function fetchDRESeries(date: string, series: number): Promise<DREDocument[]> {
  const documents: DREDocument[] = [];
  
  try {
    // DRE.pt API endpoint for searching by date and series
    // Format: YYYY-MM-DD
    const dreApiUrl = `https://dre.pt/web/rest/diplomas?dataPublicacao=${date}&serie=${series}&formato=json`;
    
    console.log(`Fetching from: ${dreApiUrl}`);
    
    const response = await fetch(dreApiUrl, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'LegalCompliance/1.0'
      }
    });

    if (!response.ok) {
      console.warn(`DRE API returned status ${response.status} for series ${series} on ${date}`);
      
      // Try alternative endpoint
      const altUrl = `https://dre.pt/home/-/dre/${date}/serie-${series === 1 ? 'i' : 'ii'}?json=true`;
      console.log(`Trying alternative URL: ${altUrl}`);
      
      const altResponse = await fetch(altUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'LegalCompliance/1.0'
        }
      });
      
      if (altResponse.ok) {
        const altData = await altResponse.json();
        return parseDREResponse(altData, date, series);
      }
      
      return [];
    }

    const data = await response.json();
    return parseDREResponse(data, date, series);

  } catch (error) {
    console.error(`Error fetching DRE series ${series} for ${date}:`, error);
    return [];
  }
}

// Parse DRE API response into our document format
function parseDREResponse(data: any, date: string, series: number): DREDocument[] {
  const documents: DREDocument[] = [];
  
  // Handle different response formats
  const diplomas = data?.diplomas || data?.results || data?.data || [];
  
  if (!Array.isArray(diplomas)) {
    console.warn('Unexpected DRE response format:', typeof data);
    return [];
  }
  
  for (const doc of diplomas) {
    try {
      const dreDoc: DREDocument = {
        id: doc.id?.toString() || doc.dreId || doc.numero || `dre-${date}-${series}-${Math.random().toString(36).substr(2, 9)}`,
        number: doc.numero || doc.tipoENumero || doc.designacao || '',
        title: doc.titulo || doc.descricao || doc.sumario?.substring(0, 200) || '',
        summary: doc.sumario || doc.texto || doc.descricao || '',
        entity: doc.entidadeEmissora || doc.fonte || doc.emissor || '',
        publicationDate: doc.dataPublicacao || doc.data || date,
        effectiveDate: doc.dataEntradaVigor || doc.dataVigencia || null,
        documentUrl: doc.url || doc.ligacao || doc.linkDRE || `https://dre.pt/application/file/${doc.id || doc.dreId}`,
        category: doc.tipo || doc.categoria || doc.tipoDocumento || '',
        series: series === 1 ? 'Série I' : 'Série II'
      };
      
      // Only add if we have at least a number or title
      if (dreDoc.number || dreDoc.title) {
        documents.push(dreDoc);
      }
    } catch (parseError) {
      console.error('Error parsing document:', parseError);
    }
  }
  
  return documents;
}

// Match legislation text against category keywords
function matchLegislationToCategories(doc: DREDocument, categories: any[]): string[] {
  const matchedIds: string[] = [];
  const searchText = `${doc.title} ${doc.summary} ${doc.category}`.toLowerCase();

  for (const cat of categories) {
    if (!cat.keywords || cat.keywords.length === 0) continue;

    for (const keyword of cat.keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        if (!matchedIds.includes(cat.id)) {
          matchedIds.push(cat.id);
        }
        break;
      }
    }
  }

  return matchedIds;
}
