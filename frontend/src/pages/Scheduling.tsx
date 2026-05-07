import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSimulatedLoading } from "@/hooks/useSimulatedLoading";
import { toast } from "@/hooks/use-toast";
import { getPatients, type Patient } from "@/services/patientsService";
import { getProfessionals, type Professional } from "@/services/professionalsService";
import { useAppointmentStore, type Appointment } from "@/stores/appointmentStore";
import CalendarGrid from "@/components/scheduling/calendar/CalendarGrid";
import EventModal, { type EventModalSubmitPayload } from "@/components/scheduling/calendar/EventModal";
import EventPreviewCard from "@/components/scheduling/calendar/EventPreviewCard";
import {
  buildMonthPeriodLabel,
  buildWeekPeriodLabel,
  clampDuration,
  DEFAULT_DURATION_MINUTES,
  fmtDateKey,
  formatDatePtBr,
  formatHourAndMinute,
  getAppointmentRenderData,
  getEventColorClass,
  getMonthGrid,
  getWeekDays,
  isToday,
  roundTimeToFiveMinutes,
  roundToNearestFive,
  type AppointmentRenderData,
} from "@/components/scheduling/calendar/calendarUtils";

type ModalMode = "create" | "edit";

interface ModalSeed {
  date: string;
  time: string;
  durationMinutes: number;
}

interface PreviewState {
  appointment: Appointment;
  position: { x: number; y: number };
}

interface ResizeState {
  appointment: Appointment;
  startY: number;
  startDurationMinutes: number;
}

const Scheduling = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [searchParams] = useSearchParams();
  const focusDateParam = searchParams.get("date");
  const isLoading = useSimulatedLoading(900);

  const [view, setView] = useState<"week" | "month">("week");
  const [refDate, setRefDate] = useState(() => {
    if (focusDateParam) {
      return new Date(`${focusDateParam}T12:00:00`);
    }
    return new Date();
  });

  const [formPatient, setFormPatient] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formDuration, setFormDuration] = useState(DEFAULT_DURATION_MINUTES);
  const [formProfessional, setFormProfessional] = useState("");
  const [formReason, setFormReason] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);

  const [durationById, setDurationById] = useState<Record<string, number>>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create");
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [modalSeed, setModalSeed] = useState<ModalSeed>({
    date: "",
    time: "",
    durationMinutes: DEFAULT_DURATION_MINUTES,
  });

  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);

  const previewOpenTimerRef = useRef<number | null>(null);
  const previewCloseTimerRef = useRef<number | null>(null);

  const { appointments, addAppointment, updateAppointment, removeAppointment, fetchAppointments } = useAppointmentStore();

  useEffect(() => {
    fetchAppointments();
    const loadPatients = async () => {
      const response = await getPatients();
      if (response.success) {
        setPatients(response.data);
      }
    };
    const loadProfessionals = async () => {
      const response = await getProfessionals();
      if (response.success) {
        setProfessionals(
          response.data.filter((item) => (item.futureStatus || "active").toLowerCase() !== "inactive")
        );
      }
    };
    loadPatients();
    loadProfessionals();
  }, [fetchAppointments]);

  useEffect(() => {
    setDurationById((prev) => {
      const next = { ...prev };
      let didChange = false;
      for (const appointment of appointments) {
        if (!next[appointment.id]) {
          next[appointment.id] = clampDuration(appointment.duration || DEFAULT_DURATION_MINUTES);
          didChange = true;
        }
      }
      return didChange ? next : prev;
    });
  }, [appointments]);

  useEffect(
    () => () => {
      if (previewOpenTimerRef.current) {
        window.clearTimeout(previewOpenTimerRef.current);
      }
      if (previewCloseTimerRef.current) {
        window.clearTimeout(previewCloseTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!resizeState) {
      return;
    }

    const currentAppointmentId = resizeState.appointment.id;

    const handleMouseMove = (event: MouseEvent) => {
      const deltaPixels = event.clientY - resizeState.startY;
      const deltaMinutes = roundToNearestFive((deltaPixels / 52) * 60);
      const nextDuration = clampDuration(resizeState.startDurationMinutes + deltaMinutes);
      setDurationById((prev) => ({
        ...prev,
        [currentAppointmentId]: nextDuration,
      }));
    };

    const handleMouseUp = () => {
      setResizeState(null);
      toast({
        title: "Duracao atualizada",
        description: "A duracao visual do evento foi ajustada no calendario.",
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizeState]);

  const weekDays = useMemo(() => getWeekDays(refDate), [refDate]);
  const monthGrid = useMemo(
    () => getMonthGrid(refDate.getFullYear(), refDate.getMonth()),
    [refDate]
  );

  const periodLabel = useMemo(() => {
    if (view === "week") {
      return buildWeekPeriodLabel(weekDays);
    }
    return buildMonthPeriodLabel(refDate);
  }, [view, weekDays, refDate]);

  const patientOptions = useMemo(() => {
    return [...patients].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [patients]);

  const professionalOptions = useMemo(() => {
    return [...professionals].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [professionals]);

  const appointmentsByDate = useMemo(() => {
    const grouped: Record<string, AppointmentRenderData[]> = {};
    for (const appointment of appointments) {
      const date = appointment.date;
      const durationMinutes = durationById[appointment.id] || DEFAULT_DURATION_MINUTES;
      const renderData = getAppointmentRenderData(appointment, durationMinutes);
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(renderData);
    }

    for (const date of Object.keys(grouped)) {
      grouped[date].sort((a, b) => a.startMinutes - b.startMinutes);
    }

    return grouped;
  }, [appointments, durationById]);

  const clearPreviewTimers = () => {
    if (previewOpenTimerRef.current) {
      window.clearTimeout(previewOpenTimerRef.current);
      previewOpenTimerRef.current = null;
    }
    if (previewCloseTimerRef.current) {
      window.clearTimeout(previewCloseTimerRef.current);
      previewCloseTimerRef.current = null;
    }
  };

  const closePreview = () => {
    clearPreviewTimers();
    setPreview(null);
  };

  const openCreateModal = (seed: ModalSeed) => {
    setModalMode("create");
    setEditingAppointment(null);
    setModalSeed(seed);
    setModalOpen(true);
    setSelectedAppointmentId(null);
  };

  const openEditModal = (appointment: Appointment) => {
    closePreview();
    setModalMode("edit");
    setEditingAppointment(appointment);
    setModalSeed({
      date: appointment.date,
      time: appointment.time.slice(0, 5),
      durationMinutes: durationById[appointment.id] || DEFAULT_DURATION_MINUTES,
    });
    setModalOpen(true);
    setSelectedAppointmentId(appointment.id);
  };

  const getCurrentRoundedTime = () => {
    const now = new Date();
    return roundTimeToFiveMinutes(now.getHours(), now.getMinutes());
  };

  const handleCreateFromEmptyCell = (date: string, hour: number, minute: number) => {
    closePreview();
    const roundedMinute = roundToNearestFive(minute);
    const dateTime = new Date(`${date}T00:00:00`);
    dateTime.setHours(hour, 0, 0, 0);
    dateTime.setMinutes(roundedMinute);
    openCreateModal({
      date: fmtDateKey(dateTime),
      time: formatHourAndMinute(dateTime.getHours(), dateTime.getMinutes()),
      durationMinutes: DEFAULT_DURATION_MINUTES,
    });
  };

  const handleSidebarSchedule = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!formPatient || !formDate || !formTime) {
      toast({
        title: "Preencha os campos obrigatorios",
        description: "Paciente, data e horario sao obrigatorios.",
        variant: "destructive",
      });
      return;
    }

    setIsScheduling(true);
    try {
      const selectedProfessional = professionalOptions.find((item) => item.id === formProfessional);
      const created = await addAppointment({
        patient: formPatient,
        date: formDate,
        time: formTime,
        professional: selectedProfessional?.name || "",
        professional_id: selectedProfessional?.id,
        reason: formReason,
        notes: formNotes,
        duration: clampDuration(formDuration),
      });

      if (created) {
        const persistedDuration = clampDuration(created.duration || formDuration);
        setDurationById((prev) => ({
          ...prev,
          [created.id]: persistedDuration,
        }));
      }

      setFormPatient("");
      setFormDate("");
      setFormTime("");
      setFormDuration(DEFAULT_DURATION_MINUTES);
      setFormProfessional("");
      setFormReason("");
      setFormNotes("");
      toast({
        title: "Consulta agendada",
        description: "O agendamento foi criado com sucesso.",
      });
    } catch {
      toast({
        title: "Erro ao agendar consulta",
        variant: "destructive",
      });
    } finally {
      setIsScheduling(false);
    }
  };

  const handleModalSave = async (payload: EventModalSubmitPayload) => {
    if (modalMode === "create") {
      const created = await addAppointment({
        patient: payload.patient,
        date: payload.date,
        time: payload.time,
        professional: payload.professional,
        professional_id: payload.professional_id,
        reason: payload.reason,
        notes: payload.notes,
        duration: payload.durationMinutes,
      });

      if (!created) {
        toast({
          title: "Erro ao agendar consulta",
          variant: "destructive",
        });
        return;
      }

      setDurationById((prev) => ({
        ...prev,
        [created.id]: clampDuration(created.duration || payload.durationMinutes),
      }));
      setModalOpen(false);
      toast({
        title: "Consulta agendada",
        description: "O agendamento foi criado com sucesso.",
      });
      return;
    }

    if (!editingAppointment) {
      return;
    }

    const response = await updateAppointment(editingAppointment.id, {
      patient: payload.patient,
      patient_id: payload.patient_id,
      date: payload.date,
      time: payload.time,
      professional: payload.professional,
      professional_id: payload.professional_id,
      reason: payload.reason,
      notes: payload.notes,
      duration: payload.durationMinutes,
    });

    if (!response.success) {
      toast({
        title: "Erro ao atualizar agendamento",
        description: response.error.message,
        variant: "destructive",
      });
      return;
    }

    setDurationById((prev) => ({
      ...prev,
      [editingAppointment.id]: payload.durationMinutes,
    }));

    setModalOpen(false);
    setEditingAppointment(null);
    toast({
      title: "Agendamento atualizado com sucesso.",
      description: "As alteracoes foram aplicadas no calendario.",
    });
  };

  const handleDeleteAppointment = async (appointment: Appointment) => {
    await removeAppointment(appointment.id);
    closePreview();
    if (editingAppointment?.id === appointment.id) {
      setEditingAppointment(null);
      setModalOpen(false);
    }
    setSelectedAppointmentId((current) => (current === appointment.id ? null : current));
    toast({
      title: "Agendamento removido",
      description: "O agendamento foi excluido.",
    });
  };

  const handleDragDrop = async (
    appointmentId: string,
    date: string,
    hour: number,
    minute: number
  ) => {
    const normalizedMinute = roundToNearestFive(minute);
    const dateTime = new Date(`${date}T00:00:00`);
    dateTime.setHours(hour, 0, 0, 0);
    dateTime.setMinutes(normalizedMinute);
    const finalDate = fmtDateKey(dateTime);
    const nextTime = formatHourAndMinute(dateTime.getHours(), dateTime.getMinutes());
    const current = appointments.find((item) => item.id === appointmentId);
    if (!current) {
      return;
    }

    if (current.date === finalDate && current.time.slice(0, 5) === nextTime) {
      return;
    }

    const response = await updateAppointment(appointmentId, {
      date: finalDate,
      time: nextTime,
    });

    if (response.success) {
      toast({
        title: "Agendamento atualizado",
        description: `Novo horario: ${formatDatePtBr(finalDate)} as ${nextTime}.`,
      });
      return;
    }

    toast({
      title: "Erro ao mover agendamento",
      description: response.error.message,
      variant: "destructive",
    });
  };

  const handleHoverStart = (appointment: Appointment, rect: DOMRect) => {
    clearPreviewTimers();
    previewOpenTimerRef.current = window.setTimeout(() => {
      setPreview({
        appointment,
        position: {
          x: rect.right + 10,
          y: rect.top - 4,
        },
      });
    }, 150);
  };

  const handleHoverEnd = () => {
    if (previewOpenTimerRef.current) {
      window.clearTimeout(previewOpenTimerRef.current);
      previewOpenTimerRef.current = null;
    }
    previewCloseTimerRef.current = window.setTimeout(() => {
      setPreview(null);
    }, 120);
  };

  const navigate = (direction: number) => {
    setRefDate((previous) => {
      const next = new Date(previous);
      if (view === "week") {
        next.setDate(next.getDate() + direction * 7);
      } else {
        next.setMonth(next.getMonth() + direction);
      }
      return next;
    });
  };

  const renderMonthView = () => {
    return (
      <div className="overflow-x-auto">
        <div className="min-w-[740px]">
          <div className="grid grid-cols-7 border-b border-border">
            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"].map((dayLabel) => (
              <div key={dayLabel} className="border-l border-border p-2 text-center first:border-l-0">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{dayLabel}</span>
              </div>
            ))}
          </div>
          {monthGrid.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 border-b border-border last:border-0">
              {week.map((day, dayIndex) => {
                if (!day) {
                  return (
                    <div
                      key={`${weekIndex}-${dayIndex}-empty`}
                      className="min-h-[92px] border-l border-border bg-muted/20 first:border-l-0"
                    />
                  );
                }

                const date = fmtDateKey(day);
                const dayEvents = appointmentsByDate[date] || [];

                return (
                  <div
                    key={`${weekIndex}-${dayIndex}-${date}`}
                    className={`min-h-[92px] border-l border-border p-1 transition-colors hover:bg-muted/30 first:border-l-0 ${
                      isToday(day) ? "bg-primary/5" : ""
                    }`}
                    onClick={() =>
                      openCreateModal({
                        date,
                        time: getCurrentRoundedTime(),
                        durationMinutes: DEFAULT_DURATION_MINUTES,
                      })
                    }
                  >
                    <span className={`text-xs font-medium ${isToday(day) ? "font-bold text-primary" : "text-muted-foreground"}`}>
                      {day.getDate()}
                    </span>
                    <div className="mt-1 space-y-0.5">
                      {dayEvents.slice(0, 3).map((eventData) => (
                        <div
                          key={eventData.appointment.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditModal(eventData.appointment);
                          }}
                          className={`cursor-pointer truncate rounded px-1 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 ${getEventColorClass(eventData.appointment)}`}
                        >
                          {eventData.appointment.time} {eventData.appointment.patient}
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{dayEvents.length - 3} mais
                        </span>
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
    <div className="h-full space-y-6">
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3 xl:items-stretch">
        <Card className="border-border shadow-card xl:col-span-1">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Agendar Consulta</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSidebarSchedule}>
              <div className="space-y-2">
                <Label>Paciente</Label>
                <Select value={formPatient} onValueChange={setFormPatient}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar paciente" />
                  </SelectTrigger>
                  <SelectContent>
                    {patientOptions.map((patient) => (
                      <SelectItem key={patient.id} value={patient.name}>
                        {patient.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input type="date" value={formDate} onChange={(event) => setFormDate(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Horario</Label>
                  <Input type="time" value={formTime} onChange={(event) => setFormTime(event.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Duracao</Label>
                <Select value={String(formDuration)} onValueChange={(value) => setFormDuration(Number.parseInt(value, 10))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar duracao" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="45">45 min</SelectItem>
                    <SelectItem value="60">1 hora</SelectItem>
                    <SelectItem value="90">1h 30min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Profissional</Label>
                <Select value={formProfessional} onValueChange={setFormProfessional}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    {professionalOptions.map((professional) => (
                      <SelectItem key={professional.id} value={professional.id}>
                        {professional.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Motivo</Label>
                <Input
                  placeholder="Motivo da consulta"
                  value={formReason}
                  onChange={(event) => setFormReason(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Observacoes</Label>
                <Textarea
                  rows={3}
                  placeholder="Observacoes adicionais..."
                  value={formNotes}
                  onChange={(event) => setFormNotes(event.target.value)}
                />
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

        <Card className="relative border-border shadow-card xl:col-span-2 flex min-h-[70vh] flex-col xl:min-h-[calc(100vh-12rem)]">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base font-semibold">Calendario</CardTitle>
            <div className="flex items-center gap-2">
              <div className="flex items-center overflow-hidden rounded-lg border border-border">
                <button
                  onClick={() => setView("week")}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    view === "week" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Semana
                </button>
                <button
                  onClick={() => setView("month")}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    view === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  Mes
                </button>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => navigate(-1)} className="rounded-md p-1.5 transition-colors hover:bg-muted">
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </button>
                <span className="min-w-[170px] px-2 text-center text-sm font-medium">{periodLabel}</span>
                <button onClick={() => navigate(1)} className="rounded-md p-1.5 transition-colors hover:bg-muted">
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex-1 min-h-0">
            {isLoading ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 8 }).map((_, row) => (
                  <div key={row} className="flex gap-3">
                    <Skeleton className="h-5 w-14 shrink-0" />
                    <div className="grid flex-1 grid-cols-5 gap-2">
                      {Array.from({ length: 5 }).map((__, col) => (
                        <Skeleton key={col} className="h-10" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : view === "week" ? (
              <CalendarGrid
                weekDays={weekDays}
                appointmentsByDate={appointmentsByDate}
                selectedAppointmentId={selectedAppointmentId}
                onEventClick={openEditModal}
                onEmptyCellClick={handleCreateFromEmptyCell}
                onDropAppointment={(appointmentId, date, hour, minute) =>
                  void handleDragDrop(appointmentId, date, hour, minute)
                }
                onHoverStart={handleHoverStart}
                onHoverEnd={handleHoverEnd}
                onStartResize={(appointment, clientY) => {
                  const startDuration = durationById[appointment.id] || DEFAULT_DURATION_MINUTES;
                  setResizeState({
                    appointment,
                    startY: clientY,
                    startDurationMinutes: startDuration,
                  });
                }}
              />
            ) : (
              renderMonthView()
            )}
          </CardContent>
        </Card>
      </div>

      <EventModal
        open={modalOpen}
        mode={modalMode}
        appointment={editingAppointment}
        patients={patients}
        professionals={professionalOptions}
        initialDate={modalSeed.date}
        initialTime={modalSeed.time}
        initialDurationMinutes={modalSeed.durationMinutes}
        onCancel={() => {
          setModalOpen(false);
          setEditingAppointment(null);
        }}
        onSave={handleModalSave}
      />

      {preview && (
        <EventPreviewCard
          appointment={preview.appointment}
          position={preview.position}
          durationMinutes={durationById[preview.appointment.id] || DEFAULT_DURATION_MINUTES}
          onEdit={() => openEditModal(preview.appointment)}
          onDelete={() => void handleDeleteAppointment(preview.appointment)}
          onMouseEnter={() => {
            if (previewCloseTimerRef.current) {
              window.clearTimeout(previewCloseTimerRef.current);
              previewCloseTimerRef.current = null;
            }
          }}
          onMouseLeave={handleHoverEnd}
        />
      )}
    </div>
  );
};

export default Scheduling;

