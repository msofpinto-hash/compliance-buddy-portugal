import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, Clock } from "lucide-react";
import { RequirementsExtractionPanel } from "./RequirementsExtractionPanel";
import { CronJobsMonitorPanel } from "./CronJobsMonitorPanel";

export function AutomationPanel() {
  const [activeTab, setActiveTab] = useState("extracao");

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/50 border">
          <TabsTrigger value="extracao" className="gap-2 text-xs sm:text-sm">
            <Brain className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Extração IA</span>
            <span className="sm:hidden">IA</span>
          </TabsTrigger>
          <TabsTrigger value="cron" className="gap-2 text-xs sm:text-sm">
            <Clock className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Cron Jobs</span>
            <span className="sm:hidden">Cron</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="extracao" className="mt-0">
          <RequirementsExtractionPanel />
        </TabsContent>

        <TabsContent value="cron" className="mt-0">
          <CronJobsMonitorPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
