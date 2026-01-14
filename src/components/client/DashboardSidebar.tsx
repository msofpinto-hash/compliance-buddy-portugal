import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { ClientAnimatedLogo } from "@/components/client/ClientBackgrounds";
import { 
  Settings, 
  HelpCircle, 
  User, 
  Gavel, 
  ClipboardList, 
  ClipboardCheck, 
  FolderOpen, 
  BarChart3 
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type ModuleType = 'legislacao' | 'planos_acao' | 'auditorias' | 'documentos' | 'indicadores';

type NavItem = {
  id: string;
  moduleKey?: ModuleType;
  label: string;
  icon: React.ElementType;
  href: string;
  count?: number;
  alwaysShow?: boolean;
};

const ALL_MODULES: NavItem[] = [
  { id: "legislacao", moduleKey: "legislacao", label: "Legislação", icon: Gavel, href: "/biblioteca", alwaysShow: true },
  { id: "planos_acao", moduleKey: "planos_acao", label: "Planos de Ação", icon: ClipboardList, href: "/dashboard?tab=actions" },
  { id: "auditorias", moduleKey: "auditorias", label: "Auditorias", icon: ClipboardCheck, href: "/dashboard?tab=audits" },
  { id: "documentos", moduleKey: "documentos", label: "Evidências Documentais", icon: FolderOpen, href: "/dashboard?tab=documents" },
  { id: "indicadores", moduleKey: "indicadores", label: "Indicadores", icon: BarChart3, href: "/dashboard?tab=indicators" },
];

interface DashboardSidebarProps {
  currentOrg?: {
    id: string;
    name: string;
    logo_url?: string;
  } | null;
  onCloseMobile?: () => void;
}

export function DashboardSidebar({ currentOrg, onCloseMobile }: DashboardSidebarProps) {
  const { user, signOut, isAdmin } = useAuth();
  const location = useLocation();

  // Fetch user's module permissions
  const { data: userModules } = useQuery({
    queryKey: ["user-modules", user?.id, currentOrg?.id],
    queryFn: async () => {
      if (!user?.id || !currentOrg?.id) return [];
      const { data, error } = await supabase
        .from("user_module_permissions")
        .select("module")
        .eq("user_id", user.id)
        .eq("organization_id", currentOrg.id);
      if (error) throw error;
      return data?.map(d => d.module as ModuleType) || [];
    },
    enabled: !!user?.id && !!currentOrg?.id,
  });

  // Filter navigation based on permissions (admins see all, clients see their modules)
  const navItems = ALL_MODULES.filter(item => {
    if (item.alwaysShow) return true;
    if (isAdmin) return true;
    if (!item.moduleKey) return true;
    return userModules?.includes(item.moduleKey);
  });

  const handleNavClick = () => {
    onCloseMobile?.();
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-white to-emerald-50/30 dark:from-slate-900 dark:to-emerald-950/20">
      {/* Logo/Org - Clickable to Dashboard */}
      <Link 
        to="/dashboard" 
        onClick={handleNavClick}
        className="p-4 border-b border-emerald-200/60 dark:border-emerald-900/30 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-colors cursor-pointer"
      >
        {currentOrg?.logo_url ? (
          <img 
            src={currentOrg.logo_url} 
            alt={currentOrg.name} 
            className="h-12 w-auto object-contain"
          />
        ) : (
          <div className="flex items-center gap-3">
            <ClientAnimatedLogo />
            <div className="flex flex-col">
              <span className="font-bold text-emerald-800 dark:text-emerald-100 leading-tight">I&D</span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 leading-tight font-medium tracking-wider">COMPLIANCE</span>
            </div>
          </div>
        )}
      </Link>

      {/* User Info */}
      <div className="p-4 border-b border-emerald-200/60 dark:border-emerald-900/30">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-emerald-100/80 dark:bg-emerald-500/15 border border-emerald-300/60 dark:border-emerald-500/25 flex items-center justify-center">
            <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              {user?.email?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-100 truncate">
              {user?.email?.split("@")[0]}
            </p>
            <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 truncate">
              {currentOrg?.name || ""}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-4">
        <nav className="px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href || 
              (location.pathname === "/biblioteca" && item.id === "legislacao") ||
              (location.pathname === "/dashboard" && location.search.includes(`tab=${item.id.replace("_", "-")}`));
            return (
              <Link
                key={item.id}
                to={item.href}
                onClick={handleNavClick}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive 
                    ? "bg-emerald-100/80 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-500/25" 
                    : "text-emerald-700/80 dark:text-emerald-200/80 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 hover:text-emerald-800 dark:hover:text-emerald-100"
                )}
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <Badge className={cn(
                    "ml-auto text-xs",
                    isActive 
                      ? "bg-emerald-200/80 dark:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border-0" 
                      : "bg-emerald-100/60 dark:bg-emerald-800/40 text-emerald-600 dark:text-emerald-300 border-0"
                  )}>
                    {item.count}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Admin link if admin */}
        {isAdmin && (
          <div className="px-3 mt-4 pt-4 border-t border-emerald-200/60 dark:border-emerald-900/30">
            <Link
              to="/admin"
              onClick={handleNavClick}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-emerald-700/80 dark:text-emerald-200/80 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 hover:text-emerald-800 dark:hover:text-emerald-100 transition-all duration-200"
            >
              <Settings className="h-5 w-5 shrink-0" />
              <span>Administração</span>
            </Link>
          </div>
        )}
      </ScrollArea>

      {/* Footer - Help, Settings & Logout */}
      <div className="p-4 border-t border-emerald-200/60 dark:border-emerald-900/30 mt-auto space-y-1">
        <Link
          to="/settings"
          onClick={handleNavClick}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-emerald-600/80 dark:text-emerald-300/80 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-100 transition-all duration-200 w-full"
        >
          <User className="h-4 w-4" />
          <span>Definições</span>
        </Link>
        <a
          href="mailto:suporte@legalcompliance.pt"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-emerald-600/80 dark:text-emerald-300/80 hover:bg-emerald-100/50 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-100 transition-all duration-200 w-full"
        >
          <HelpCircle className="h-4 w-4" />
          <span>Ajuda</span>
        </a>
        <LogoutConfirmDialog 
          onConfirm={signOut} 
          className="w-full justify-start gap-3 text-emerald-600/80 dark:text-emerald-300/80 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 px-3" 
          variant="ghost"
        />
      </div>
    </div>
  );
}
