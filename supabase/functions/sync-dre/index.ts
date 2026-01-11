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
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Verify authentication
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized - missing Authorization header' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const token = authHeader.replace('Bearer ', '');
  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
  if (claimsError || !claimsData?.claims) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized - invalid token' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const userId = claimsData.claims.sub;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Only admins can run sync operations
  const { data: adminRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('role', 'admin')
    .maybeSingle();

  if (!adminRole) {
    return new Response(
      JSON.stringify({ success: false, error: 'Forbidden - admin access required' }),
      { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  console.log(`Authenticated admin user: ${userId}`);

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

    // Fetch from DRE using Firecrawl scraping
    let allDocuments: DREDocument[] = [];
    const firecrawlApiKey = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!firecrawlApiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      throw new Error('FIRECRAWL_API_KEY is required for DRE sync');
    }
    
    // Scrape DRE homepage to get recent documents
    console.log('Scraping DRE homepage for recent documents...');
    
    try {
      const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${firecrawlApiKey}`
        },
        body: JSON.stringify({
          url: 'https://diariodarepublica.pt/dr/home',
          formats: ['markdown', 'links'],
          waitFor: 5000
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Firecrawl error:', errorText);
        throw new Error(`Firecrawl returned status ${response.status}`);
      }

      const scrapeData = await response.json();
      const links = scrapeData?.data?.links || [];
      const markdown = scrapeData?.data?.markdown || '';
      
      console.log(`Found ${links.length} links on DRE homepage`);
      
      // Extract diploma links (format: /dr/detalhe/TYPE/NUMBER-YEAR-ID)
      const diplomaLinks = links.filter((link: string) => 
        link.includes('/dr/detalhe/') && 
        !link.includes('diario-republica') &&
        !link.includes('legislacao-consolidada')
      );
      
      console.log(`Found ${diplomaLinks.length} diploma links`);
      
      // Process each diploma link
      for (const link of diplomaLinks) {
        try {
          const doc = await scrapeDiplomaPage(link, firecrawlApiKey);
          if (doc) {
            allDocuments.push(doc);
          }
        } catch (error) {
          console.error(`Error processing ${link}:`, error);
        }
      }
    } catch (error) {
      console.error('Error scraping DRE homepage:', error);
    }

    console.log(`Total documents fetched: ${allDocuments.length}`);

    // Build normalized number index for duplicate detection
    const { data: existingLegislation } = await supabase
      .from('legislation')
      .select('id, number, title, summary, entity, publication_date, effective_date, external_id');
    
    const normalizeNumber = (num: string): string => {
      return num
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/,\s*/g, ' ')
        .replace(/n\.º\s*/g, 'n.º ')
        .replace(/de\s+(\d)/g, '$1')
        .replace(/\s+de\s+\d{1,2}\s+de\s+\w+$/i, '')
        .trim();
    };
    
    const existingByNormalizedNumber = new Map<string, any>();
    const existingByExternalId = new Map<string, any>();
    for (const leg of existingLegislation || []) {
      const normalized = normalizeNumber(leg.number || '');
      if (normalized) existingByNormalizedNumber.set(normalized, leg);
      if (leg.external_id) existingByExternalId.set(leg.external_id, leg);
    }
    
    // Smart merge function
    const smartMerge = (existing: any, doc: any): Record<string, unknown> => {
      const merged: Record<string, unknown> = {};
      
      if (doc.title && doc.title !== doc.number && (!existing.title || existing.title === existing.number || doc.title.length > existing.title.length)) {
        merged.title = doc.title;
      }
      if (doc.summary && doc.summary.length > 20 && (!existing.summary || existing.summary.length < doc.summary.length)) {
        merged.summary = doc.summary;
      }
      if (doc.entity && !doc.entity.includes('[') && (!existing.entity || existing.entity.includes('['))) {
        merged.entity = doc.entity;
      }
      if (doc.publicationDate && !existing.publication_date) {
        merged.publication_date = doc.publicationDate;
      }
      if (doc.effectiveDate && !existing.effective_date) {
        merged.effective_date = doc.effectiveDate;
      }
      
      return merged;
    };

    let itemsProcessed = 0;
    let itemsAdded = 0;
    let itemsUpdated = 0;
    let itemsMerged = 0;

    for (const doc of allDocuments) {
      itemsProcessed++;

      // Check for existing by external_id first
      let existing = existingByExternalId.get(doc.id);
      
      // If not found, check by normalized number (duplicate detection)
      if (!existing) {
        const normalizedNum = normalizeNumber(doc.number);
        existing = existingByNormalizedNumber.get(normalizedNum);
        
        if (existing) {
          console.log(`Duplicate detected: "${doc.number}" matches existing "${existing.number}"`);
        }
      }

      let legislationId: string;

      if (existing) {
        // Use smart merge for existing legislation
        const mergedData = smartMerge(existing, doc);
        
        if (Object.keys(mergedData).length > 0) {
          mergedData.updated_at = new Date().toISOString();
          
          const { error: updateError } = await supabase
            .from('legislation')
            .update(mergedData)
            .eq('id', existing.id);

          if (updateError) {
            console.error(`Error updating legislation ${doc.id}:`, updateError);
            continue;
          }
          
          // Check if this was a merge of a duplicate vs an update of same external_id
          if (existing.external_id !== doc.id) {
            itemsMerged++;
            console.log(`Merged duplicate: ${doc.number} into ${existing.number}`);
          } else {
            itemsUpdated++;
            console.log(`Updated legislation: ${doc.number}`);
          }
        } else {
          console.log(`No updates needed for: ${doc.number}`);
        }

        legislationId = existing.id;
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
        
        // Add to index for future duplicate detection in same batch
        const normalized = normalizeNumber(doc.number);
        existingByNormalizedNumber.set(normalized, { ...doc, id: newLeg.id, external_id: doc.id });
        existingByExternalId.set(doc.id, { ...doc, id: newLeg.id });
        
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
      itemsMerged,
      message: `Sync completed: ${itemsAdded} added, ${itemsUpdated} updated, ${itemsMerged} merged (duplicates) out of ${itemsProcessed} processed`
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

// Scrape a single diploma page to extract its details
async function scrapeDiplomaPage(url: string, apiKey: string): Promise<DREDocument | null> {
  try {
    console.log(`Scraping diploma: ${url}`);
    
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        url: url,
        formats: ['markdown'],
        waitFor: 3000,
        onlyMainContent: true
      })
    });

    if (!response.ok) {
      console.warn(`Firecrawl returned ${response.status} for ${url}`);
      return null;
    }

    const data = await response.json();
    const markdown = data?.data?.markdown || '';
    const metadata = data?.data?.metadata || {};
    
    // Extract info from URL: /dr/detalhe/TYPE/NUMBER-YEAR-ID
    const urlMatch = url.match(/\/dr\/detalhe\/([^\/]+)\/([^\/]+)/);
    const docType = urlMatch ? urlMatch[1].replace(/-/g, ' ') : '';
    const docRef = urlMatch ? urlMatch[2] : '';
    
    // Parse the reference: number-year-id (e.g., "15-2026-1002139945")
    const refMatch = docRef.match(/^(\d+)-(\d{4})-(\d+)$/);
    const docNumber = refMatch ? refMatch[1] : '';
    const docYear = refMatch ? refMatch[2] : '';
    const docId = refMatch ? refMatch[3] : docRef;
    
    // Build the document number (e.g., "Portaria n.º 15/2026")
    const capitalizedType = docType.charAt(0).toUpperCase() + docType.slice(1);
    const formattedNumber = `${capitalizedType} n.º ${docNumber}/${docYear}`;
    
    // Extract entity and summary from markdown
    const lines = markdown.split('\n').filter((l: string) => l.trim());
    let entity = '';
    let summary = '';
    let publicationDate = '';
    
    // Try to extract publication date from markdown
    // Format examples: "2023-09-06", "06/09/2023", "6 de setembro de 2023"
    const datePatterns = [
      // ISO format: 2023-09-06
      /(\d{4})-(\d{2})-(\d{2})/,
      // PT format in URL: Diário da República n.º 173/2023, Série I de 2023-09-06
      /de\s+(\d{4})-(\d{2})-(\d{2})/,
      // PT format: 06/09/2023 or 6/9/2023
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/,
      // Written PT format: 6 de setembro de 2023
      /(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i
    ];
    
    const monthNames: { [key: string]: string } = {
      'janeiro': '01', 'fevereiro': '02', 'março': '03', 'marco': '03',
      'abril': '04', 'maio': '05', 'junho': '06',
      'julho': '07', 'agosto': '08', 'setembro': '09',
      'outubro': '10', 'novembro': '11', 'dezembro': '12'
    };
    
    // Search for date in markdown and metadata
    const textToSearch = `${markdown} ${metadata.title || ''} ${metadata.description || ''}`;
    
    for (const pattern of datePatterns) {
      const match = textToSearch.match(pattern);
      if (match) {
        if (pattern === datePatterns[0] || pattern === datePatterns[1]) {
          // ISO format - year-month-day
          publicationDate = `${match[1]}-${match[2]}-${match[3]}`;
          break;
        } else if (pattern === datePatterns[2]) {
          // PT format - day/month/year
          const day = match[1].padStart(2, '0');
          const month = match[2].padStart(2, '0');
          publicationDate = `${match[3]}-${month}-${day}`;
          break;
        } else if (pattern === datePatterns[3]) {
          // Written format
          const day = match[1].padStart(2, '0');
          const monthName = match[2].toLowerCase();
          const month = monthNames[monthName];
          if (month) {
            publicationDate = `${match[3]}-${month}-${day}`;
            break;
          }
        }
      }
    }
    
    // If no date found, construct from year in document number
    if (!publicationDate && docYear) {
      publicationDate = `${docYear}-01-01`;
      console.log(`No date found in text, using year from number: ${publicationDate}`);
    }
    
    // First non-empty line after title is usually the entity
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line && !line.startsWith('#') && !line.startsWith('[')) {
        if (!entity) {
          // Clean entity - remove markdown links
          entity = line.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim();
        } else if (!summary) {
          summary = line;
          break;
        }
      }
    }
    
    // Use title from metadata if available
    const title = metadata.title || metadata.ogTitle || formattedNumber;
    
    console.log(`Extracted date: ${publicationDate} for ${formattedNumber}`);
    
    return {
      id: docId,
      number: formattedNumber,
      title: title,
      summary: summary || markdown.substring(0, 500),
      entity: entity,
      publicationDate: publicationDate,
      documentUrl: url,
      category: capitalizedType
    };
  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
    return null;
  }
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
