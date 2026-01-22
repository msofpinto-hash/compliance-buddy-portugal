import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Building2, Users, BookOpen } from "lucide-react";
import { BibliotecaPanel } from "@/components/admin/BibliotecaPanel";
import { ClientsPanel } from "@/components/admin/ClientsPanel";
import { UsersApprovalPanel } from "@/components/admin/UsersApprovalPanel";
import { AlertsNotificationBell } from "@/components/admin/AlertsNotificationBell";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { useBackgroundJobNotifications } from "@/hooks/useBackgroundJobNotifications";

const validTabs = ["biblioteca", "clients", "users"];

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
      {/* Header - Mobile optimized */}
      <header className="sticky top-0 z-20 border-b border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-r from-white/95 via-amber-50/80 to-orange-50/60 dark:from-stone-900/95 dark:via-amber-950/50 dark:to-orange-950/40 backdrop-blur-sm">
        <div className="container mx-auto flex items-center justify-between px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link to="/" className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25 shrink-0">
                <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-semibold text-stone-800 dark:text-stone-100 truncate">Administração</h1>
                <p className="text-xs sm:text-sm text-amber-700/70 dark:text-amber-400/70 truncate hidden sm:block">{user?.email}</p>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <AlertsNotificationBell />
            <LogoutConfirmDialog 
              onConfirm={signOut} 
              variant="ghost" 
              size="sm" 
              className="gap-1 sm:gap-2 text-stone-600 dark:text-stone-400 hover:text-amber-700 dark:hover:text-amber-400 hover:bg-amber-100/50 dark:hover:bg-amber-900/30 px-2 sm:px-3"
            />
          </div>
        </div>
      </header>

      {/* Main Content - Mobile optimized */}
      <main className="container mx-auto px-2 py-3 sm:px-4 sm:py-6">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4 sm:space-y-6">
          <div className="relative z-10 overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
            <TabsList className="inline-flex h-auto gap-0.5 sm:gap-1 bg-gradient-to-r from-amber-100/80 via-orange-100/60 to-yellow-100/50 dark:from-amber-900/40 dark:via-orange-900/30 dark:to-yellow-900/25 border border-amber-200/60 dark:border-amber-800/40 p-1 sm:p-1.5 w-full sm:w-fit">
              <TabsTrigger value="biblioteca" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-amber-500/25">
                <BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline sm:inline">Biblioteca</span>
                <span className="xs:hidden">Bib.</span>
              </TabsTrigger>
              <TabsTrigger value="clients" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-amber-500/25">
                <Building2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline sm:inline">Clientes</span>
                <span className="xs:hidden">Cli.</span>
              </TabsTrigger>
              <TabsTrigger value="users" className="flex-1 sm:flex-none gap-1 sm:gap-2 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-amber-500/25">
                <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline sm:inline">Utilizadores</span>
                <span className="xs:hidden">Users</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="biblioteca">
            <BibliotecaPanel />
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
