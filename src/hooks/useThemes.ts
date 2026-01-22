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

export interface CategoryThemeLink {
  id: string;
  category_id: string;
  theme_id: string;
  created_at: string;
}

export interface ThemeCategoryWithLinks extends ThemeCategory {
  linkedThemeIds: string[];
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

// Get all categories with their linked themes
export function useCategoriesWithThemeLinks() {
  return useQuery({
    queryKey: ["categories-with-theme-links"],
    queryFn: async () => {
      const [categoriesRes, linksRes, themesRes] = await Promise.all([
        supabase.from("theme_categories").select("*").order("name"),
        supabase.from("category_theme_links").select("*"),
        supabase.from("themes").select("*").order("name"),
      ]);

      if (categoriesRes.error) throw categoriesRes.error;
      if (linksRes.error) throw linksRes.error;
      if (themesRes.error) throw themesRes.error;

      const categories = categoriesRes.data as ThemeCategory[];
      const links = linksRes.data as CategoryThemeLink[];
      const themes = themesRes.data as Theme[];

      // Build categories with linked theme IDs
      const categoriesWithLinks: ThemeCategoryWithLinks[] = categories.map(cat => ({
        ...cat,
        linkedThemeIds: links.filter(l => l.category_id === cat.id).map(l => l.theme_id),
      }));

      return { categories: categoriesWithLinks, themes };
    },
  });
}

// Mutation to update category theme links
export function useUpdateCategoryThemeLinks() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ categoryId, themeIds }: { categoryId: string; themeIds: string[] }) => {
      // Delete existing links
      const { error: deleteError } = await supabase
        .from("category_theme_links")
        .delete()
        .eq("category_id", categoryId);

      if (deleteError) throw deleteError;

      // Insert new links
      if (themeIds.length > 0) {
        const { error: insertError } = await supabase
          .from("category_theme_links")
          .insert(themeIds.map(themeId => ({ category_id: categoryId, theme_id: themeId })));

        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories-with-theme-links"] });
      queryClient.invalidateQueries({ queryKey: ["themes-with-categories"] });
      queryClient.invalidateQueries({ queryKey: ["theme-categories"] });
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
      queryClient.invalidateQueries({ queryKey: ["categories-with-theme-links"] });
    },
  });
}
