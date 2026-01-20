import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Database, Bot, Clock } from "lucide-react";
import { DataQualityConsolidatedPanel } from "./DataQualityConsolidatedPanel";
import { RequirementsExtractionPanel } from "./RequirementsExtractionPanel";
import { CronJobsMonitorPanel } from "./CronJobsMonitorPanel";

export function OperationsPanel() {
  const [activeTab, setActiveTab] = useState("qualidade");

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex flex-wrap gap-1 bg-stone-100/80 dark:bg-stone-800/50 border border-stone-200/60 dark:border-stone-700/40">
          <TabsTrigger value="qualidade" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
            <Database className="h-3.5 w-3.5" />
            Qualidade de Dados
          </TabsTrigger>
          <TabsTrigger value="ia" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
            <Bot className="h-3.5 w-3.5" />
            Extração IA
          </TabsTrigger>
          <TabsTrigger value="cron" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
            <Clock className="h-3.5 w-3.5" />
            Cron Jobs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="qualidade" className="mt-0">
          <DataQualityConsolidatedPanel />
        </TabsContent>

        <TabsContent value="ia" className="mt-0">
          <RequirementsExtractionPanel />
        </TabsContent>

        <TabsContent value="cron" className="mt-0">
          <CronJobsMonitorPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
