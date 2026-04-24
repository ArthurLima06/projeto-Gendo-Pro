import { create } from "zustand";
import {
  getAppointments as fetchAppointments,
  createAppointment as createAppointmentApi,
  updateAppointment as updateAppointmentApi,
  deleteAppointment as deleteAppointmentApi,
  type UpdateAppointmentPayload,
  type Appointment,
} from "@/services/appointmentsService";
import type { ApiResponse } from "@/services/api";

const COLORS = [
  "bg-primary/15 border-l-primary text-primary",
  "bg-success/10 border-l-success text-success",
  "bg-warning/10 border-l-warning text-warning",
];

export type { Appointment };

interface AppointmentStore {
  appointments: Appointment[];
  isLoading: boolean;
  error: string;
  selectedDate: string | null;
  fetchAppointments: () => Promise<void>;
  addAppointment: (appt: Omit<Appointment, "id" | "color">) => Promise<void>;
  updateAppointment: (id: string, appt: UpdateAppointmentPayload) => Promise<ApiResponse<Appointment>>;
  removeAppointment: (id: string) => Promise<void>;
  setSelectedDate: (date: string | null) => void;
  getAppointmentsForDate: (date: string) => Appointment[];
  getTodayAppointments: () => Appointment[];
}

const fmt = (d: Date) => d.toISOString().split("T")[0];

export const useAppointmentStore = create<AppointmentStore>((set, get) => ({
  appointments: [],
  isLoading: false,
  error: "",
  selectedDate: null,

  fetchAppointments: async () => {
    set({ isLoading: true, error: "" });
    const res = await fetchAppointments();
    if (res.success === false) {
      set({ error: res.error.message, isLoading: false });
    } else {
      const withColors = res.data.map((a, i) => ({
        ...a,
        color: a.color || COLORS[i % COLORS.length],
      }));
      set({ appointments: withColors, isLoading: false });
    }
  },

  addAppointment: async (appt) => {
    const res = await createAppointmentApi(appt);
    if (res.success) {
      const color = COLORS[get().appointments.length % COLORS.length];
      set((s) => ({
        appointments: [...s.appointments, { ...res.data, color: res.data.color || color }],
      }));
    }
  },

  updateAppointment: async (id, appt) => {
    const res = await updateAppointmentApi(id, appt);
    if (res.success) {
      set((state) => ({
        appointments: state.appointments.map((item, index) => {
          if (item.id !== id) return item;
          const fallbackColor = COLORS[index % COLORS.length];
          return {
            ...res.data,
            color: item.color || res.data.color || fallbackColor,
          };
        }),
      }));
    }
    return res;
  },

  removeAppointment: async (id) => {
    const res = await deleteAppointmentApi(id);
    if (res.success) {
      set((s) => ({ appointments: s.appointments.filter((a) => a.id !== id) }));
    }
  },

  setSelectedDate: (date) => set({ selectedDate: date }),

  getAppointmentsForDate: (date) => get().appointments.filter((a) => a.date === date),

  getTodayAppointments: () => {
    const todayStr = fmt(new Date());
    return get().appointments.filter((a) => a.date === todayStr);
  },
}));
