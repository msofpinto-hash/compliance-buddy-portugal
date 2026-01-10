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

// DRE API base URL - now uses diariodarepublica.pt
const DRE_BASE_URL = 'https://diariodarepublica.pt';

serve(async (req) => {
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
      const daysBack = syncType === 'daily' ? 7 : 30;
      const from = new Date(today);
      from.setDate(from.getDate() - daysBack);
      fromDate = from.toISOString().split('T')[0];
    }
    
    toDate = endDate || new Date().toISOString().split('T')[0];

    console.log(`Fetching DRE documents from ${fromDate} to ${toDate}`);

    // Fetch from DRE API
    let allDocuments: DREDocument[] = [];
    
    // Generate dates between fromDate and toDate
    const dates = getDatesBetween(fromDate, toDate);
    console.log(`Will search ${dates.length} day(s)`);

    for (const date of dates) {
      console.log(`Fetching documents for date: ${date}`);
      
      try {
        // Get list of Diários for this date
        const diarios = await getDiariosForDate(date);
        console.log(`Found ${diarios.length} diários for ${date}`);
        
        // Get documents from each Diário
        for (const diario of diarios) {
          const docs = await getDocumentsFromDiario(diario.dbId, date, diario.serie);
          console.log(`Diário ${diario.dbId} (${diario.serie}): ${docs.length} documents`);
          allDocuments.push(...docs);
        }
      } catch (error) {
        console.error(`Error processing date ${date}:`, error);
      }
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
            origin: 'PT',
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

// Get Diários published on a specific date using Firecrawl for JS rendering
async function getDiariosForDate(date: string): Promise<{ dbId: number; serie: string }[]> {
  const diarios: { dbId: number; serie: string }[] = [];
  const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
  
  if (!firecrawlApiKey) {
    console.warn('FIRECRAWL_API_KEY not set, using fallback method');
    return getDiariosForDateFallback(date);
  }
  
  try {
    // Use Firecrawl to scrape the DRE calendar page
    const formattedDate = date.split('-').reverse().join('-'); // Convert to DD-MM-YYYY
    const url = `https://diariodarepublica.pt/dr/home/calendario/${formattedDate}`;
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${firecrawlApiKey}`
      },
      body: JSON.stringify({
        url: url,
        formats: ['markdown', 'links'],
        waitFor: 3000
      })
    });

    if (!response.ok) {
      console.warn(`Firecrawl returned status ${response.status} for date ${date}`);
      return getDiariosForDateFallback(date);
    }

    const data = await response.json();
    
    // Extract diário links from the scraped content
    const links = data?.data?.links || [];
    for (const link of links) {
      if (link.includes('/dr/detalhe/')) {
        const match = link.match(/\/dr\/detalhe\/(\d+)/);
        if (match) {
          const dbId = parseInt(match[1], 10);
          const serie = link.includes('serie-ii') ? 'Série II' : 'Série I';
          if (!diarios.some(d => d.dbId === dbId)) {
            diarios.push({ dbId, serie });
          }
        }
      }
    }
    
    console.log(`Firecrawl found ${diarios.length} diários for ${date}`);
  } catch (error) {
    console.error(`Error fetching diários for ${date}:`, error);
    return getDiariosForDateFallback(date);
  }
  
  return diarios;
}

// Fallback method using DRE search API
async function getDiariosForDateFallback(date: string): Promise<{ dbId: number; serie: string }[]> {
  const diarios: { dbId: number; serie: string }[] = [];
  
  try {
    // Try the DRE search endpoint
    const searchUrl = `${DRE_BASE_URL}/dr/pesquisa-avancada/-/pesquisa/${encodeURIComponent(JSON.stringify({
      dataPublicacao: date,
      perPage: 50
    }))}`;
    
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'LegalCompliance/1.0'
      }
    });

    if (!response.ok) {
      console.warn(`DRE search API returned status ${response.status} for date ${date}`);
      return diarios;
    }

    const data = await response.json();
    const items = data?.items || data?.results || [];
    
    for (const item of items) {
      if (item.id || item.dbId) {
        const dbId = item.id || item.dbId;
        const serie = (item.serie || item.title || '').includes('II') ? 'Série II' : 'Série I';
        diarios.push({ dbId, serie });
      }
    }
  } catch (error) {
    console.error(`Fallback method failed for ${date}:`, error);
  }
  
  return diarios;
}

// Get documents from a specific Diário
async function getDocumentsFromDiario(
  diarioId: number, 
  date: string, 
  serie: string
): Promise<DREDocument[]> {
  const documents: DREDocument[] = [];
  
  try {
    const payload = {
      versionInfo: {
        moduleVersion: "1.0.0",
        apiVersion: "1.0.0"
      },
      viewName: "Legislacao_Conteudos.ListaDiplomas",
      screenData: {
        variables: {
          DiarioId: diarioId
        }
      },
      clientVariables: {}
    };

    const response = await fetch(
      `${DRE_BASE_URL}/dre/screenservices/DRE/Legislacao_Conteudos/ListaDiplomas/DataActionGetDados`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-CSRFToken': 'bypass',
          'User-Agent': 'LegalCompliance/1.0'
        },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      console.warn(`DRE API returned status ${response.status} for diário ${diarioId}`);
      return documents;
    }

    const data = await response.json();
    
    // Parse response - structure may vary
    const diplomas = extractDiplomasFromResponse(data);
    
    for (const diploma of diplomas) {
      const doc: DREDocument = {
        id: diploma.id?.toString() || diploma.dbId?.toString() || `dre-${diarioId}-${Math.random().toString(36).substr(2, 9)}`,
        number: diploma.numero || diploma.tipoENumero || diploma.designacao || '',
        title: diploma.titulo || diploma.sumario?.substring(0, 200) || '',
        summary: diploma.sumario || diploma.resumo || '',
        entity: diploma.entidadeEmissora || diploma.emissor || '',
        publicationDate: diploma.dataPublicacao || date,
        effectiveDate: diploma.dataEntradaVigor || null,
        documentUrl: diploma.url || `${DRE_BASE_URL}/dr/detalhe/${diploma.id || diploma.dbId}`,
        category: diploma.tipo || diploma.tipoDocumento || '',
        series: serie
      };
      
      if (doc.number || doc.title) {
        documents.push(doc);
      }
    }
  } catch (error) {
    console.error(`Error fetching documents from diário ${diarioId}:`, error);
  }
  
  return documents;
}

// Extract diplomas from various response formats
function extractDiplomasFromResponse(data: any): any[] {
  // Try different possible response structures
  if (data?.data?.Json_Out) {
    try {
      const jsonOut = JSON.parse(data.data.Json_Out);
      return jsonOut?.hits?.hits?.map((h: any) => h._source) || jsonOut?.diplomas || jsonOut?.data || [];
    } catch {
      // Fall through to other options
    }
  }
  
  if (data?.data?.Diplomas) {
    return data.data.Diplomas;
  }
  
  if (data?.data?.ListaDiplomas) {
    return data.data.ListaDiplomas;
  }
  
  if (Array.isArray(data?.data)) {
    return data.data;
  }
  
  if (data?.diplomas) {
    return data.diplomas;
  }
  
  return [];
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
