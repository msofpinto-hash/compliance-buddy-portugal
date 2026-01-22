import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Download, Wrench, Palette } from "lucide-react";
import { LegislationPanel } from "./LegislationPanel";
import { ThemesPanel } from "./ThemesPanel";
import { ImportPanel } from "./ImportPanel";
import { DataFixPanel } from "./DataFixPanel";

export function BibliotecaPanel() {
  const [activeSubTab, setActiveSubTab] = useState("legislacao");

  return (
    <div className="space-y-4">
      {/* Sub-tabs simplificadas: Legislação, Importação, Correção, Temas */}
      <Tabs value={activeSubTab} onValueChange={setActiveSubTab} className="space-y-4">
        <TabsList className="flex flex-wrap gap-1 bg-gradient-to-r from-amber-100/70 via-orange-100/50 to-yellow-100/40 dark:from-amber-900/35 dark:via-orange-900/25 dark:to-yellow-900/20 border border-amber-200/50 dark:border-amber-800/35">
          <TabsTrigger value="legislacao" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
            <BookOpen className="h-4 w-4" />
            Legislação
          </TabsTrigger>
          <TabsTrigger value="importacao" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
            <Download className="h-4 w-4" />
            Importação
          </TabsTrigger>
          <TabsTrigger value="correcao" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
            <Wrench className="h-4 w-4" />
            Correção de Dados
          </TabsTrigger>
          <TabsTrigger value="temas" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white">
            <Palette className="h-4 w-4" />
            Temas
          </TabsTrigger>
        </TabsList>

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
