import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Legislation {
  id: string;
  number: string;
  title: string;
  summary: string | null;
  entity: string | null;
  category: string | null;
  origin: string | null;
  publication_date: string | null;
  effective_date: string | null;
  document_url: string | null;
  source: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LegislationWithCategories extends Legislation {
  categories: { id: string; name: string; theme_name: string }[];
}

export function useLegislation(source?: string) {
  return useQuery({
    queryKey: ["legislation", source],
    queryFn: async () => {
      let query = supabase
        .from("legislation")
        .select("*")
        .order("publication_date", { ascending: false });

      if (source) {
        query = query.eq("source", source);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;
      return data as Legislation[];
    },
  });
}

export function useLegislationWithCategories() {
  return useQuery({
    queryKey: ["legislation-with-categories"],
    queryFn: async () => {
      // Fetch legislation
      const { data: legislation, error: legError } = await supabase
        .from("legislation")
        .select("*")
        .order("publication_date", { ascending: false })
        .limit(100);

      if (legError) throw legError;

      // Fetch mappings with category info
      const { data: mappings, error: mapError } = await supabase
        .from("legislation_category_mapping")
        .select(`
          legislation_id,
          category_id,
          theme_categories (
            id,
            name,
            theme_id,
            themes (
              name
            )
          )
        `);

      if (mapError) throw mapError;

      // Combine data
      const result: LegislationWithCategories[] = (legislation || []).map((leg) => {
        const legMappings = (mappings || []).filter((m: any) => m.legislation_id === leg.id);
        return {
          ...leg,
          categories: legMappings.map((m: any) => ({
            id: m.theme_categories?.id,
            name: m.theme_categories?.name,
            theme_name: m.theme_categories?.themes?.name,
          })).filter((c: any) => c.id),
        };
      });

      return result;
    },
  });
}
