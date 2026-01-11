import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Palette, Settings, FileText, Building2, Users, Brain } from "lucide-react";
import { SyncPanel } from "@/components/admin/SyncPanel";
import { ThemesPanel } from "@/components/admin/ThemesPanel";
import { LegislationPanel } from "@/components/admin/LegislationPanel";
import { ClientsPanel } from "@/components/admin/ClientsPanel";
import { UsersApprovalPanel } from "@/components/admin/UsersApprovalPanel";
import { RequirementsExtractionPanel } from "@/components/admin/RequirementsExtractionPanel";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";

const Admin = () => {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold">Administração</h1>
                <p className="text-sm text-muted-foreground">{user?.email}</p>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <LogoutConfirmDialog 
              onConfirm={signOut} 
              variant="ghost" 
              size="sm" 
              className="gap-2 text-muted-foreground"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="legislation" className="space-y-6">
          <TabsList className="grid w-full max-w-4xl grid-cols-6">
            <TabsTrigger value="legislation" className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Legislação</span>
            </TabsTrigger>
            <TabsTrigger value="requirements" className="gap-2">
              <Brain className="h-4 w-4" />
              <span className="hidden sm:inline">Requisitos</span>
            </TabsTrigger>
            <TabsTrigger value="clients" className="gap-2">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Clientes</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Utilizadores</span>
            </TabsTrigger>
            <TabsTrigger value="sync" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              <span className="hidden sm:inline">Sincronização</span>
            </TabsTrigger>
            <TabsTrigger value="themes" className="gap-2">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Temas</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="legislation">
            <LegislationPanel />
          </TabsContent>

          <TabsContent value="requirements">
            <RequirementsExtractionPanel />
          </TabsContent>

          <TabsContent value="clients">
            <ClientsPanel />
          </TabsContent>

          <TabsContent value="users">
            <UsersApprovalPanel />
          </TabsContent>

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
