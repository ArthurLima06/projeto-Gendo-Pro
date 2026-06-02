import { api, type ApiResponse } from "./api";

export interface Appointment {
  id: string;
  patientId?: string | null;
  patient: string;
  patientCpf?: string | null;
  date: string;
  time: string;
  professional: string;
  professionalSpecialty?: string | null;
  professionalDisplay?: string | null;
  professionalId?: string | null;
  reason: string;
  notes: string;
  careType: "particular" | "convenio";
  agreementId?: string | null;
  agreementName?: string | null;
  agreementPlan?: string | null;
  duration?: number;
  color?: string;
}

export interface CreateAppointmentPayload {
  patient: string;
  date: string;
  time: string;
  professional: string;
  professional_id?: string;
  reason: string;
  notes: string;
  careType: "particular" | "convenio";
  agreementId?: string;
  agreementPlan?: string;
  duration?: number;
}

export interface UpdateAppointmentPayload {
  patient?: string;
  patient_id?: string;
  date?: string;
  time?: string;
  professional?: string;
  professional_id?: string;
  reason?: string;
  notes?: string;
  careType?: "particular" | "convenio";
  agreementId?: string;
  agreementPlan?: string;
  duration?: number;
  status?: string;
}

export async function getAppointments(): Promise<ApiResponse<Appointment[]>> {
  return api.get<Appointment[]>("/appointments");
}

export async function createAppointment(
  data: CreateAppointmentPayload
): Promise<ApiResponse<Appointment>> {
  return api.post<Appointment>("/appointments", data);
}

export async function updateAppointment(
  id: string,
  data: UpdateAppointmentPayload
): Promise<ApiResponse<Appointment>> {
  return api.put<Appointment>(`/appointments/${id}`, data);
}

export async function deleteAppointment(
  id: string
): Promise<ApiResponse<{ deleted: boolean }>> {
  return api.delete<{ deleted: boolean }>(`/appointments/${id}`);
}
