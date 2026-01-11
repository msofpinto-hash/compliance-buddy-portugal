import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EvidenceTemplate {
  group_name: string;
  title: string;
  description?: string;
  area_ambiente: boolean;
  area_qualidade: boolean;
  area_seguranca: boolean;
  area_seguranca_alimentar: boolean;
  area_energia: boolean;
  area_florestas: boolean;
  area_saude: boolean;
  area_conciliacao: boolean;
  area_sustentabilidade: boolean;
  legislation_references: string;
  legislation_numbers: string[];
}

// Parse legislation references to extract diploma numbers
function extractLegislationNumbers(references: string): string[] {
  if (!references) return [];
  
  const numbers: string[] = [];
  
  // Split by <br/> or newlines
  const parts = references.split(/<br\s*\/?>/gi).flatMap(p => p.split('\n'));
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    
    // Try to extract the diploma number (e.g., "Decreto-Lei n.º 118/2024, de 31 de dezembro")
    // We want to capture the type and number
    const match = trimmed.match(/^([^,]+)/);
    if (match) {
      numbers.push(match[1].trim());
    }
  }
  
  return numbers;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { templates } = await req.json() as { templates: EvidenceTemplate[] };

    if (!templates || !Array.isArray(templates)) {
      throw new Error("Invalid templates data");
    }

    console.log(`Processing ${templates.length} evidence templates...`);

    // Get all legislation for matching
    const { data: allLegislation, error: legError } = await supabase
      .from("legislation")
      .select("id, number, title");
    
    if (legError) {
      console.error("Error fetching legislation:", legError);
      throw legError;
    }

    console.log(`Found ${allLegislation?.length || 0} legislation entries for matching`);

    let templatesCreated = 0;
    let linksCreated = 0;
    const errors: string[] = [];

    for (const template of templates) {
      try {
        // Check if template already exists
        const { data: existing } = await supabase
          .from("evidence_templates")
          .select("id")
          .eq("group_name", template.group_name)
          .eq("title", template.title)
          .single();

        let templateId: string;

        if (existing) {
          templateId = existing.id;
          console.log(`Template already exists: ${template.title.substring(0, 50)}...`);
        } else {
          // Insert new template
          const { data: newTemplate, error: insertError } = await supabase
            .from("evidence_templates")
            .insert({
              group_name: template.group_name,
              title: template.title,
              description: template.description,
              area_ambiente: template.area_ambiente,
              area_qualidade: template.area_qualidade,
              area_seguranca: template.area_seguranca,
              area_seguranca_alimentar: template.area_seguranca_alimentar,
              area_energia: template.area_energia,
              area_florestas: template.area_florestas,
              area_saude: template.area_saude,
              area_conciliacao: template.area_conciliacao,
              area_sustentabilidade: template.area_sustentabilidade,
              legislation_references: template.legislation_references,
            })
            .select("id")
            .single();

          if (insertError) {
            errors.push(`Error inserting template "${template.title.substring(0, 50)}": ${insertError.message}`);
            continue;
          }

          templateId = newTemplate!.id;
          templatesCreated++;
        }

        // Link to legislation
        for (const legNumber of template.legislation_numbers) {
          // Find matching legislation by number
          const matchingLeg = allLegislation?.find(leg => 
            leg.number.toLowerCase().includes(legNumber.toLowerCase()) ||
            legNumber.toLowerCase().includes(leg.number.toLowerCase())
          );

          if (matchingLeg) {
            // Insert link (ignore duplicates)
            const { error: linkError } = await supabase
              .from("evidence_template_legislation")
              .upsert({
                template_id: templateId,
                legislation_id: matchingLeg.id,
              }, {
                onConflict: "template_id,legislation_id",
                ignoreDuplicates: true,
              });

            if (!linkError) {
              linksCreated++;
            }
          }
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        errors.push(`Error processing template "${template.title?.substring(0, 50)}": ${errorMessage}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        templatesCreated,
        linksCreated,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Error in import-evidence-templates:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
