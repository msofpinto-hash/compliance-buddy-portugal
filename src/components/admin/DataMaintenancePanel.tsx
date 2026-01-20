import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Database, Link, CalendarX } from "lucide-react";
import { DataQualityPanel } from "./DataQualityPanel";
import { UrlHealthPanel } from "./UrlHealthPanel";
import { DateAnomaliesPanel } from "./DateAnomaliesPanel";

export function DataMaintenancePanel() {
  const [activeTab, setActiveTab] = useState("qualidade");

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/50 border">
          <TabsTrigger value="qualidade" className="gap-2 text-xs sm:text-sm">
            <Database className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Qualidade</span>
            <span className="sm:hidden">Qualid.</span>
          </TabsTrigger>
          <TabsTrigger value="urls" className="gap-2 text-xs sm:text-sm">
            <Link className="h-3.5 w-3.5" />
            URLs
          </TabsTrigger>
          <TabsTrigger value="datas" className="gap-2 text-xs sm:text-sm">
            <CalendarX className="h-3.5 w-3.5" />
            Datas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="qualidade" className="mt-0">
          <DataQualityPanel />
        </TabsContent>

        <TabsContent value="urls" className="mt-0">
          <UrlHealthPanel />
        </TabsContent>

        <TabsContent value="datas" className="mt-0">
          <DateAnomaliesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
