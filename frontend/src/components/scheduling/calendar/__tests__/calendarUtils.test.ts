import { describe, expect, it } from "vitest";
import {
  getAppointmentRenderData,
  roundTimeToFiveMinutes,
} from "@/components/scheduling/calendar/calendarUtils";
import type { Appointment } from "@/stores/appointmentStore";

const baseAppointment: Appointment = {
  id: "apt-1",
  patient: "Paciente Teste",
  date: "2026-04-30",
  time: "18:15",
  professional: "Dr. Silva",
  reason: "Avaliacao",
  notes: "Observacoes",
};

describe("calendarUtils", () => {
  it("rounds minutes to 5-minute intervals", () => {
    expect(roundTimeToFiveMinutes(10, 2)).toBe("10:00");
    expect(roundTimeToFiveMinutes(10, 28)).toBe("10:30");
    expect(roundTimeToFiveMinutes(10, 58)).toBe("11:00");
  });

  it("calculates precise event top and height by minute and duration", () => {
    const render = getAppointmentRenderData(baseAppointment, 60);
    expect(render.startHour).toBe(18);
    expect(render.minuteInHour).toBe(15);
    expect(render.top).toBeCloseTo(13, 0);
    expect(render.height).toBe(52);
  });
});

