import { useState, useEffect } from "react";
import { Bell, Check, X, AlertTriangle, Clock, Calendar } from "lucide-react";
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
  organizations?: { name: string } | null;
}

export function AlertsNotificationBell() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fetchAlerts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("alerts")
        .select(`
          *,
          organizations!alerts_organization_id_fkey(name)
        `)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      setAlerts(data || []);
      setUnreadCount(data?.filter((a) => !a.is_read).length || 0);
    } catch (error: any) {
      console.error("Error fetching alerts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("alerts-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "alerts",
        },
        () => {
          fetchAlerts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const markAsRead = async (alertId: string) => {
    try {
      const { error } = await supabase
        .from("alerts")
        .update({ is_read: true })
        .eq("id", alertId);

      if (error) throw error;

      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, is_read: true } : a))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Não foi possível marcar como lido",
        variant: "destructive",
      });
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadIds = alerts.filter((a) => !a.is_read).map((a) => a.id);
      if (unreadIds.length === 0) return;

      const { error } = await supabase
        .from("alerts")
        .update({ is_read: true })
        .in("id", unreadIds);

      if (error) throw error;

      setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
      setUnreadCount(0);

      toast({
        title: "Sucesso",
        description: "Todas as notificações foram marcadas como lidas",
      });
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Não foi possível marcar todas como lidas",
        variant: "destructive",
      });
    }
  };

  const deleteAlert = async (alertId: string) => {
    try {
      const alert = alerts.find((a) => a.id === alertId);
      const { error } = await supabase.from("alerts").delete().eq("id", alertId);

      if (error) throw error;

      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      if (alert && !alert.is_read) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: "Não foi possível remover a notificação",
        variant: "destructive",
      });
    }
  };

  const getAlertIcon = (type: string | null) => {
    switch (type) {
      case "deadline_overdue":
        return <AlertTriangle className="h-4 w-4 text-destructive" />;
      case "deadline_today":
        return <Clock className="h-4 w-4 text-orange-500" />;
      case "deadline_imminent":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "deadline_approaching":
        return <Calendar className="h-4 w-4 text-blue-500" />;
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getAlertBadgeVariant = (type: string | null) => {
    switch (type) {
      case "deadline_overdue":
        return "destructive";
      case "deadline_today":
        return "default";
      case "deadline_imminent":
        return "secondary";
      default:
        return "outline";
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between border-b p-4">
          <h4 className="font-semibold">Notificações</h4>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead}>
              <Check className="mr-1 h-4 w-4" />
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <ScrollArea className="h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <Bell className="mb-2 h-8 w-8" />
              <p>Sem notificações</p>
            </div>
          ) : (
            <div className="divide-y">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`flex gap-3 p-4 transition-colors hover:bg-muted/50 ${
                    !alert.is_read ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="mt-1">{getAlertIcon(alert.type)}</div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-tight">
                        {alert.title}
                      </p>
                      <div className="flex shrink-0 gap-1">
                        {!alert.is_read && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => markAsRead(alert.id)}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteAlert(alert.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {alert.message}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {alert.organizations?.name && (
                        <Badge variant="outline" className="text-xs">
                          {alert.organizations.name}
                        </Badge>
                      )}
                      <span>
                        {formatDistanceToNow(new Date(alert.created_at), {
                          addSuffix: true,
                          locale: pt,
                        })}
                      </span>
                    </div>
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
