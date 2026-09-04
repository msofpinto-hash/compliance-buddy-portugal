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
  BadgeCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import logoId from "@/assets/id-compliance-lex.png.asset.json";

type ModuleType =
  "legislacao" | "planos_acao" | "auditorias" | "documentos" | "indicadores";

type NavItem = {
  id: string;
  moduleKey?: ModuleType;
  label: string;
  icon: React.ElementType;
  href: string;
  alwaysShow?: boolean;
};

const ALL_MODULES: NavItem[] = [
  {
    id: "overview",
    label: "Painel",
    icon: LayoutDashboard,
    href: "/dashboard",
    alwaysShow: true,
  },
  {
    id: "legislacao",
    moduleKey: "legislacao",
    label: "Legislação",
    icon: Gavel,
    href: "/biblioteca",
    alwaysShow: true,
  },
  {
    id: "auditorias",
    moduleKey: "auditorias",
    label: "Auditorias",
    icon: ClipboardCheck,
    href: "/dashboard?tab=audits&sec=plano",
    alwaysShow: true,
  },
  {
    id: "planos_acao",
    moduleKey: "planos_acao",
    label: "Planos de Ação",
    icon: ClipboardList,
    href: "/dashboard?tab=actions",
  },
  {
    id: "aprovacoes",
    moduleKey: "auditorias",
    label: "Aprovações",
    icon: BadgeCheck,
    href: "/aprovacoes",
  },

  {
    id: "indicadores",
    moduleKey: "indicadores",
    label: "Indicadores",
    icon: BarChart3,
    href: "/dashboard?tab=indicators",
  },
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
    if (item.id === "aprovacoes") return location.pathname === "/aprovacoes";

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
    <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-md border-b border-border/60 ">
      {/* Row 1: brand + org + actions */}
      <div className="flex items-center justify-between gap-4 px-4 lg:px-8 py-3">
        <div className="flex flex-col min-w-0">
          <Link to="/dashboard" className="shrink-0">
            <img
              src={currentOrg?.logo_url || logoId.url}
              alt={
                currentOrg?.logo_url ? currentOrg.name : "I&D Compliance Lex"
              }
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = logoId.url;
              }}
              className="h-9 lg:h-10 w-auto max-w-[240px] object-contain object-left"
            />
          </Link>
          {currentOrg?.name && (
            <div className="mt-1 min-w-0 max-w-[280px]">
              <p className="text-xs font-semibold text-foreground leading-tight break-words">
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
              className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            >
              <Settings className="h-4 w-4 text-primary " />
              <span className="hidden lg:inline">Administração</span>
            </Link>
          )}
          <Link
            to="/settings"
            className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            aria-label="Definições"
          >
            <User className="h-4 w-4 text-primary " />
          </Link>
          <a
            href="mailto:suporte@incredibleanddynamic.com"
            className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
            aria-label="Ajuda"
          >
            <HelpCircle className="h-4 w-4 text-primary " />
          </a>
          <LogoutConfirmDialog
            onConfirm={signOut}
            className="text-muted-foreground hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
            variant="ghost"
          />
        </div>
      </div>

      {/* Row 2: horizontal module navigation */}
      <nav className="px-2 lg:px-6 border-t border-border/50 ">
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
                      ? "text-primary "
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/40 rounded-t-md",
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-4 w-4",
                      active ? "text-primary " : "text-muted-foreground ",
                    )}
                  />
                  {item.label}
                  {count !== undefined && count > 0 && (
                    <Badge className="ml-1 h-5 px-1.5 text-[11px] bg-terracotta/15 text-terracotta border-0">
                      {count > 99 ? "99+" : count}
                    </Badge>
                  )}
                  <span
                    className={cn(
                      "absolute left-3 right-3 -bottom-px h-[3px] rounded-full transition-all",
                      active
                        ? "bg-gradient-to-r from-primary via-primary to-terracotta"
                        : "bg-transparent",
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
