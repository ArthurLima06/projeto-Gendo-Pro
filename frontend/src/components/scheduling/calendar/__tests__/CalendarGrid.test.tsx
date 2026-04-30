import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CalendarGrid from "@/components/scheduling/calendar/CalendarGrid";
import { fmtDateKey, getAppointmentRenderData } from "@/components/scheduling/calendar/calendarUtils";
import type { Appointment } from "@/stores/appointmentStore";

function buildWeek() {
  const monday = new Date("2026-04-27T12:00:00");
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return day;
  });
}

const sampleAppointment: Appointment = {
  id: "apt-1",
  patient: "Paciente Teste",
  date: "2026-04-27",
  time: "10:15",
  professional: "Dr. Silva",
  reason: "Avaliacao",
  notes: "Observacoes",
};

describe("CalendarGrid interactions", () => {
  it("opens edit on event click and does not trigger empty cell creation", () => {
    const weekDays = buildWeek();
    const onEventClick = vi.fn();
    const onEmptyCellClick = vi.fn();

    render(
      <CalendarGrid
        weekDays={weekDays}
        appointmentsByDate={{
          [sampleAppointment.date]: [getAppointmentRenderData(sampleAppointment, 60)],
        }}
        selectedAppointmentId={null}
        onEventClick={onEventClick}
        onEmptyCellClick={onEmptyCellClick}
        onDropAppointment={vi.fn()}
        onHoverStart={vi.fn()}
        onHoverEnd={vi.fn()}
        onStartResize={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId("calendar-event-apt-1"));

    expect(onEventClick).toHaveBeenCalledTimes(1);
    expect(onEventClick).toHaveBeenCalledWith(sampleAppointment);
    expect(onEmptyCellClick).not.toHaveBeenCalled();
  });

  it("opens creation flow when clicking an empty cell", () => {
    const weekDays = buildWeek();
    const onEmptyCellClick = vi.fn();
    const dateKey = fmtDateKey(weekDays[0]);

    render(
      <CalendarGrid
        weekDays={weekDays}
        appointmentsByDate={{}}
        selectedAppointmentId={null}
        onEventClick={vi.fn()}
        onEmptyCellClick={onEmptyCellClick}
        onDropAppointment={vi.fn()}
        onHoverStart={vi.fn()}
        onHoverEnd={vi.fn()}
        onStartResize={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId(`calendar-cell-${dateKey}-9`), { clientY: 12 });

    expect(onEmptyCellClick).toHaveBeenCalledTimes(1);
    expect(onEmptyCellClick).toHaveBeenCalledWith(dateKey, 9, expect.any(Number));
  });
});

