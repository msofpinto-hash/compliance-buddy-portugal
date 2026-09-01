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
  count?: number;
  alwaysShow?: boolean;
};

const ALL_MODULES: NavItem[] = [
  {
    id: "legislacao",
    moduleKey: "legislacao",
    label: "Legislação",
    icon: Gavel,
    href: "/biblioteca",
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
    id: "auditorias",
    moduleKey: "auditorias",
    label: "Auditorias",
    icon: ClipboardCheck,
    href: "/dashboard?tab=audits",
  },
  {
    id: "documentos",
    moduleKey: "documentos",
    label: "Evidências",
    icon: FolderOpen,
    href: "/dashboard?tab=documents",
  },
  {
    id: "indicadores",
    moduleKey: "indicadores",
    label: "Indicadores",
    icon: BarChart3,
    href: "/dashboard?tab=indicators",
  },
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
      return data?.map((d) => d.module as ModuleType) || [];
    },
    enabled: !!user?.id && !!currentOrg?.id,
  });

  // Filter navigation based on permissions
  const navItems = ALL_MODULES.filter((item) => {
    if (item.alwaysShow) return true;
    if (isAdmin) return true;
    if (!item.moduleKey) return true;
    return userModules?.includes(item.moduleKey);
  });

  const handleNavClick = () => {
    onCloseMobile?.();
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-white to-border dark:from-[#1a1512] dark:to-[#141210]">
      {/* Logo - I&D branding with warm accent */}
      <Link
        to="/dashboard"
        onClick={handleNavClick}
        className="flex min-h-[105px] items-center px-5 py-4 border-b border-border/60 hover:bg-accent/50 transition-colors"
      >
        {currentOrg?.logo_url ? (
          <img
            src={currentOrg.logo_url}
            alt={currentOrg.name}
            className="max-h-14 w-auto max-w-full object-contain"
          />
        ) : (
          <div className="flex w-full items-center">
            <img
              src={logoId.url}
              alt="I&D Compliance"
              className="h-auto w-full max-w-[230px] object-contain object-left"
            />
          </div>
        )}
      </Link>

      {/* User Info - warm accent */}
      <div className="p-4 border-b border-border/60 ">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary flex items-center justify-center shadow-md ring-2 ring-primary/50 ">
            <span className="text-sm font-medium text-white">
              {user?.email?.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground dark:text-white truncate">
              {user?.email?.split("@")[0]}
            </p>
            <p className="text-xs text-primary/70 truncate">
              {currentOrg?.name || ""}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation - warm hover states */}
      <ScrollArea className="flex-1 py-4">
        <nav className="px-3 space-y-1">
          {navItems.map((item) => {
            const isActive =
              location.pathname === item.href ||
              (location.pathname === "/biblioteca" &&
                item.id === "legislacao") ||
              (location.pathname === "/dashboard" &&
                location.search.includes(`tab=${item.id.replace("_", "-")}`));
            return (
              <Link
                key={item.id}
                to={item.href}
                onClick={handleNavClick}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200",
                  isActive
                    ? "bg-gradient-to-r from-primary to-primary text-white shadow-md"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground dark:hover:text-white",
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 shrink-0",
                    isActive ? "text-white" : "text-primary ",
                  )}
                />
                <span>{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <Badge
                    className={cn(
                      "ml-auto text-xs px-2",
                      isActive
                        ? "bg-white/20 text-white border-0"
                        : "bg-accent text-primary border-0",
                    )}
                  >
                    {item.count}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Admin link */}
        {isAdmin && (
          <div className="px-3 mt-4 pt-4 border-t border-border/60 ">
            <Link
              to="/admin"
              onClick={handleNavClick}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground dark:hover:text-white transition-all duration-200"
            >
              <Settings className="h-5 w-5 shrink-0 text-primary " />
              <span>Administração</span>
            </Link>
          </div>
        )}
      </ScrollArea>

      {/* Footer - warm tones */}
      <div className="p-4 border-t border-border/60 mt-auto space-y-1">
        <Link
          to="/settings"
          onClick={handleNavClick}
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:text-white transition-all duration-200 w-full"
        >
          <User className="h-4 w-4 text-primary " />
          <span>Definições</span>
        </Link>
        <a
          href="mailto:suporte@incredibleanddynamic.com"
          className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:text-white transition-all duration-200 w-full"
        >
          <HelpCircle className="h-4 w-4 text-primary " />
          <span>Ajuda</span>
        </a>
        <LogoutConfirmDialog
          onConfirm={signOut}
          className="w-full justify-start gap-3 text-muted-foreground hover:bg-red-50 dark:hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400 px-4"
          variant="ghost"
        />
      </div>
    </div>
  );
}
