import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Download, Wrench, Palette, Loader2 } from "lucide-react";
import { LegislationPanel } from "./LegislationPanel";
import { ThemesPanel } from "./ThemesPanel";
import { ImportPanel } from "./ImportPanel";
import { DataFixPanel } from "./DataFixPanel";
import { JobsStatsPanel } from "./JobsStatsPanel";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function BibliotecaPanel() {
  const [activeSubTab, setActiveSubTab] = useState("legislacao");

  // Global query for running jobs - visible across all tabs
  const { data: runningJobsCount } = useQuery({
    queryKey: ["global-running-jobs-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sync_logs")
        .select("id", { count: "exact", head: true })
        .eq("status", "running");
      
      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 3000,
  });

  const hasRunningJobs = (runningJobsCount ?? 0) > 0;

  return (
    <div className="space-y-4">
      {/* Global running jobs indicator */}
      {hasRunningJobs && activeSubTab !== "correcao" && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <span className="text-blue-700 dark:text-blue-300">
            <strong>{runningJobsCount}</strong> job(s) a correr em segundo plano
          </span>
          <button 
            onClick={() => setActiveSubTab("correcao")}
            className="ml-auto text-blue-600 hover:underline text-xs"
          >
            Ver detalhes →
          </button>
        </div>
      )}

      <JobsStatsPanel />

      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-3 sm:space-y-4">
        <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
          <TabsList className="inline-flex w-full sm:w-auto gap-0.5 sm:gap-1 bg-gradient-to-r from-amber-100/70 via-orange-100/50 to-yellow-100/40 dark:from-amber-900/35 dark:via-orange-900/25 dark:to-yellow-900/20 border border-amber-200/50 dark:border-amber-800/35 p-1 sm:p-1.5">
            <TabsTrigger value="legislacao" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
              <BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Legislação</span>
              <span className="sm:hidden">Leg.</span>
            </TabsTrigger>
            <TabsTrigger value="importacao" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
              <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Importação</span>
              <span className="sm:hidden">Imp.</span>
            </TabsTrigger>
            <TabsTrigger value="correcao" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
              <Wrench className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Correção</span>
              <span className="sm:hidden">Fix</span>
              {hasRunningJobs && (
                <Badge variant="secondary" className="ml-0.5 sm:ml-1 h-4 sm:h-5 px-1 sm:px-1.5 bg-blue-500 text-white text-[10px] sm:text-xs animate-pulse">
                  {runningJobsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="temas" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
              <Palette className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Temas</span>
              <span className="sm:hidden">Temas</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="legislacao" className="mt-0">
          <LegislationPanel hideBanner />
        </TabsContent>

        <TabsContent value="importacao" className="mt-0">
          <ImportPanel />
        </TabsContent>

        <TabsContent value="correcao" className="mt-0">
          <DataFixPanel />
        </TabsContent>

        <TabsContent value="temas" className="mt-0">
          <ThemesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
