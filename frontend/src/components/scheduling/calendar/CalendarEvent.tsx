import { useMemo } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Appointment } from "@/stores/appointmentStore";
import { getEventColorClass } from "@/components/scheduling/calendar/calendarUtils";

interface CalendarEventProps {
  appointment: Appointment;
  top: number;
  height: number;
  laneIndex: number;
  laneCount: number;
  isSelected: boolean;
  onClick: (appointment: Appointment) => void;
  onHoverStart: (appointment: Appointment, eventRect: DOMRect) => void;
  onHoverEnd: () => void;
  onStartResize: (appointment: Appointment, clientY: number) => void;
}

const CalendarEvent = ({
  appointment,
  top,
  height,
  laneIndex,
  laneCount,
  isSelected,
  onClick,
  onHoverStart,
  onHoverEnd,
  onStartResize,
}: CalendarEventProps) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `appointment|${appointment.id}`,
    data: {
      appointmentId: appointment.id,
    },
  });

  const eventColorClass = getEventColorClass(appointment);

  const style = useMemo(() => {
    const laneWidth = 100 / Math.max(1, laneCount);
    const xStart = laneIndex * laneWidth;
    const xEnd = 100 - xStart - laneWidth;
    return {
      top: `${top}px`,
      height: `${height}px`,
      left: `${xStart}%`,
      right: `${xEnd}%`,
      transform: CSS.Translate.toString(transform),
      zIndex: isDragging ? 70 : isSelected ? 50 : 30,
      opacity: isDragging ? 0.55 : 1,
    } as const;
  }, [laneIndex, laneCount, top, height, transform, isDragging, isSelected]);

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-testid={`calendar-event-${appointment.id}`}
      className={`group absolute cursor-pointer rounded-md border-l-[3px] px-2 py-1.5 text-xs font-medium shadow-sm transition-all ${eventColorClass} ${
        isSelected ? "ring-2 ring-primary/50" : "hover:brightness-95"
      }`}
      style={style}
      onClick={(event) => {
        event.stopPropagation();
        onClick(appointment);
      }}
      onMouseEnter={(event) => onHoverStart(appointment, event.currentTarget.getBoundingClientRect())}
      onMouseLeave={onHoverEnd}
    >
      <span className="block truncate">{appointment.patient}</span>
      <span className="block text-[10px] opacity-80">{appointment.time}</span>

      <button
        type="button"
        className="absolute bottom-0 left-0 right-0 h-2 cursor-row-resize rounded-b-md bg-foreground/15 opacity-70 transition-colors hover:bg-foreground/25"
        onMouseDown={(event) => {
          event.stopPropagation();
          onStartResize(appointment, event.clientY);
        }}
        aria-label="Redimensionar duracao"
      />
    </div>
  );
};

export default CalendarEvent;
