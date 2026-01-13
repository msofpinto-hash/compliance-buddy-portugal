import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LegislationWithCategories } from "@/hooks/useLegislation";

type FixType = "generic_title" | "missing_origin" | "missing_dates" | "invalid_dates";

interface BulkFixResult {
  total: number;
  fixed: number;
  failed: number;
  errors: string[];
}

export function useBulkFixes(legislation: LegislationWithCategories[] | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [isFixingGenericTitles, setIsFixingGenericTitles] = useState(false);
  const [isFixingOrigin, setIsFixingOrigin] = useState(false);
  const [isFixingMissingDates, setIsFixingMissingDates] = useState(false);
  const [isFixingInvalidDates, setIsFixingInvalidDates] = useState(false);
  
  const isFixing = isFixingGenericTitles || isFixingOrigin || isFixingMissingDates || isFixingInvalidDates;

  // Generic title patterns (auto-imported placeholders)
  const genericTitlePatterns = [
    "Documento ",
    "Diploma referenciado",
    "a aguardar importação",
  ];

  const isGenericTitle = (title: string): boolean => {
    return genericTitlePatterns.some(pattern => 
      title.toLowerCase().includes(pattern.toLowerCase())
    ) || title.length < 10;
  };

  // Fix generic titles - calls edge function
  const fixGenericTitles = async () => {
    if (!legislation) return;
    
    const itemsToFix = legislation.filter(leg => isGenericTitle(leg.title));
    if (itemsToFix.length === 0) {
      toast({ title: "Nenhum título genérico para corrigir" });
      return;
    }
    
    setIsFixingGenericTitles(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("complete-auto-imported-legislation", {
        body: { 
          limit: itemsToFix.length,
          dryRun: false,
          includePT: true,
          includeEU: true,
          fixDates: true,
        },
      });

      if (error) throw error;

      const result: BulkFixResult = {
        total: data.processed || itemsToFix.length,
        fixed: data.totalUpdated || 0,
        failed: data.failed || 0,
        errors: [],
      };

      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
      queryClient.invalidateQueries({ queryKey: ["data-quality-stats"] });
      queryClient.invalidateQueries({ queryKey: ["sync-logs"] });

      toast({
        title: "Correção de títulos iniciada",
        description: `${result.fixed} diplomas actualizados. Processo a decorrer em segundo plano.`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
    } catch (error) {
      console.error("Fix generic titles error:", error);
      toast({
        title: "Erro ao corrigir títulos",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsFixingGenericTitles(false);
    }
  };

  // Fix missing origin - infer from title/number patterns
  const fixMissingOrigin = async () => {
    if (!legislation) return;
    
    const itemsToFix = legislation.filter(leg => 
      !leg.origin || (leg.origin !== "PT" && leg.origin !== "EU")
    );
    
    if (itemsToFix.length === 0) {
      toast({ title: "Nenhum diploma com origem em falta" });
      return;
    }
    
    setIsFixingOrigin(true);
    
    try {
      let fixedCount = 0;
      const errors: string[] = [];
      
      for (const item of itemsToFix) {
        // Infer origin from number pattern or title
        let inferredOrigin: string | null = null;
        
        // Check if it's EU legislation
        const euPatterns = [
          /^(Regulamento|Directiva|Diretiva|Decisão|Recomendação)/i,
          /\(UE\)/i,
          /\(CE\)/i,
          /CELEX/i,
        ];
        
        const isEU = euPatterns.some(p => p.test(item.title) || p.test(item.number));
        
        if (isEU) {
          inferredOrigin = "EU";
        } else {
          // Portuguese patterns
          const ptPatterns = [
            /^(Decreto-Lei|Portaria|Lei|Despacho|Resolução|Aviso|Declaração)/i,
            /\/\d{2,4}$/,  // Ends with /YY or /YYYY
          ];
          
          const isPT = ptPatterns.some(p => p.test(item.title) || p.test(item.number));
          if (isPT) {
            inferredOrigin = "PT";
          }
        }
        
        if (inferredOrigin) {
          const { error } = await supabase
            .from("legislation")
            .update({ origin: inferredOrigin })
            .eq("id", item.id);
          
          if (error) {
            errors.push(`${item.number}: ${error.message}`);
          } else {
            fixedCount++;
          }
        }
      }
      
      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });

      toast({
        title: "Correção de origem concluída",
        description: `${fixedCount} de ${itemsToFix.length} diplomas corrigidos${errors.length > 0 ? `. ${errors.length} falhas.` : "."}`,
        variant: errors.length > 0 ? "destructive" : "default",
      });
    } catch (error) {
      console.error("Fix origin error:", error);
      toast({
        title: "Erro ao corrigir origem",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsFixingOrigin(false);
    }
  };

  // Fix missing dates - reimport from DRE/EUR-Lex
  const fixMissingDates = async () => {
    if (!legislation) return;
    
    const itemsToFix = legislation.filter(leg => 
      !leg.publication_date || !leg.effective_date
    );
    
    if (itemsToFix.length === 0) {
      toast({ title: "Nenhum diploma com datas em falta" });
      return;
    }
    
    setIsFixingMissingDates(true);
    
    try {
      // Use the complete-auto-imported function to reimport metadata
      const { data, error } = await supabase.functions.invoke("complete-auto-imported-legislation", {
        body: { 
          limit: Math.min(itemsToFix.length, 50),
          dryRun: false,
          includePT: true,
          includeEU: true,
          fixDates: true,
        },
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
      queryClient.invalidateQueries({ queryKey: ["sync-logs"] });

      toast({
        title: "Correção de datas iniciada",
        description: `Reimportação em curso para ${data.processed || itemsToFix.length} diplomas.`,
      });
    } catch (error) {
      console.error("Fix missing dates error:", error);
      toast({
        title: "Erro ao corrigir datas",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsFixingMissingDates(false);
    }
  };

  // Fix invalid dates - correct year from number
  const fixInvalidDates = async () => {
    if (!legislation) return;
    
    const currentYear = new Date().getFullYear();
    
    const isInvalidDate = (dateStr: string | null | undefined): boolean => {
      if (!dateStr) return false;
      try {
        const year = new Date(dateStr).getFullYear();
        return year > currentYear + 1 || year < 1900;
      } catch {
        return false;
      }
    };
    
    const itemsToFix = legislation.filter(leg => 
      isInvalidDate(leg.publication_date) || isInvalidDate(leg.effective_date)
    );
    
    if (itemsToFix.length === 0) {
      toast({ title: "Nenhum diploma com datas inválidas" });
      return;
    }
    
    setIsFixingInvalidDates(true);
    
    try {
      let fixedCount = 0;
      const errors: string[] = [];

      for (const leg of itemsToFix) {
        try {
          // Try to extract year from number field
          const yearMatch = leg.number?.match(/(?:^|\s|\/|\()(\d{4})(?:\/|\s|$)/);
          let inferredYear: number | null = null;
          
          if (yearMatch) {
            const year = parseInt(yearMatch[1], 10);
            if (year >= 1900 && year <= currentYear + 1) {
              inferredYear = year;
            }
          }

          const updates: { publication_date?: string | null; effective_date?: string | null } = {};
          
          // Check publication_date
          if (leg.publication_date) {
            const pubYear = new Date(leg.publication_date).getFullYear();
            if (pubYear > currentYear + 1 || pubYear < 1900) {
              if (inferredYear) {
                updates.publication_date = `${inferredYear}-01-01`;
              } else {
                updates.publication_date = null;
              }
            }
          }

          // Check effective_date
          if (leg.effective_date) {
            const effYear = new Date(leg.effective_date).getFullYear();
            if (effYear > currentYear + 1 || effYear < 1900) {
              if (inferredYear) {
                updates.effective_date = `${inferredYear}-01-01`;
              } else {
                updates.effective_date = null;
              }
            }
          }

          if (Object.keys(updates).length > 0) {
            const { error: updateError } = await supabase
              .from("legislation")
              .update(updates)
              .eq("id", leg.id);

            if (updateError) {
              errors.push(`${leg.number}: ${updateError.message}`);
            } else {
              fixedCount++;
            }
          }
        } catch (e) {
          errors.push(`${leg.number}: ${e instanceof Error ? e.message : "Erro"}`);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });

      toast({
        title: "Correção de datas concluída",
        description: `${fixedCount} de ${itemsToFix.length} diplomas corrigidos${errors.length > 0 ? `. ${errors.length} falhas.` : "."}`,
        variant: errors.length > 0 ? "destructive" : "default",
      });
    } catch (error) {
      console.error("Fix invalid dates error:", error);
      toast({
        title: "Erro ao corrigir datas",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsFixingInvalidDates(false);
    }
  };

  // Execute fix based on type
  const executeFix = async (type: FixType) => {
    switch (type) {
      case "generic_title":
        return fixGenericTitles();
      case "missing_origin":
        return fixMissingOrigin();
      case "missing_dates":
        return fixMissingDates();
      case "invalid_dates":
        return fixInvalidDates();
    }
  };

  return {
    isFixing,
    isFixingGenericTitles,
    isFixingOrigin,
    isFixingMissingDates,
    isFixingInvalidDates,
    executeFix,
    fixGenericTitles,
    fixMissingOrigin,
    fixMissingDates,
    fixInvalidDates,
  };
}
