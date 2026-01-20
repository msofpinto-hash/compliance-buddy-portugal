import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Settings2, RefreshCw, Palette } from "lucide-react";
import { LegislationPanel } from "./LegislationPanel";
import { OperationsPanel } from "./OperationsPanel";
import { SyncPanelWithExtras } from "./SyncPanelWithExtras";
import { ThemesPanel } from "./ThemesPanel";
import { ActiveJobsBanner } from "./ActiveJobsBanner";

export function BibliotecaPanel() {
  const [activeSubTab, setActiveSubTab] = useState("legislacao");

  return (
    <div className="space-y-4">
      {/* Banner de jobs activos no topo - visível em todas as sub-tabs */}
      <ActiveJobsBanner />

      {/* Sub-tabs internas - 4 grupos: Legislação, Operações, Sync, Temas */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
        <TabsList className="flex flex-wrap gap-1 bg-gradient-to-r from-amber-100/70 via-orange-100/50 to-yellow-100/40 dark:from-amber-900/35 dark:via-orange-900/25 dark:to-yellow-900/20 border border-amber-200/50 dark:border-amber-800/35">
          <TabsTrigger value="legislacao" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
            <FileText className="h-4 w-4" />
            Legislação
          </TabsTrigger>
          <TabsTrigger value="operacoes" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
            <Settings2 className="h-4 w-4" />
            Qualidade
          </TabsTrigger>
          <TabsTrigger value="sync" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
            <RefreshCw className="h-4 w-4" />
            Sync
          </TabsTrigger>
          <TabsTrigger value="temas" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
            <Palette className="h-4 w-4" />
            Temas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="legislacao" className="mt-0">
          <LegislationPanelWithoutBanner />
        </TabsContent>

        <TabsContent value="operacoes" className="mt-0">
          <OperationsPanel />
        </TabsContent>

        <TabsContent value="sync" className="mt-0">
          <SyncPanelWithExtras />
        </TabsContent>

        <TabsContent value="temas" className="mt-0">
          <ThemesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Versão do LegislationPanel sem o ActiveJobsBanner (já está no topo)
function LegislationPanelWithoutBanner() {
  return <LegislationPanel hideBanner />;
}
