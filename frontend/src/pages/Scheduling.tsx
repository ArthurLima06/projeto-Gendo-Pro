import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Loader2, X, Pencil, Trash2, CalendarDays } from "lucide-react";
import { useSimulatedLoading } from "@/hooks/useSimulatedLoading";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/hooks/use-toast";
import { useAppointmentStore, type Appointment } from "@/stores/appointmentStore";
import { getPatients, type Patient } from "@/services/patientsService";
import EditAppointmentModal, { type EditAppointmentPayload } from "@/components/scheduling/EditAppointmentModal";
import { useSearchParams } from "react-router-dom";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8);
const DAY_NAMES_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function getWeekDays(ref: Date): Date[] {
  const d = new Date(ref);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // start on Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return dd;
  });
}

function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1; // Monday = 0
  const rows: (Date | null)[][] = [];
  let current = 0;
  for (let w = 0; w < 6; w++) {
    const row: (Date | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const idx = w * 7 + d - startDay;
      if (idx >= 0 && idx < last.getDate()) {
        row.push(new Date(year, month, idx + 1));
      } else {
        row.push(null);
      }
    }
    if (row.some((d) => d !== null)) rows.push(row);
  }
  return rows;
}

function fmt(d: Date) {
  return d.toISOString().split("T")[0];
}

function isToday(d: Date) {
  return fmt(d) === fmt(new Date());
}

const PROFESSIONAL_OPTIONS = ["Dr. Silva", "Dr. Costa", "Dr. Santos"];

const Scheduling = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchParams] = useSearchParams();
  const focusDateParam = searchParams.get("date");

  const [view, setView] = useState<"week" | "month">("week");
  const [refDate, setRefDate] = useState(() => {
    if (focusDateParam) return new Date(focusDateParam + "T12:00:00");
    return new Date();
  });
  const [isScheduling, setIsScheduling] = useState(false);
  const isLoading = useSimulatedLoading(900);

  // Form state
  const [formPatient, setFormPatient] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formProfessional, setFormProfessional] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // Detail popup
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);

  const { appointments, addAppointment, updateAppointment, removeAppointment, fetchAppointments } = useAppointmentStore();

  useEffect(() => {
    fetchAppointments();
    const loadPatients = async () => {
      const res = await getPatients();
      if (res.success) setPatients(res.data);
    };
    loadPatients();
  }, []);

  const weekDays = useMemo(() => getWeekDays(refDate), [refDate.toISOString()]);
  const monthGrid = useMemo(() => getMonthGrid(refDate.getFullYear(), refDate.getMonth()), [refDate.getFullYear(), refDate.getMonth()]);

  const navigate = (dir: number) => {
    setRefDate((prev) => {
      const d = new Date(prev);
      if (view === "week") d.setDate(d.getDate() + dir * 7);
      else d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  const periodLabel = useMemo(() => {
    if (view === "week") {
      const s = weekDays[0];
      const e = weekDays[6];
      const sDay = s.getDate();
      const eDay = e.getDate();
      const sMonth = s.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      const eMonth = e.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
      if (s.getMonth() === e.getMonth()) {
        return `${sDay} – ${eDay} ${sMonth}, ${s.getFullYear()}`;
      }
      return `${sDay} ${sMonth} – ${eDay} ${eMonth}, ${e.getFullYear()}`;
    }
    return `${MONTH_NAMES[refDate.getMonth()]} ${refDate.getFullYear()}`;
  }, [view, refDate.toISOString(), weekDays]);

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPatient || !formDate || !formTime) {
      toast({ title: "Preencha os campos obrigatórios", description: "Paciente, data e horário são obrigatórios.", variant: "destructive" });
      return;
    }
    setIsScheduling(true);
    try {
      await addAppointment({
        patient: formPatient,
        date: formDate,
        time: formTime,
        professional: formProfessional,
        reason: formReason,
        notes: formNotes,
      });
      setFormPatient("");
      setFormDate("");
      setFormTime("");
      setFormProfessional("");
      setFormReason("");
      setFormNotes("");
      toast({ title: "Consulta agendada", description: "O agendamento foi criado com sucesso." });
    } catch {
      toast({ title: "Erro ao agendar consulta", variant: "destructive" });
    } finally {
      setIsScheduling(false);
    }
  };

  const handleDelete = (id: string) => {
    removeAppointment(id);
    setSelectedAppt(null);
    toast({ title: "Agendamento removido", description: "O agendamento foi excluído." });
  };

  const handleEditClick = () => {
    if (!selectedAppt) return;
    setEditingAppt(selectedAppt);
    setSelectedAppt(null);
  };

  const handleSaveEdit = async (payload: EditAppointmentPayload) => {
    if (!editingAppt) return;

    const response = await updateAppointment(editingAppt.id, payload);
    if (response.success) {
      setEditingAppt(null);
      toast({
        title: "Agendamento atualizado com sucesso.",
        description: "As alterações foram aplicadas no calendário.",
      });
      return;
    }

    toast({
      title: "Erro ao atualizar agendamento",
      description: response.error.message,
      variant: "destructive",
    });
  };

  const getEventsForDate = (date: string) => appointments.filter((a) => a.date === date);

  // --- Week view ---
  const renderWeekView = () => {
    const hasAnyEvents = weekDays.some((d) => getEventsForDate(fmt(d)).length > 0);

    return (
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border">
            <div className="p-2" />
            {weekDays.map((d, i) => (
              <div key={i} className={`p-3 text-center border-l border-border ${isToday(d) ? "bg-primary/5" : ""}`}>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  {DAY_NAMES_SHORT[d.getDay()]}
                </span>
                <p className={`text-lg font-semibold mt-0.5 ${isToday(d) ? "text-primary" : ""}`}>
                  {d.getDate()}
                </p>
              </div>
            ))}
          </div>
          {HOURS.map((hour) => (
            <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border last:border-0">
              <div className="p-2 text-right pr-3">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {String(hour).padStart(2, "0")}:00
                </span>
              </div>
              {weekDays.map((d, dayIdx) => {
                const dateStr = fmt(d);
                const events = getEventsForDate(dateStr).filter(
                  (e) => parseInt(e.time.split(":")[0]) === hour
                );
                return (
                  <div
                    key={dayIdx}
                    className={`border-l border-border min-h-[48px] p-1 hover:bg-muted/30 transition-colors cursor-pointer ${isToday(d) ? "bg-primary/[0.02]" : ""}`}
                  >
                    {events.map((event) => (
                      <div
                        key={event.id}
                        onClick={() => setSelectedAppt(event)}
                        className={`rounded-md border-l-[3px] px-2 py-1.5 text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${event.color}`}
                      >
                        <span className="block truncate">{event.patient}</span>
                        <span className="block text-[10px] opacity-70">{event.time}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
          {!hasAnyEvents && (
            <div className="py-12">
              <EmptyState
                icon={CalendarDays}
                title="Nenhum agendamento encontrado"
                description="Nenhuma consulta agendada para esta semana."
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  // --- Month view ---
  const renderMonthView = () => {
    return (
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-7 border-b border-border">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
              <div key={d} className="p-2 text-center border-l border-border first:border-l-0">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{d}</span>
              </div>
            ))}
          </div>
          {monthGrid.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-b border-border last:border-0">
              {week.map((day, di) => {
                if (!day) {
                  return <div key={di} className="border-l border-border first:border-l-0 min-h-[80px] bg-muted/20" />;
                }
                const dateStr = fmt(day);
                const events = getEventsForDate(dateStr);
                return (
                  <div
                    key={di}
                    className={`border-l border-border first:border-l-0 min-h-[80px] p-1 hover:bg-muted/30 transition-colors ${isToday(day) ? "bg-primary/5" : ""}`}
                  >
                    <span className={`text-xs font-medium ${isToday(day) ? "text-primary font-bold" : "text-muted-foreground"}`}>
                      {day.getDate()}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {events.slice(0, 3).map((event) => (
                        <div
                          key={event.id}
                          onClick={() => setSelectedAppt(event)}
                          className={`rounded px-1 py-0.5 text-[10px] font-medium truncate cursor-pointer hover:opacity-80 ${event.color}`}
                        >
                          {event.time} {event.patient}
                        </div>
                      ))}
                      {events.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{events.length - 3} mais</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="shadow-card border-border xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Agendar Consulta</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSchedule}>
              <div className="space-y-2">
                <Label>Paciente</Label>
                <Select value={formPatient} onValueChange={setFormPatient}>
                  <SelectTrigger><SelectValue placeholder="Selecionar paciente" /></SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Horário</Label>
                  <Input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Profissional</Label>
                <Select value={formProfessional} onValueChange={setFormProfessional}>
                  <SelectTrigger><SelectValue placeholder="Selecionar profissional" /></SelectTrigger>
                  <SelectContent>
                    {PROFESSIONAL_OPTIONS.map((professionalName) => (
                      <SelectItem key={professionalName} value={professionalName}>{professionalName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Input placeholder="Motivo da consulta" value={formReason} onChange={(e) => setFormReason(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea placeholder="Observações adicionais..." rows={3} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
              </div>
              <Button className="w-full" disabled={isScheduling}>
                {isScheduling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Agendando...
                  </>
                ) : (
                  "Agendar Consulta"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="shadow-card border-border xl:col-span-2 relative">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold">Calendário</CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex items-center border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setView("week")}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                >
                  Semana
                </button>
                <button
                  onClick={() => setView("month")}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                >
                  Mês
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => navigate(-1)} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <span className="text-sm font-medium px-2 min-w-[160px] text-center">{periodLabel}</span>
                <button onClick={() => navigate(1)} className="p-1.5 rounded-md hover:bg-muted transition-colors">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-5 w-14 shrink-0" />
                    <div className="flex-1 grid grid-cols-5 gap-2">
                      {Array.from({ length: 5 }).map((_, j) => (
                        <Skeleton key={j} className="h-10" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : view === "week" ? (
              renderWeekView()
            ) : (
              renderMonthView()
            )}
          </CardContent>

          {/* Appointment detail popup */}
          {selectedAppt && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-lg">
              <div className="bg-card border border-border rounded-xl shadow-lg p-5 w-80 space-y-3 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Detalhes do Agendamento</h3>
                  <button onClick={() => setSelectedAppt(null)} className="p-1 rounded-md hover:bg-muted transition-colors">
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paciente</span>
                    <span className="font-medium text-foreground">{selectedAppt.patient}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Data</span>
                    <span className="text-foreground">{new Date(selectedAppt.date + "T12:00:00").toLocaleDateString("pt-BR")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Horário</span>
                    <span className="text-foreground">{selectedAppt.time}</span>
                  </div>
                  {selectedAppt.professional && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Profissional</span>
                      <span className="text-foreground">{selectedAppt.professional}</span>
                    </div>
                  )}
                  {selectedAppt.reason && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Motivo</span>
                      <span className="text-foreground">{selectedAppt.reason}</span>
                    </div>
                  )}
                  {selectedAppt.notes && (
                    <div>
                      <span className="text-muted-foreground text-xs">Observações</span>
                      <p className="text-foreground text-xs mt-0.5">{selectedAppt.notes}</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={handleEditClick}>
                    <Pencil className="h-3 w-3" /> Editar
                  </Button>
                  <Button variant="destructive" size="sm" className="flex-1 gap-1" onClick={() => handleDelete(selectedAppt.id)}>
                    <Trash2 className="h-3 w-3" /> Excluir
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      <EditAppointmentModal
        open={Boolean(editingAppt)}
        appointment={editingAppt}
        patients={patients}
        professionals={PROFESSIONAL_OPTIONS}
        onCancel={() => setEditingAppt(null)}
        onSave={handleSaveEdit}
      />
    </div>
  );
};

export default Scheduling;
