import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Download, Wrench, Palette, Loader2, FolderTree } from "lucide-react";
import { LegislationPanel } from "./LegislationPanel";
import { ThemesPanel } from "./ThemesPanel";
import { ImportPanel } from "./ImportPanel";
import { DataFixPanel } from "./DataFixPanel";
import { CategoryManagementPanel } from "./CategoryManagementPanel";
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

      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
        <TabsList className="flex flex-wrap gap-1 bg-gradient-to-r from-amber-100/70 via-orange-100/50 to-yellow-100/40 dark:from-amber-900/35 dark:via-orange-900/25 dark:to-yellow-900/20 border border-amber-200/50 dark:border-amber-800/35">
          <TabsTrigger value="legislacao" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
            <BookOpen className="h-4 w-4" />
            Legislação
          </TabsTrigger>
          <TabsTrigger value="categorias" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
            <FolderTree className="h-4 w-4" />
            Categorias
          </TabsTrigger>
          <TabsTrigger value="importacao" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
            <Download className="h-4 w-4" />
            Importação
          </TabsTrigger>
          <TabsTrigger value="correcao" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
            <Wrench className="h-4 w-4" />
            Correção de Dados
            {hasRunningJobs && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 bg-blue-500 text-white text-xs animate-pulse">
                {runningJobsCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="temas" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
            <Palette className="h-4 w-4" />
            Temas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="legislacao" className="mt-0">
          <LegislationPanel hideBanner />
        </TabsContent>

        <TabsContent value="categorias" className="mt-0">
          <CategoryManagementPanel />
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
