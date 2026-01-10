import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Theme {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

export interface ThemeCategory {
  id: string;
  theme_id: string;
  parent_id: string | null;
  name: string;
  keywords: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface ThemeWithCategories extends Theme {
  categories: ThemeCategory[];
}

export function useThemes() {
  return useQuery({
    queryKey: ["themes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("themes")
        .select("*")
        .order("name");

      if (error) throw error;
      return data as Theme[];
    },
  });
}

export function useThemeCategories(themeId?: string) {
  return useQuery({
    queryKey: ["theme-categories", themeId],
    queryFn: async () => {
      let query = supabase
        .from("theme_categories")
        .select("*")
        .order("name");

      if (themeId) {
        query = query.eq("theme_id", themeId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as ThemeCategory[];
    },
  });
}

export function useThemesWithCategories() {
  return useQuery({
    queryKey: ["themes-with-categories"],
    queryFn: async () => {
      const { data: themes, error: themesError } = await supabase
        .from("themes")
        .select("*")
        .order("name");

      if (themesError) throw themesError;

      const { data: categories, error: catError } = await supabase
        .from("theme_categories")
        .select("*")
        .order("name");

      if (catError) throw catError;

      const themesWithCategories: ThemeWithCategories[] = (themes || []).map((theme) => ({
        ...theme,
        categories: (categories || []).filter((cat) => cat.theme_id === theme.id),
      }));

      return themesWithCategories;
    },
  });
}

export function useUpdateTheme() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<Theme> & { id: string }) => {
      const { error } = await supabase
        .from("themes")
        .update(data)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["themes"] });
      queryClient.invalidateQueries({ queryKey: ["themes-with-categories"] });
    },
  });
}

export function useUpdateCategory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<ThemeCategory> & { id: string }) => {
      const { error } = await supabase
        .from("theme_categories")
        .update(data)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["theme-categories"] });
      queryClient.invalidateQueries({ queryKey: ["themes-with-categories"] });
    },
  });
}
