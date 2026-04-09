import { api, type ApiResponse } from "./api";

export interface Patient {
  id: string;
  name: string;
  age?: string;
  school?: string;
  responsible?: string;
  phone: string;
  email: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePatientPayload {
  name: string;
  age?: string;
  school?: string;
  responsible?: string;
  phone: string;
  email: string;
  notes?: string;
}

export async function getPatients(): Promise<ApiResponse<Patient[]>> {
  return api.get<Patient[]>("/patients");
}

export async function getPatient(id: string): Promise<ApiResponse<Patient>> {
  return api.get<Patient>(`/patients/${id}`);
}

export async function createPatient(
  data: CreatePatientPayload
): Promise<ApiResponse<Patient>> {
  return api.post<Patient>("/patients", data);
}

export async function updatePatient(
  id: string,
  data: Partial<CreatePatientPayload>
): Promise<ApiResponse<Patient>> {
  return api.put<Patient>(`/patients/${id}`, data);
}

export async function deletePatient(
  id: string
): Promise<ApiResponse<{ deleted: boolean }>> {
  return api.delete<{ deleted: boolean }>(`/patients/${id}`);
}
