import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SyncLog {
  id: string;
  sync_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  items_processed: number | null;
  items_added: number | null;
  items_updated: number | null;
  error_message: string | null;
  created_by: string | null;
}

export function useSyncLogs() {
  return useQuery({
    queryKey: ["sync-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_logs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as SyncLog[];
    },
  });
}

export function useTriggerSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { syncType?: string; themeId?: string; source?: string }) => {
      const functionName = params.source === 'eurlex' ? 'sync-eurlex' : 'sync-dre';
      
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: params,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-logs"] });
      queryClient.invalidateQueries({ queryKey: ["legislation"] });
      queryClient.invalidateQueries({ queryKey: ["legislation-with-categories"] });
    },
  });
}
