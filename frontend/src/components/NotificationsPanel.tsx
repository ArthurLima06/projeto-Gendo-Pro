import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CalendarDays, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type Notification,
} from "@/services/notificationsService";

const NotificationsPanel = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadNotifications = async () => {
    setIsLoading(true);
    const res = await getNotifications();
    if (res.success) {
      setNotifications(res.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  // Reload when popover opens
  useEffect(() => {
    if (open) loadNotifications();
  }, [open]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleAction = async (n: Notification) => {
    await markNotificationRead(n.id);
    setNotifications((prev) =>
      prev.map((notif) => (notif.id === n.id ? { ...notif, read: true } : notif))
    );
    setOpen(false);
    navigate(`/scheduling${n.linkedDate ? `?date=${n.linkedDate}` : ""}`);
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 transition-transform">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary" />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={8} className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Notificações</h3>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-xs text-primary hover:underline"
            >
              Marcar todas como lidas
            </button>
          )}
        </div>

        <Separator />

        {notifications.length === 0 ? (
          <div className="py-10 text-center">
            <Bell className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              Nenhuma notificação no momento
            </p>
          </div>
        ) : (
          <ScrollArea className="max-h-72">
            <div className="divide-y divide-border">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 transition-colors ${
                    n.read ? "bg-transparent" : "bg-primary/[0.03]"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${
                      n.read ? "bg-muted" : "bg-primary/10"
                    }`}>
                      <CalendarDays className={`h-3.5 w-3.5 ${n.read ? "text-muted-foreground" : "text-primary"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className={`text-sm ${n.read ? "text-foreground" : "font-medium text-foreground"}`}>
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {n.description}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {n.date}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-primary hover:text-primary"
                          onClick={() => handleAction(n)}
                        >
                          Ver agenda
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default NotificationsPanel;
