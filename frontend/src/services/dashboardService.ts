import { api, type ApiResponse } from "./api";

export interface DashboardStat {
  label: string;
  value: string;
  icon: string;
  change: string;
}

export interface DashboardAppointment {
  id: string;
  patient: string;
  time: string;
  professional: string;
  status: string;
}

export interface DashboardPayment {
  patient: string;
  amount: string;
  status: string;
  date: string;
}

export interface DashboardData {
  stats: DashboardStat[];
  todayAppointments: DashboardAppointment[];
  recentPayments: DashboardPayment[];
  summary: string;
}

export async function getDashboardData(): Promise<ApiResponse<DashboardData>> {
  return api.get<DashboardData>("/dashboard");
}
