import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LogoutConfirmDialog } from "@/components/LogoutConfirmDialog";
import { 
  Settings, 
  HelpCircle, 
  User, 
  Gavel, 
  ClipboardList, 
  ClipboardCheck, 
  FolderOpen, 
  BarChart3,
  Mountain
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import logoId from "@/assets/logo-id-compliance.png";

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
  { id: "documentos", moduleKey: "documentos", label: "Evidências", icon: FolderOpen, href: "/dashboard?tab=documents" },
  { id: "indicadores", moduleKey: "indicadores", label: "Indicadores", icon: BarChart3, href: "/dashboard?tab=indicators" },
];

interface IDSidebarProps {
  currentOrg?: {
    id: string;
    name: string;
    logo_url?: string;
  } | null;
  onCloseMobile?: () => void;
}

export function IDSidebar({ currentOrg, onCloseMobile }: IDSidebarProps) {
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

  // Filter navigation based on permissions
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
    <div className="flex flex-col h-full bg-white dark:bg-[#0c1f17]">
      {/* Logo - I&D branding */}
      <Link 
        to="/dashboard" 
        onClick={handleNavClick}
        className="p-5 border-b border-emerald-100 dark:border-emerald-900/40 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-colors"
      >
        {currentOrg?.logo_url ? (
          <img 
            src={currentOrg.logo_url} 
            alt={currentOrg.name} 
            className="h-10 w-auto object-contain"
          />
        ) : (
          <div className="flex items-center gap-3">
            <img 
              src={logoId} 
              alt="I&D Compliance" 
              className="h-10 w-auto object-contain"
              onError={(e) => {
                // Fallback to icon if logo fails to load
                e.currentTarget.style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
            />
            <div className="hidden items-center gap-2">
              <div className="relative">
                <Mountain className="h-8 w-8 text-emerald-700 dark:text-emerald-400" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-emerald-800 dark:text-white text-lg leading-tight tracking-tight">I&D</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold tracking-[0.2em] uppercase">Compliance</span>
              </div>
            </div>
          </div>
        )}
      </Link>

      {/* User Info */}
      <div className="p-4 border-b border-emerald-100 dark:border-emerald-900/40">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-emerald-700 dark:bg-emerald-600 flex items-center justify-center shadow-sm">
            <span className="text-sm font-medium text-white">
              {user?.email?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 dark:text-white truncate">
              {user?.email?.split("@")[0]}
            </p>
            <p className="text-xs text-slate-500 dark:text-emerald-300/70 truncate">
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
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive 
                    ? "bg-emerald-700 dark:bg-emerald-600 text-white shadow-sm" 
                    : "text-slate-600 dark:text-emerald-100/80 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 hover:text-emerald-800 dark:hover:text-white"
                )}
              >
                <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-white" : "text-emerald-600 dark:text-emerald-400")} />
                <span>{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <Badge className={cn(
                    "ml-auto text-xs px-2",
                    isActive 
                      ? "bg-white/20 text-white border-0" 
                      : "bg-emerald-100 dark:bg-emerald-800/50 text-emerald-700 dark:text-emerald-200 border-0"
                  )}>
                    {item.count}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Admin link */}
        {isAdmin && (
          <div className="px-3 mt-4 pt-4 border-t border-emerald-100 dark:border-emerald-900/40">
            <Link
              to="/admin"
              onClick={handleNavClick}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-slate-600 dark:text-emerald-100/80 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 hover:text-emerald-800 dark:hover:text-white transition-all duration-200"
            >
              <Settings className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Administração</span>
            </Link>
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="p-4 border-t border-emerald-100 dark:border-emerald-900/40 mt-auto space-y-1">
        <Link
          to="/settings"
          onClick={handleNavClick}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-500 dark:text-emerald-200/70 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-slate-700 dark:hover:text-white transition-all duration-200 w-full"
        >
          <User className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span>Definições</span>
        </Link>
        <a
          href="mailto:suporte@incredibleanddynamic.com"
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-slate-500 dark:text-emerald-200/70 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:text-slate-700 dark:hover:text-white transition-all duration-200 w-full"
        >
          <HelpCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span>Ajuda</span>
        </a>
        <LogoutConfirmDialog 
          onConfirm={signOut} 
          className="w-full justify-start gap-3 text-slate-500 dark:text-emerald-200/70 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 px-4" 
          variant="ghost"
        />
      </div>
    </div>
  );
}
