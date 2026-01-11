import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Palette, Settings, FileText, Building2, Users, Brain, ClipboardCheck, ListTodo, Database, FolderOpen, Eye, ShieldCheck, Clock } from "lucide-react";
import { SyncPanel } from "@/components/admin/SyncPanel";
import { ThemesPanel } from "@/components/admin/ThemesPanel";
import { LegislationPanel } from "@/components/admin/LegislationPanel";
import { ClientsPanel } from "@/components/admin/ClientsPanel";
import { UsersApprovalPanel } from "@/components/admin/UsersApprovalPanel";
import { RequirementsExtractionPanel } from "@/components/admin/RequirementsExtractionPanel";
import { AuditsPanel } from "@/components/admin/AuditsPanel";
import { ActionPlansPanel } from "@/components/admin/ActionPlansPanel";
import { AlertsNotificationBell } from "@/components/admin/AlertsNotificationBell";
import { DataQualityPanel } from "@/components/admin/DataQualityPanel";
import { EvidenceTemplatesPanel } from "@/components/admin/EvidenceTemplatesPanel";
import { EvidenceReviewPanel } from "@/components/admin/EvidenceReviewPanel";
import { ComplianceRequestsPanel } from "@/components/admin/ComplianceRequestsPanel";
import { CronJobsMonitorPanel } from "@/components/admin/CronJobsMonitorPanel";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";

const validTabs = ["quality", "cron", "legislation", "requirements", "audits", "actions", "evidence", "review", "compliance", "clients", "users", "sync", "themes"];

const Admin = () => {
  const { user, signOut } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : "quality"
  );

  useEffect(() => {
    if (tabFromUrl && validTabs.includes(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value });
  };

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
            <AlertsNotificationBell />
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
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <div className="relative z-10">
            <TabsList className="flex h-auto flex-wrap gap-1 bg-muted p-1 w-full max-w-7xl">
              <TabsTrigger value="quality" className="gap-2 flex-shrink-0">
                <Database className="h-4 w-4" />
                <span className="hidden sm:inline">Qualidade</span>
              </TabsTrigger>
              <TabsTrigger value="cron" className="gap-2 flex-shrink-0">
                <Clock className="h-4 w-4" />
                <span className="hidden sm:inline">Cron Jobs</span>
              </TabsTrigger>
              <TabsTrigger value="legislation" className="gap-2 flex-shrink-0">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Legislação</span>
              </TabsTrigger>
              <TabsTrigger value="requirements" className="gap-2 flex-shrink-0">
                <Brain className="h-4 w-4" />
                <span className="hidden sm:inline">Requisitos</span>
              </TabsTrigger>
              <TabsTrigger value="audits" className="gap-2 flex-shrink-0">
                <ClipboardCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Auditorias</span>
              </TabsTrigger>
              <TabsTrigger value="actions" className="gap-2 flex-shrink-0">
                <ListTodo className="h-4 w-4" />
                <span className="hidden sm:inline">Ações</span>
              </TabsTrigger>
              <TabsTrigger value="evidence" className="gap-2 flex-shrink-0">
                <FolderOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Evidências</span>
              </TabsTrigger>
              <TabsTrigger value="review" className="gap-2 flex-shrink-0">
                <Eye className="h-4 w-4" />
                <span className="hidden sm:inline">Revisão</span>
              </TabsTrigger>
              <TabsTrigger value="compliance" className="gap-2 flex-shrink-0">
                <ShieldCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Compliance</span>
              </TabsTrigger>
              <TabsTrigger value="clients" className="gap-2 flex-shrink-0">
                <Building2 className="h-4 w-4" />
                <span className="hidden sm:inline">Clientes</span>
              </TabsTrigger>
              <TabsTrigger value="users" className="gap-2 flex-shrink-0">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Utilizadores</span>
              </TabsTrigger>
              <TabsTrigger value="sync" className="gap-2 flex-shrink-0">
                <RefreshCw className="h-4 w-4" />
                <span className="hidden sm:inline">Sync</span>
              </TabsTrigger>
              <TabsTrigger value="themes" className="gap-2 flex-shrink-0">
                <Palette className="h-4 w-4" />
                <span className="hidden sm:inline">Temas</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="quality">
            <DataQualityPanel />
          </TabsContent>

          <TabsContent value="cron">
            <CronJobsMonitorPanel />
          </TabsContent>

          <TabsContent value="legislation">
            <LegislationPanel />
          </TabsContent>

          <TabsContent value="requirements">
            <RequirementsExtractionPanel />
          </TabsContent>

          <TabsContent value="audits">
            <AuditsPanel />
          </TabsContent>

          <TabsContent value="actions">
            <ActionPlansPanel />
          </TabsContent>

          <TabsContent value="evidence">
            <EvidenceTemplatesPanel />
          </TabsContent>

          <TabsContent value="review">
            <EvidenceReviewPanel />
          </TabsContent>

          <TabsContent value="compliance">
            <ComplianceRequestsPanel />
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
