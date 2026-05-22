import type { Appointment } from "@/stores/appointmentStore";

export const HOUR_CELL_HEIGHT = 52;
export const HOURS = Array.from({ length: 24 }, (_, index) => index);
export const DAY_NAMES_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
export const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Marco",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export const DEFAULT_DURATION_MINUTES = 60;
export const MIN_DURATION_MINUTES = 15;
export const SLOT_INTERVAL_MINUTES = 5;

export interface AppointmentRenderData {
  appointment: Appointment;
  startMinutes: number;
  endMinutes: number;
  startHour: number;
  minuteInHour: number;
  durationMinutes: number;
  top: number;
  height: number;
}

export function getWeekDays(ref: Date): Date[] {
  const d = new Date(ref);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);

  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday);
    dd.setDate(monday.getDate() + i);
    return dd;
  });
}

export function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const rows: (Date | null)[][] = [];

  for (let week = 0; week < 6; week++) {
    const row: (Date | null)[] = [];
    for (let day = 0; day < 7; day++) {
      const index = week * 7 + day - startDay;
      if (index >= 0 && index < last.getDate()) {
        row.push(new Date(year, month, index + 1));
      } else {
        row.push(null);
      }
    }
    if (row.some(Boolean)) {
      rows.push(row);
    }
  }

  return rows;
}

export function fmtDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isToday(date: Date): boolean {
  return fmtDateKey(date) === fmtDateKey(new Date());
}

export function getHourAndMinute(time: string) {
  const [hourRaw = "0", minuteRaw = "0"] = time.split(":");
  const hour = Number.parseInt(hourRaw, 10);
  const minute = Number.parseInt(minuteRaw, 10);

  return {
    hour: Number.isFinite(hour) ? ((hour % 24) + 24) % 24 : 0,
    minute: Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0,
  };
}

export function toDayMinutes(time: string): number {
  const { hour, minute } = getHourAndMinute(time);
  return hour * 60 + minute;
}

export function formatHourAndMinute(hour: number, minute: number): string {
  const normalizedHour = ((hour % 24) + 24) % 24;
  const normalizedMinute = Math.min(59, Math.max(0, minute));
  return `${String(normalizedHour).padStart(2, "0")}:${String(normalizedMinute).padStart(2, "0")}`;
}

export function formatTimeFromDayMinutes(dayMinutes: number): string {
  const normalized = ((dayMinutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return formatHourAndMinute(hour, minute);
}

export function roundToNearestFive(minutes: number) {
  return Math.round(minutes / SLOT_INTERVAL_MINUTES) * SLOT_INTERVAL_MINUTES;
}

export function roundTimeToFiveMinutes(hour: number, minute: number) {
  const roundedMinute = roundToNearestFive(minute);
  if (roundedMinute === 60) {
    return formatHourAndMinute(hour + 1, 0);
  }
  return formatHourAndMinute(hour, roundedMinute);
}

export function clampDuration(durationMinutes: number) {
  return Math.max(MIN_DURATION_MINUTES, Math.min(24 * 60, durationMinutes));
}

export function getAppointmentRenderData(
  appointment: Appointment,
  durationMinutes: number
): AppointmentRenderData {
  const startMinutes = toDayMinutes(appointment.time);
  const safeDuration = clampDuration(durationMinutes);
  const startHour = Math.floor(startMinutes / 60);
  const minuteInHour = startMinutes % 60;
  return {
    appointment,
    startMinutes,
    endMinutes: Math.min(24 * 60, startMinutes + safeDuration),
    startHour,
    minuteInHour,
    durationMinutes: safeDuration,
    top: (minuteInHour / 60) * HOUR_CELL_HEIGHT,
    height: Math.max((safeDuration / 60) * HOUR_CELL_HEIGHT, 16),
  };
}

export function getEventColorClass(appointment: Appointment) {
  if (appointment.status === "cancelado") {
    return "bg-destructive/10 border-l-destructive text-destructive";
  }
  if (appointment.status === "concluido") {
    return "bg-success/10 border-l-success text-success";
  }
  if (appointment.status === "confirmado") {
    return "bg-primary/15 border-l-primary text-primary";
  }
  return appointment.color || "bg-warning/10 border-l-warning text-warning";
}

export function buildWeekPeriodLabel(weekDays: Date[]) {
  const start = weekDays[0];
  const end = weekDays[6];
  const startDay = start.getDate();
  const endDay = end.getDate();
  const startMonth = start.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  const endMonth = end.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
  if (start.getMonth() === end.getMonth()) {
    return `${startDay} - ${endDay} ${startMonth}, ${start.getFullYear()}`;
  }
  return `${startDay} ${startMonth} - ${endDay} ${endMonth}, ${end.getFullYear()}`;
}

export function buildMonthPeriodLabel(refDate: Date) {
  return `${MONTH_NAMES[refDate.getMonth()]} ${refDate.getFullYear()}`;
}

export function buildDayPeriodLabel(refDate: Date) {
  return refDate.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).replace(".", "");
}

export function addDaysToDateKey(dateKey: string, offsetDays: number) {
  const [yearRaw = "0", monthRaw = "1", dayRaw = "1"] = dateKey.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  const date = new Date(year, Math.max(0, month - 1), day, 12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return fmtDateKey(date);
}

export function formatDatePtBr(dateKey: string) {
  const [yearRaw = "0", monthRaw = "1", dayRaw = "1"] = dateKey.split("-");
  const year = Number.parseInt(yearRaw, 10);
  const month = Number.parseInt(monthRaw, 10);
  const day = Number.parseInt(dayRaw, 10);
  return new Date(year, Math.max(0, month - 1), day, 12, 0, 0, 0).toLocaleDateString("pt-BR");
}
