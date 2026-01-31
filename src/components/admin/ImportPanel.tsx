import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Download, Globe, Flag, RefreshCw, Loader2, ChevronDown, 
  Clock, CheckCircle2, FileText, Upload, Calendar, Link as LinkIcon, Plus
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { CronJobsMonitorPanel } from "./CronJobsMonitorPanel";
import { ImportLegislationByUrlDialog } from "./ImportLegislationByUrlDialog";

export function ImportPanel() {
  const queryClient = useQueryClient();
  const [showImportUrlDialog, setShowImportUrlDialog] = useState(false);

  // Fetch last sync info
  const { data: lastSyncs, isLoading: loadingSyncs } = useQuery({
    queryKey: ["last-syncs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sync_logs")
        .select("*")
        .in("sync_type", ["sync-dre", "sync-eurlex"])
        .order("started_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      
      // Get last successful sync for each type
      const dreSyncs = data?.filter(s => s.sync_type === "sync-dre") || [];
      const euSyncs = data?.filter(s => s.sync_type === "sync-eurlex") || [];
      
      return {
        dre: dreSyncs[0] || null,
        eurlex: euSyncs[0] || null,
      };
    },
    staleTime: 30000,
  });

  // Fetch pending staging items
  const { data: stagingCount } = useQuery({
    queryKey: ["staging-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("legislation_staging")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");

      if (error) throw error;
      return count || 0;
    },
    staleTime: 30000,
  });

  // Sync mutations
  const syncDreMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-dre", {
        body: { limit: 50 },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Sincronização DRE iniciada");
      queryClient.invalidateQueries({ queryKey: ["last-syncs"] });
    },
    onError: (err: any) => toast.error(`Erro: ${err.message}`),
  });

  const syncEurlexMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-eurlex", {
        body: { limit: 50 },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Sincronização EUR-Lex iniciada");
      queryClient.invalidateQueries({ queryKey: ["last-syncs"] });
    },
    onError: (err: any) => toast.error(`Erro: ${err.message}`),
  });

  const formatLastSync = (sync: any) => {
    if (!sync) return "Nunca";
    const date = new Date(sync.started_at);
    return `${format(date, "dd/MM HH:mm", { locale: pt })} (${formatDistanceToNow(date, { locale: pt, addSuffix: true })})`;
  };

  return (
    <div className="space-y-4">
      {/* Quick Actions Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Download className="h-5 w-5 text-amber-600" />
                Fontes de Importação
              </CardTitle>
              <CardDescription>
                Sincronize legislação do Diário da República e EUR-Lex
              </CardDescription>
            </div>
            <Button 
              onClick={() => setShowImportUrlDialog(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              <LinkIcon className="h-4 w-4" />
              Importar por URL
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* DRE Card */}
            <div className="p-4 rounded-lg border bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 border-green-200/50 dark:border-green-800/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Flag className="h-5 w-5 text-green-600" />
                  <span className="font-semibold">🇵🇹 Diário da República</span>
                </div>
                <Button 
                  size="sm" 
                  onClick={() => syncDreMutation.mutate()}
                  disabled={syncDreMutation.isPending}
                >
                  {syncDreMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  <span>Última: {formatLastSync(lastSyncs?.dre)}</span>
                </div>
                {lastSyncs?.dre && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>{lastSyncs.dre.items_added || 0} novos, {lastSyncs.dre.items_processed || 0} processados</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Sincronização automática diária às 7h UTC
              </p>
            </div>

            {/* EUR-Lex Card */}
            <div className="p-4 rounded-lg border bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200/50 dark:border-blue-800/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Globe className="h-5 w-5 text-blue-600" />
                  <span className="font-semibold">🇪🇺 EUR-Lex</span>
                </div>
                <Button 
                  size="sm" 
                  onClick={() => syncEurlexMutation.mutate()}
                  disabled={syncEurlexMutation.isPending}
                >
                  {syncEurlexMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  <span>Última: {formatLastSync(lastSyncs?.eurlex)}</span>
                </div>
                {lastSyncs?.eurlex && (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>{lastSyncs.eurlex.items_added || 0} novos, {lastSyncs.eurlex.items_processed || 0} processados</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Sincronização automática diária às 6h UTC
              </p>
            </div>
          </div>

          {/* Staging Alert */}
          {(stagingCount ?? 0) > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  {stagingCount} diploma(s) pendente(s) de aprovação
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cron Jobs Section */}
      <CollapsibleSection
        title="Tarefas Automáticas"
        description="Monitorize e configure os processos agendados"
        icon={<Clock className="h-5 w-5 text-purple-600" />}
        defaultOpen={false}
      >
        <CronJobsMonitorPanel />
      </CollapsibleSection>

      {/* Import by URL Dialog */}
      <ImportLegislationByUrlDialog 
        open={showImportUrlDialog} 
        onOpenChange={setShowImportUrlDialog} 
      />
    </div>
  );
}

// Reusable collapsible section
function CollapsibleSection({ 
  title, 
  description, 
  icon, 
  children, 
  defaultOpen = false 
}: { 
  title: string; 
  description: string; 
  icon: React.ReactNode; 
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {icon}
                <div>
                  <CardTitle className="text-lg">{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </div>
              </div>
              <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {children}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
