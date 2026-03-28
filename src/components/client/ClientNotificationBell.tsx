import { useState, useEffect } from "react";
import { Bell, Check, X, AlertTriangle, Clock, Calendar, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";

interface Alert {
  id: string;
  title: string;
  message: string;
  type: string | null;
  is_read: boolean;
  created_at: string;
  organization_id: string | null;
  related_action_plan_id: string | null;
  related_legislation_id: string | null;
}

interface ClientNotificationBellProps {
  organizationIds: string[];
}

export function ClientNotificationBell({ organizationIds }: ClientNotificationBellProps) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const fetchAlerts = async () => {
    if (organizationIds.length === 0) return;
    
    try {
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .in("organization_id", organizationIds)
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;

      setAlerts(data || []);
      setUnreadCount(data?.filter((a) => !a.is_read).length || 0);
    } catch (error: any) {
      console.error("Error fetching alerts:", error);
    }
  };

  useEffect(() => {
    fetchAlerts();

    const channel = supabase
      .channel("client-alerts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alerts" },
        () => fetchAlerts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [organizationIds.join(",")]);

  const markAsRead = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from("alerts")
        .update({ is_read: true })
        .eq("id", alertId);

      if (error) throw error;
      setAlerts((prev) => prev.map((a) => (a.id === alertId ? { ...a, is_read: true } : a)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      toast({ title: "Erro", description: "Não foi possível marcar como lido", variant: "destructive" });
    }
  };

  const markAllAsRead = async () => {
    const unreadIds = alerts.filter((a) => !a.is_read).map((a) => a.id);
    if (unreadIds.length === 0) return;

    try {
      const { error } = await supabase
        .from("alerts")
        .update({ is_read: true })
        .in("id", unreadIds);

      if (error) throw error;
      setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
      setUnreadCount(0);
    } catch {
      toast({ title: "Erro", description: "Não foi possível marcar todas como lidas", variant: "destructive" });
    }
  };

  const getAlertIcon = (type: string | null) => {
    switch (type) {
      case "deadline_overdue": return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case "deadline_today": return <Clock className="h-4 w-4 text-orange-500" />;
      case "deadline_imminent": return <Clock className="h-4 w-4 text-yellow-500" />;
      case "deadline_approaching": return <Calendar className="h-4 w-4 text-blue-500" />;
      case "new_legislation": return <FileText className="h-4 w-4 text-emerald-500" />;
      default: return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative hover:bg-emerald-500/10 hover:text-emerald-400">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center p-0 text-[10px]"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 sm:w-96 p-0" align="end">
        <div className="flex items-center justify-between border-b p-3">
          <h4 className="text-sm font-semibold">Notificações</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllAsRead}>
              <Check className="mr-1 h-3 w-3" />
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <ScrollArea className="h-[350px]">
          {alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <Bell className="mb-2 h-8 w-8 opacity-40" />
              <p className="text-sm">Sem notificações</p>
            </div>
          ) : (
            <div className="divide-y">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex gap-3 p-3 transition-colors hover:bg-muted/50 cursor-pointer ${
                    !alert.is_read ? "bg-emerald-500/5" : ""
                  }`}
                  onClick={() => !alert.is_read && markAsRead(alert.id)}
                >
                  <div className="mt-0.5 shrink-0">{getAlertIcon(alert.type)}</div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-sm font-medium leading-tight truncate">{alert.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{alert.message}</p>
                    <span className="text-[11px] text-muted-foreground/70">
                      {formatDistanceToNow(new Date(alert.created_at), { addSuffix: true, locale: pt })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
