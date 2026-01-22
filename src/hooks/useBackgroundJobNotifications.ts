import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface SyncLog {
  id: string;
  sync_type: string;
  status: string;
  items_processed: number | null;
  items_added: number | null;
  error_message: string | null;
  completed_at: string | null;
}

const SYNC_TYPE_LABELS: Record<string, string> = {
  "bulk-suggest-categories": "Sugestões de Categorias (IA)",
  "extract-requirements-background": "Extração de Requisitos",
  "auto-categorize": "Categorização Automática",
  "reimport-dre-metadata": "Reimportação de Metadados DRE",
  "dre-sync": "Sincronização DRE",
  "eurlex-sync": "Sincronização EUR-Lex",
  "pdf-import": "Importação de PDF",
  "fix_pdf_import": "Correção de Dados PDF",
  "fix_missing_dates": "Correção de Datas",
  "complete_auto_imported": "Completar Metadados",
  "cleanup-duplicate-legislation": "Limpeza de Duplicados",
  "cleanup_duplicates": "Limpeza de Duplicados",
};

export function useBackgroundJobNotifications() {
  const queryClient = useQueryClient();
  const notifiedJobsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Subscribe to sync_logs updates
    const channel = supabase
      .channel("background-jobs-notifications")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "sync_logs",
        },
        (payload) => {
          const data = payload.new as SyncLog;
          
          // Only notify once per job completion
          if (data.status === "completed" && !notifiedJobsRef.current.has(data.id)) {
            notifiedJobsRef.current.add(data.id);
            
            const label = SYNC_TYPE_LABELS[data.sync_type] || data.sync_type;
            const message = data.items_added 
              ? `${label}: ${data.items_added} item(s) processado(s)`
              : `${label} concluído`;
            
            toast.success(message, {
              duration: 8000,
              action: data.error_message ? {
                label: "Ver detalhes",
                onClick: () => {
                  toast.info(data.error_message || "Sem detalhes adicionais");
                },
              } : undefined,
            });

            // Invalidate relevant queries
            if (data.sync_type === "bulk-suggest-categories" || data.sync_type === "auto-categorize") {
              queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
            }
            if (data.sync_type === "extract-requirements-background") {
              queryClient.invalidateQueries({ queryKey: ["legal-requirements"] });
            }
          }
        }
      )
      .subscribe();

    // Clean up old notified jobs periodically
    const cleanupInterval = setInterval(() => {
      if (notifiedJobsRef.current.size > 100) {
        notifiedJobsRef.current.clear();
      }
    }, 60000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(cleanupInterval);
    };
  }, [queryClient]);
}
