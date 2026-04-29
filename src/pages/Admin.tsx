import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Building2, Users, BookOpen, Upload } from "lucide-react";
import { BibliotecaPanel } from "@/components/admin/BibliotecaPanel";
import { ClientsPanel } from "@/components/admin/ClientsPanel";
import { UsersApprovalPanel } from "@/components/admin/UsersApprovalPanel";
import { UploadLegislationPanel } from "@/components/admin/UploadLegislationPanel";
import { UploadHistoryPanel } from "@/components/admin/UploadHistoryPanel";
import { RevalidateDreUrlsPanel } from "@/components/admin/RevalidateDreUrlsPanel";
import { DreUrlValidationExplorer } from "@/components/admin/DreUrlValidationExplorer";
import { ConfirmUrlFixesPanel } from "@/components/admin/ConfirmUrlFixesPanel";
import { ApplyUrlFixesHistoryPanel } from "@/components/admin/ApplyUrlFixesHistoryPanel";
import { InvalidUrlsTable } from "@/components/admin/InvalidUrlsTable";
import { AlertsNotificationBell } from "@/components/admin/AlertsNotificationBell";
import { SourceStatusBanner } from "@/components/admin/SourceStatusBanner";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { useBackgroundJobNotifications } from "@/hooks/useBackgroundJobNotifications";

const validTabs = ["biblioteca", "carregar", "clients", "users"];

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link to="/" className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm shrink-0">
                <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-semibold text-foreground truncate font-heading">Administração</h1>
                <p className="text-xs sm:text-sm text-muted-foreground truncate hidden sm:block">{user?.email}</p>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <AlertsNotificationBell />
            <LogoutConfirmDialog 
              onConfirm={signOut} 
              variant="ghost" 
              size="sm" 
              className="gap-1 sm:gap-2 text-muted-foreground hover:text-primary hover:bg-accent/50 px-2 sm:px-3"
            />
          </div>
        </div>
      </header>

      {/* Source status alert (DRE OpenData / fallback) */}
      <SourceStatusBanner />

      {/* Main Content */}
      <main className="container mx-auto px-2 py-3 sm:px-4 sm:py-6">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4 sm:space-y-6">
          <div className="relative z-10 overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
            <TabsList className="inline-flex h-auto gap-0.5 sm:gap-1 bg-secondary/30 border border-border p-1 sm:p-1.5 w-full sm:w-fit">
              <TabsTrigger value="biblioteca" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                <BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Biblioteca</span>
                <span className="sr-only sm:hidden">Biblioteca</span>
              </TabsTrigger>
              <TabsTrigger value="carregar" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Carregar</span>
                <span className="sr-only sm:hidden">Carregar</span>
              </TabsTrigger>
              <TabsTrigger value="clients" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Clientes</span>
                <span className="sr-only sm:hidden">Clientes</span>
              </TabsTrigger>
              <TabsTrigger value="users" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
                <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">Utilizadores</span>
                <span className="sr-only sm:hidden">Utilizadores</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="biblioteca">
            <BibliotecaPanel />
          </TabsContent>

          <TabsContent value="carregar" className="space-y-4">
            <UploadLegislationPanel />
            <ConfirmUrlFixesPanel />
            <ApplyUrlFixesHistoryPanel />
            <RevalidateDreUrlsPanel />
            <DreUrlValidationExplorer />
            <InvalidUrlsTable />
            <UploadHistoryPanel />
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
