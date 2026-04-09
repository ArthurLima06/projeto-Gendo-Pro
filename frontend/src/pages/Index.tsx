import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CalendarDays, DollarSign, FileText } from "lucide-react";
import { useSimulatedLoading } from "@/hooks/useSimulatedLoading";
import { StatCardSkeleton, ListItemSkeleton } from "@/components/CardSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { getDashboardData, type DashboardAppointment, type DashboardPayment } from "@/services/dashboardService";

const ICON_MAP: Record<string, React.ElementType> = {
  Users,
  CalendarDays,
  DollarSign,
  FileText,
};

interface StatItem {
  label: string;
  value: string;
  icon: React.ElementType;
  change: string;
}

const Index = () => {
  const isInitialLoading = useSimulatedLoading(1000);
  const [stats, setStats] = useState<StatItem[]>([]);
  const [appointments, setAppointments] = useState<DashboardAppointment[]>([]);
  const [payments, setPayments] = useState<DashboardPayment[]>([]);
  const [summary, setSummary] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const res = await getDashboardData();
      if (res.success === false) {
        setError(res.error.message);
      } else {
        setStats(
          res.data.stats.map((s) => ({
            ...s,
            icon: ICON_MAP[s.icon] || FileText,
          }))
        );
        setAppointments(res.data.todayAppointments);
        setPayments(res.data.recentPayments);
        setSummary(res.data.summary);
      }
      setIsLoading(false);
    };
    load();
  }, []);

  const loading = isInitialLoading || isLoading;

  return (
    <div className="space-y-8">
      <div>
        {loading ? (
          <>
            <Skeleton className="h-7 w-72 mb-2" />
            <Skeleton className="h-4 w-48" />
          </>
        ) : error ? (
          <>
            <h2 className="text-2xl font-semibold">Bem-vindo ao Gendo Pro.</h2>
            <p className="text-sm text-destructive mt-1">{error}</p>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-semibold">Bem-vindo de volta ao Gendo Pro.</h2>
            <p className="text-muted-foreground mt-1">
              {summary || "Nenhum dado disponível no momento."}
            </p>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
          : stats.length === 0
          ? (
            <div className="col-span-full">
              <EmptyState
                icon={FileText}
                title="Sem dados disponíveis"
                description="Nenhuma métrica encontrada no momento."
              />
            </div>
          )
          : stats.map((stat) => (
              <Card key={stat.label} className="shadow-card border-border">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                      <p className="text-2xl font-semibold mt-1 tabular-nums">{stat.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
                    </div>
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <stat.icon className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="shadow-card border-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Agenda de Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => <ListItemSkeleton key={i} />)
                : appointments.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="Nenhuma consulta agendada"
                    description="Não há agendamentos para hoje."
                  />
                ) : appointments.map((apt, i) => (
                    <div
                      key={apt.id || i}
                      className="flex items-center justify-between py-3 border-b border-border last:border-0 hover:bg-muted/50 -mx-2 px-2 rounded-md transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium tabular-nums text-muted-foreground w-20">
                          {apt.time}
                        </span>
                        <div>
                          <p className="text-sm font-medium">{apt.patient}</p>
                          <p className="text-xs text-muted-foreground">{apt.professional}</p>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          apt.status === "Concluída"
                            ? "bg-emerald-50 text-emerald-700"
                            : apt.status === "Em Andamento"
                            ? "bg-primary/10 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {apt.status}
                      </span>
                    </div>
                  ))}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-card border-border">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Pagamentos Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-0">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => <ListItemSkeleton key={i} />)
                : payments.length === 0 ? (
                  <EmptyState
                    icon={DollarSign}
                    title="Nenhum pagamento registrado"
                    description="Não há pagamentos recentes."
                  />
                ) : payments.map((payment, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between py-3 border-b border-border last:border-0 hover:bg-muted/50 -mx-2 px-2 rounded-md transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium">{payment.patient}</p>
                        <p className="text-xs text-muted-foreground">{payment.date}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold tabular-nums">{payment.amount}</span>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                            payment.status === "Pago"
                              ? "bg-success/10 text-success border-success/30"
                              : payment.status === "Pendente"
                              ? "bg-warning/10 text-warning border-warning/30"
                              : "bg-destructive/10 text-destructive border-destructive/30 animate-pulse"
                          }`}
                        >
                          {payment.status}
                        </span>
                      </div>
                    </div>
                  ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
