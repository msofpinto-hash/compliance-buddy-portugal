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
  revocation_date: string | null;
  document_url: string | null;
  source: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LegislationRelation {
  id: string;
  relation_type: string;
  target_number: string;
  target_title: string;
  target_id: string;
}

export interface LegislationCategory {
  id: string;
  name: string;
  theme_name: string;
  parent_id: string | null;
  full_path: string;
}

export interface LegislationWithCategories extends Legislation {
  categories: LegislationCategory[];
  relations: LegislationRelation[];
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
      // Helper to fetch all legislation with pagination (Supabase default limit is 1000)
      const fetchAllLegislation = async (): Promise<Legislation[]> => {
        const pageSize = 1000;
        let allData: Legislation[] = [];
        let from = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from("legislation")
            .select("*")
            .order("publication_date", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false })
            .range(from, from + pageSize - 1);

          if (error) throw error;

          if (data && data.length > 0) {
            allData = [...allData, ...data];
            from += pageSize;
            hasMore = data.length === pageSize;
          } else {
            hasMore = false;
          }
        }

        // Sort again to ensure consistent ordering after combining pages
        // Nulls at the end, then sort by date descending
        allData.sort((a, b) => {
          if (!a.publication_date && !b.publication_date) return 0;
          if (!a.publication_date) return 1;
          if (!b.publication_date) return -1;
          return new Date(b.publication_date).getTime() - new Date(a.publication_date).getTime();
        });

        return allData;
      };

      const fetchAllMappings = async (): Promise<any[]> => {
        const pageSize = 1000;
        let allData: any[] = [];
        let from = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from("legislation_category_mapping")
            .select(`
              legislation_id,
              category_id,
              theme_categories (
                id,
                name,
                theme_id,
                parent_id,
                themes (
                  name
                )
              )
            `)
            .range(from, from + pageSize - 1);

          if (error) throw error;

          if (data && data.length > 0) {
            allData = [...allData, ...data];
            from += pageSize;
            hasMore = data.length === pageSize;
          } else {
            hasMore = false;
          }
        }

        return allData;
      };

      const fetchAllRelations = async (): Promise<any[]> => {
        const pageSize = 1000;
        let allData: any[] = [];
        let from = 0;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from("legislation_relations")
            .select(`
              id,
              source_legislation_id,
              relation_type,
              target_legislation:legislation!legislation_relations_target_legislation_id_fkey(id, number, title)
            `)
            .range(from, from + pageSize - 1);

          if (error) throw error;

          if (data && data.length > 0) {
            allData = [...allData, ...data];
            from += pageSize;
            hasMore = data.length === pageSize;
          } else {
            hasMore = false;
          }
        }

        return allData;
      };

      // Fetch all data in parallel
      const [legislation, mappings, relations, categoriesResult] = await Promise.all([
        fetchAllLegislation(),
        fetchAllMappings(),
        fetchAllRelations(),
        supabase.from("theme_categories").select("id, name, parent_id, theme_id")
      ]);

      const allCategories = categoriesResult.data;
      if (categoriesResult.error) throw categoriesResult.error;

      // Build a function to get full path for a category
      const buildFullPath = (categoryId: string, themeName: string): string => {
        const pathParts: string[] = [];
        let currentId: string | null = categoryId;
        
        while (currentId) {
          const category = allCategories?.find(c => c.id === currentId);
          if (category) {
            pathParts.unshift(category.name);
            currentId = category.parent_id;
          } else {
            break;
          }
        }
        
        return [themeName, ...pathParts].join(" → ");
      };

      // Combine data
      const result: LegislationWithCategories[] = (legislation || []).map((leg) => {
        const legMappings = (mappings || []).filter((m: any) => m.legislation_id === leg.id);
        const legRelations = (relations || []).filter((r: any) => r.source_legislation_id === leg.id);
        
        return {
          ...leg,
          categories: legMappings.map((m: any) => {
            const themeName = m.theme_categories?.themes?.name || "";
            const categoryId = m.theme_categories?.id;
            return {
              id: categoryId,
              name: m.theme_categories?.name,
              theme_name: themeName,
              parent_id: m.theme_categories?.parent_id,
              full_path: categoryId ? buildFullPath(categoryId, themeName) : themeName,
            };
          }).filter((c: any) => c.id),
          relations: legRelations.map((r: any) => ({
            id: r.id,
            relation_type: r.relation_type,
            target_id: r.target_legislation?.id,
            target_number: r.target_legislation?.number,
            target_title: r.target_legislation?.title,
          })).filter((r: any) => r.target_id),
        };
      });

      return result;
    },
  });
}
