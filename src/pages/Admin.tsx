import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Building2, Users, ClipboardCheck, ListTodo, FolderOpen, Eye, ShieldCheck, BookOpen } from "lucide-react";
import { BibliotecaPanel } from "@/components/admin/BibliotecaPanel";
import { ClientsPanel } from "@/components/admin/ClientsPanel";
import { UsersApprovalPanel } from "@/components/admin/UsersApprovalPanel";
import { AuditsPanel } from "@/components/admin/AuditsPanel";
import { ActionPlansPanel } from "@/components/admin/ActionPlansPanel";
import { AlertsNotificationBell } from "@/components/admin/AlertsNotificationBell";
import { EvidenceTemplatesPanel } from "@/components/admin/EvidenceTemplatesPanel";
import { EvidenceReviewPanel } from "@/components/admin/EvidenceReviewPanel";
import { ComplianceRequestsPanel } from "@/components/admin/ComplianceRequestsPanel";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { useBackgroundJobNotifications } from "@/hooks/useBackgroundJobNotifications";

const validTabs = ["biblioteca", "audits", "actions", "evidence", "review", "compliance", "clients", "users"];

const Admin = () => {
  const { user, signOut } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(
    tabFromUrl && validTabs.includes(tabFromUrl) ? tabFromUrl : "biblioteca"
  );

  // Enable background job notifications
  useBackgroundJobNotifications();

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
    <div className="min-h-screen bg-gradient-to-br from-amber-50/80 via-orange-50/60 to-stone-50/70 dark:from-stone-900/95 dark:via-amber-950/40 dark:to-orange-950/30">
      {/* Header */}
      <header className="border-b border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-r from-white/95 via-amber-50/80 to-orange-50/60 dark:from-stone-900/95 dark:via-amber-950/50 dark:to-orange-950/40 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-stone-800 dark:text-stone-100">Administração</h1>
                <p className="text-sm text-amber-700/70 dark:text-amber-400/70">{user?.email}</p>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <AlertsNotificationBell />
            <LogoutConfirmDialog 
              onConfirm={signOut} 
              variant="ghost" 
              size="sm" 
              className="gap-2 text-stone-600 dark:text-stone-400 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/30"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <div className="relative z-10">
            <TabsList className="flex h-auto flex-wrap gap-1 bg-gradient-to-r from-amber-100/80 via-orange-100/60 to-yellow-100/50 dark:from-amber-900/40 dark:via-orange-900/30 dark:to-yellow-900/25 border border-amber-200/60 dark:border-amber-800/40 p-1.5 w-full max-w-7xl">
              <TabsTrigger value="biblioteca" className="gap-2 flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-amber-500/25">
                <BookOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Biblioteca</span>
              </TabsTrigger>
              <TabsTrigger value="audits" className="gap-2 flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-amber-500/25">
                <ClipboardCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Auditorias</span>
              </TabsTrigger>
              <TabsTrigger value="actions" className="gap-2 flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-amber-500/25">
                <ListTodo className="h-4 w-4" />
                <span className="hidden sm:inline">Ações</span>
              </TabsTrigger>
              <TabsTrigger value="evidence" className="gap-2 flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-amber-500/25">
                <FolderOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Evidências</span>
              </TabsTrigger>
              <TabsTrigger value="review" className="gap-2 flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-amber-500/25">
                <Eye className="h-4 w-4" />
                <span className="hidden sm:inline">Revisão</span>
              </TabsTrigger>
              <TabsTrigger value="compliance" className="gap-2 flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-amber-500/25">
                <ShieldCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Compliance</span>
              </TabsTrigger>
              <TabsTrigger value="clients" className="gap-2 flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-amber-500/25">
                <Building2 className="h-4 w-4" />
                <span className="hidden sm:inline">Clientes</span>
              </TabsTrigger>
              <TabsTrigger value="users" className="gap-2 flex-shrink-0 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-amber-500/25">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Utilizadores</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="biblioteca">
            <BibliotecaPanel />
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
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
