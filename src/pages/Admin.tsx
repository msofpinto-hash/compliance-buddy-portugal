import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Palette, Settings } from "lucide-react";
import { SyncPanel } from "@/components/admin/SyncPanel";
import { ThemesPanel } from "@/components/admin/ThemesPanel";

const Admin = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Administração</h1>
              <p className="text-sm text-muted-foreground">Gestão de sincronização e temas</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="sync" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="sync" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Sincronização
            </TabsTrigger>
            <TabsTrigger value="themes" className="gap-2">
              <Palette className="h-4 w-4" />
              Temas
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sync">
            <SyncPanel />
          </TabsContent>

          <TabsContent value="themes">
            <ThemesPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
