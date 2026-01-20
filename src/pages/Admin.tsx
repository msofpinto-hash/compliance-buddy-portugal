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
            <TabsList className="flex h-auto gap-1 bg-gradient-to-r from-amber-100/80 via-orange-100/60 to-yellow-100/50 dark:from-amber-900/40 dark:via-orange-900/30 dark:to-yellow-900/25 border border-amber-200/60 dark:border-amber-800/40 p-1.5 w-fit">
              <TabsTrigger value="biblioteca" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-amber-500/25">
                <BookOpen className="h-4 w-4" />
                <span>Biblioteca</span>
              </TabsTrigger>
              <TabsTrigger value="clients" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-amber-500/25">
                <Building2 className="h-4 w-4" />
                <span>Clientes</span>
              </TabsTrigger>
              <TabsTrigger value="users" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-amber-500/25">
                <Users className="h-4 w-4" />
                <span>Utilizadores</span>
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
