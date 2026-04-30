import { useEffect, useMemo, useRef, useState } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import CalendarEvent from "@/components/scheduling/calendar/CalendarEvent";
import {
  DAY_NAMES_SHORT,
  fmtDateKey,
  HOUR_CELL_HEIGHT,
  HOURS,
  isToday,
  type AppointmentRenderData,
} from "@/components/scheduling/calendar/calendarUtils";
import type { Appointment } from "@/stores/appointmentStore";

interface CalendarGridProps {
  weekDays: Date[];
  appointmentsByDate: Record<string, AppointmentRenderData[]>;
  selectedAppointmentId: string | null;
  onEventClick: (appointment: Appointment) => void;
  onEmptyCellClick: (date: string, hour: number, minute: number) => void;
  onDropAppointment: (appointmentId: string, date: string, hour: number, minute: number) => void;
  onHoverStart: (appointment: Appointment, eventRect: DOMRect) => void;
  onHoverEnd: () => void;
  onStartResize: (appointment: Appointment, clientY: number) => void;
}

function createSlotId(date: string, hour: number, minute: number) {
  return `slot|${date}|${hour}|${minute}`;
}

function createCellId(date: string, hour: number) {
  return `cell|${date}|${hour}|0`;
}

function parseDropTarget(dropId: string) {
  const [type, date, hourRaw, minuteRaw] = dropId.split("|");
  const hour = Number.parseInt(hourRaw || "0", 10);
  const minute = Number.parseInt(minuteRaw || "0", 10);
  return {
    type,
    date: date || "",
    hour: Number.isFinite(hour) ? Math.max(0, Math.min(23, hour)) : 0,
    minute: Number.isFinite(minute) ? Math.max(0, Math.min(59, minute)) : 0,
  };
}

function DropSlot({
  id,
  top,
  height,
}: {
  id: string;
  top: number;
  height: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`pointer-events-none absolute left-0 right-0 transition-colors ${isOver ? "bg-primary/20" : ""}`}
      style={{ top: `${top}px`, height: `${height}px` }}
    />
  );
}

function DraggableGhost({ appointment }: { appointment: Appointment }) {
  return (
    <div className="w-56 rounded-md border border-border bg-background/90 px-2 py-1.5 text-xs shadow-lg">
      <p className="truncate font-medium">{appointment.patient}</p>
      <p className="text-[11px] text-muted-foreground">{appointment.time}</p>
    </div>
  );
}

function getCurrentTimePosition() {
  const now = new Date();
  return {
    hour: now.getHours(),
    minute: now.getMinutes(),
  };
}

function buildLanes(events: AppointmentRenderData[]) {
  const sorted = [...events].sort((a, b) => a.top - b.top || b.height - a.height);
  const laneEnds: number[] = [];
  const laneById: Record<string, number> = {};
  let laneCount = 1;

  for (const event of sorted) {
    let assignedLane = laneEnds.findIndex((laneEnd) => laneEnd <= event.top + 1);
    if (assignedLane === -1) {
      laneEnds.push(event.top + event.height);
      assignedLane = laneEnds.length - 1;
    } else {
      laneEnds[assignedLane] = event.top + event.height;
    }

    laneById[event.appointment.id] = assignedLane;
    laneCount = Math.max(laneCount, laneEnds.length);
  }

  return {
    laneById,
    laneCount,
  };
}

const CalendarGrid = ({
  weekDays,
  appointmentsByDate,
  selectedAppointmentId,
  onEventClick,
  onEmptyCellClick,
  onDropAppointment,
  onHoverStart,
  onHoverEnd,
  onStartResize,
}: CalendarGridProps) => {
  const [draggingAppointment, setDraggingAppointment] = useState<Appointment | null>(null);
  const [currentTime, setCurrentTime] = useState(getCurrentTimePosition());
  const [scrollbarCompensation, setScrollbarCompensation] = useState(0);
  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const didScrollToNowRef = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    })
  );

  const hasAnyEvents = useMemo(
    () => weekDays.some((day) => (appointmentsByDate[fmtDateKey(day)] || []).length > 0),
    [weekDays, appointmentsByDate]
  );

  useEffect(() => {
    if (didScrollToNowRef.current) {
      return;
    }

    const target = gridScrollRef.current;
    if (!target) {
      return;
    }

    const now = new Date();
    const scrollTarget = now.getHours() * HOUR_CELL_HEIGHT - HOUR_CELL_HEIGHT * 2;
    target.scrollTop = Math.max(0, scrollTarget);
    didScrollToNowRef.current = true;
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setCurrentTime(getCurrentTimePosition());
    }, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateScrollbarCompensation = () => {
      const target = gridScrollRef.current;
      if (!target) {
        setScrollbarCompensation(0);
        return;
      }
      setScrollbarCompensation(Math.max(0, target.offsetWidth - target.clientWidth));
    };

    updateScrollbarCompensation();
    window.addEventListener("resize", updateScrollbarCompensation);
    return () => window.removeEventListener("resize", updateScrollbarCompensation);
  }, [weekDays.length]);

  const handleDragStart = (event: DragStartEvent) => {
    const activeId = String(event.active.id);
    if (!activeId.startsWith("appointment|")) {
      return;
    }
    const appointmentId = activeId.split("|")[1];
    const appointment = Object.values(appointmentsByDate)
      .flat()
      .find((item) => item.appointment.id === appointmentId)?.appointment;
    if (appointment) {
      setDraggingAppointment(appointment);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingAppointment(null);
    const activeId = String(event.active.id || "");
    const dropId = event.over?.id ? String(event.over.id) : "";
    if (!activeId.startsWith("appointment|") || !dropId) {
      return;
    }

    const appointmentId = activeId.split("|")[1];
    const target = parseDropTarget(dropId);
    if (!target.date) {
      return;
    }

    onDropAppointment(appointmentId, target.date, target.hour, target.minute);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingAppointment(null)}
    >
      <div className="overflow-x-auto">
        <div className="min-w-[740px]">
          <div
            className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border"
            style={{ paddingRight: `${scrollbarCompensation}px` }}
          >
            <div className="p-2" />
            {weekDays.map((day, index) => (
              <div key={index} className={`border-l border-border p-3 text-center ${isToday(day) ? "bg-primary/5" : ""}`}>
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {DAY_NAMES_SHORT[day.getDay()]}
                </span>
                <p className={`mt-0.5 text-lg font-semibold ${isToday(day) ? "text-primary" : ""}`}>
                  {day.getDate()}
                </p>
              </div>
            ))}
          </div>

          <div
            ref={gridScrollRef}
            className="max-h-[65vh] overflow-y-auto [scrollbar-gutter:stable]"
          >
            {HOURS.map((hour) => (
              <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border last:border-0">
                <div className="p-2 pr-3 text-right">
                  <span className="tabular-nums text-xs text-muted-foreground">
                    {String(hour).padStart(2, "0")}:00
                  </span>
                </div>

                {weekDays.map((day, dayIndex) => {
                  const date = fmtDateKey(day);
                  const dayEvents = appointmentsByDate[date] || [];
                  const events = dayEvents.filter((item) => item.startHour === hour);
                  const laneData = buildLanes(events);
                  const showCurrentTimeLine =
                    isToday(day) && hour === currentTime.hour;

                  const minuteFromClick = (event: React.MouseEvent<HTMLDivElement>) => {
                    const rect = event.currentTarget.getBoundingClientRect();
                    const y = event.clientY - rect.top;
                    const ratio = Math.min(0.999, Math.max(0, y / rect.height));
                    return Math.min(59, Math.floor(ratio * 60));
                  };

                  return (
                    <div
                      key={`${date}-${dayIndex}-${hour}`}
                      data-testid={`calendar-cell-${date}-${hour}`}
                      onClick={(event) => onEmptyCellClick(date, hour, minuteFromClick(event))}
                      className={`relative min-h-[52px] cursor-pointer border-l border-border transition-colors hover:bg-muted/30 ${
                        isToday(day) ? "bg-primary/[0.02]" : ""
                      }`}
                      style={{ height: `${HOUR_CELL_HEIGHT}px` }}
                    >
                      {Array.from({ length: 12 }, (_, slotIndex) => {
                        const minute = slotIndex * 5;
                        return (
                          <DropSlot
                            key={createSlotId(date, hour, minute)}
                            id={createSlotId(date, hour, minute)}
                            top={(slotIndex / 12) * HOUR_CELL_HEIGHT}
                            height={HOUR_CELL_HEIGHT / 12}
                          />
                        );
                      })}
                      <DropSlot
                        id={createCellId(date, hour)}
                        top={0}
                        height={HOUR_CELL_HEIGHT}
                      />

                      {showCurrentTimeLine && (
                        <div
                          className="pointer-events-none absolute left-0 right-0 z-[40] border-t-2 border-red-500"
                          style={{ top: `${(currentTime.minute / 60) * HOUR_CELL_HEIGHT}px` }}
                        />
                      )}

                      {events.map((item) => (
                        <CalendarEvent
                          key={item.appointment.id}
                          appointment={item.appointment}
                          top={item.top}
                          height={item.height}
                          laneIndex={laneData.laneById[item.appointment.id] || 0}
                          laneCount={laneData.laneCount}
                          isSelected={selectedAppointmentId === item.appointment.id}
                          onClick={onEventClick}
                          onHoverStart={onHoverStart}
                          onHoverEnd={onHoverEnd}
                          onStartResize={onStartResize}
                        />
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
      </div>

      <DragOverlay dropAnimation={null}>
        {draggingAppointment ? <DraggableGhost appointment={draggingAppointment} /> : null}
      </DragOverlay>
    </DndContext>
  );
};

export default CalendarGrid;
