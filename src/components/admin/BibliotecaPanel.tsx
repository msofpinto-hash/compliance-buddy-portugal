import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Database, Brain, Clock } from "lucide-react";
import { LegislationPanel } from "./LegislationPanel";
import { DataQualityPanel } from "./DataQualityPanel";
import { RequirementsExtractionPanel } from "./RequirementsExtractionPanel";
import { CronJobsMonitorPanel } from "./CronJobsMonitorPanel";
import { ActiveJobsBanner } from "./ActiveJobsBanner";

export function BibliotecaPanel() {
  const [activeSubTab, setActiveSubTab] = useState("legislacao");

  return (
    <div className="space-y-4">
      {/* Banner de jobs activos no topo - visível em todas as sub-tabs */}
      <ActiveJobsBanner />

      {/* Sub-tabs internas */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="legislacao" className="gap-2">
            <FileText className="h-4 w-4" />
            Legislação
          </TabsTrigger>
          <TabsTrigger value="qualidade" className="gap-2">
            <Database className="h-4 w-4" />
            Qualidade
          </TabsTrigger>
          <TabsTrigger value="extracao" className="gap-2">
            <Brain className="h-4 w-4" />
            Extração IA
          </TabsTrigger>
          <TabsTrigger value="cron" className="gap-2">
            <Clock className="h-4 w-4" />
            Cron Jobs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="legislacao" className="mt-0">
          <LegislationPanelWithoutBanner />
        </TabsContent>

        <TabsContent value="qualidade" className="mt-0">
          <DataQualityPanel />
        </TabsContent>

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

// Versão do LegislationPanel sem o ActiveJobsBanner (já está no topo)
function LegislationPanelWithoutBanner() {
  return <LegislationPanel hideBanner />;
}
