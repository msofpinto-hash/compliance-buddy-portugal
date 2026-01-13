import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type FixIncompletesJob = {
  id: string;
  sync_type: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  items_processed: number | null;
  items_added: number | null;
  items_updated: number | null;
  error_message: string | null;
} | null;

const QUERY_KEY = ["fix-incompletes-job"] as const;
const SYNC_TYPE = "fix-incomplete-requirements";

export function useFixIncompletesJob() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_logs")
        .select("*")
        .eq("sync_type", SYNC_TYPE)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data as FixIncompletesJob) ?? null;
    },
    refetchInterval: (q) => {
      const job = q.state.data as FixIncompletesJob;
      return job?.status === "running" ? 3000 : false;
    },
  });

  // Realtime updates for INSERT/UPDATE so the UI reacts instantly.
  useEffect(() => {
    const channel = supabase
      .channel("realtime-fix-incompletes-job")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sync_logs",
          filter: `sync_type=eq.${SYNC_TYPE}`,
        },
        (payload) => {
          const next = (payload.new ?? null) as FixIncompletesJob;
          if (!next) return;

          queryClient.setQueryData(QUERY_KEY, (prev: FixIncompletesJob) => {
            if (!prev) return next;

            // Keep the most recent job by started_at.
            const prevTs = new Date(prev.started_at).getTime();
            const nextTs = new Date(next.started_at).getTime();
            return nextTs >= prevTs ? next : prev;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}
