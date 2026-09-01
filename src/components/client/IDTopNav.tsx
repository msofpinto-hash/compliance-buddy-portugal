import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
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
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import logoId from "@/assets/id-compliance-lex.png.asset.json";

type ModuleType = "legislacao" | "planos_acao" | "auditorias" | "documentos" | "indicadores";

type NavItem = {
  id: string;
  moduleKey?: ModuleType;
  label: string;
  icon: React.ElementType;
  href: string;
  alwaysShow?: boolean;
};

const ALL_MODULES: NavItem[] = [
  { id: "overview", label: "Painel", icon: LayoutDashboard, href: "/dashboard", alwaysShow: true },
  { id: "legislacao", moduleKey: "legislacao", label: "Legislação", icon: Gavel, href: "/biblioteca", alwaysShow: true },
  { id: "planos_acao", moduleKey: "planos_acao", label: "Planos de Ação", icon: ClipboardList, href: "/dashboard?tab=actions" },
  { id: "auditorias", moduleKey: "auditorias", label: "Auditorias", icon: ClipboardCheck, href: "/dashboard?tab=audits" },
  { id: "documentos", moduleKey: "documentos", label: "Evidências", icon: FolderOpen, href: "/dashboard?tab=documents" },
  { id: "indicadores", moduleKey: "indicadores", label: "Indicadores", icon: BarChart3, href: "/dashboard?tab=indicators" },
];

interface IDTopNavProps {
  currentOrg?: {
    id: string;
    name: string;
    logo_url?: string;
  } | null;
  /** Extra controls rendered on the right of the top bar (search, org selector, theme…) */
  actions?: React.ReactNode;
  counts?: Partial<Record<string, number>>;
}

export function IDTopNav({ currentOrg, actions, counts }: IDTopNavProps) {
  const { user, signOut, isAdmin } = useAuth();
  const location = useLocation();

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
      return data?.map((d) => d.module as ModuleType) || [];
    },
    enabled: !!user?.id && !!currentOrg?.id,
  });

  const navItems = ALL_MODULES.filter((item) => {
    if (item.alwaysShow) return true;
    if (isAdmin) return true;
    if (!item.moduleKey) return true;
    return userModules?.includes(item.moduleKey);
  });

  const tabParam = new URLSearchParams(location.search).get("tab");

  const isItemActive = (item: NavItem) => {
    if (item.id === "legislacao") return location.pathname === "/biblioteca";
    if (location.pathname !== "/dashboard") return false;
    if (item.id === "overview") return !tabParam || tabParam === "overview";
    const map: Record<string, string> = {
      planos_acao: "actions",
      auditorias: "audits",
      documentos: "documents",
      indicadores: "indicators",
    };
    return tabParam === map[item.id];
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#1a1512]/95 backdrop-blur-md border-b border-stone-200/60 dark:border-amber-900/30">
      {/* Row 1: brand + org + actions */}
      <div className="flex items-center justify-between gap-4 px-4 lg:px-8 py-3">
        <div className="flex items-center gap-4 min-w-0">
          <Link to="/dashboard" className="shrink-0">
            <img
              src={currentOrg?.logo_url || logoId.url}
              alt={currentOrg?.logo_url ? currentOrg.name : "I&D Compliance Lex"}
              className="h-9 lg:h-10 w-auto max-w-[210px] object-contain object-left"
            />
          </Link>
          {currentOrg?.name && (
            <div className="hidden md:block pl-4 border-l border-stone-200/70 dark:border-amber-900/40 min-w-0">
              <p className="text-[11px] uppercase tracking-wider font-medium text-amber-700/70 dark:text-amber-300/60">
                Organização
              </p>
              <p className="text-sm font-semibold text-stone-800 dark:text-white truncate max-w-[240px]">
                {currentOrg.name}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 lg:gap-3">
          {actions}
          {isAdmin && (
            <Link
              to="/admin"
              className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-stone-600 dark:text-amber-100/80 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            >
              <Settings className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span className="hidden lg:inline">Administração</span>
            </Link>
          )}
          <Link
            to="/settings"
            className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-stone-600 dark:text-amber-100/80 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            aria-label="Definições"
          >
            <User className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </Link>
          <a
            href="mailto:suporte@incredibleanddynamic.com"
            className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-stone-600 dark:text-amber-100/80 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
            aria-label="Ajuda"
          >
            <HelpCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          </a>
          <LogoutConfirmDialog
            onConfirm={signOut}
            className="text-stone-500 dark:text-amber-200/70 hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
            variant="ghost"
          />
        </div>
      </div>

      {/* Row 2: horizontal module navigation */}
      <nav className="px-2 lg:px-6 border-t border-stone-200/50 dark:border-amber-900/20">
        <ul className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {navItems.map((item) => {
            const active = isItemActive(item);
            const count = counts?.[item.id];
            return (
              <li key={item.id} className="shrink-0">
                <Link
                  to={item.href}
                  className={cn(
                    "relative flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors",
                    active
                      ? "text-emerald-700 dark:text-emerald-300"
                      : "text-stone-600 dark:text-amber-100/70 hover:text-stone-900 dark:hover:text-white"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-4 w-4",
                      active ? "text-emerald-600 dark:text-emerald-400" : "text-stone-400 dark:text-amber-400/70"
                    )}
                  />
                  {item.label}
                  {count !== undefined && count > 0 && (
                    <Badge className="ml-1 h-5 px-1.5 text-[11px] bg-amber-100 dark:bg-amber-800/40 text-amber-800 dark:text-amber-200 border-0">
                      {count}
                    </Badge>
                  )}
                  <span
                    className={cn(
                      "absolute left-3 right-3 -bottom-px h-[3px] rounded-full transition-all",
                      active ? "bg-gradient-to-r from-emerald-500 to-emerald-700" : "bg-transparent"
                    )}
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
