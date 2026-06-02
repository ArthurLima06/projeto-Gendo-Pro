import { api, type ApiResponse } from "./api";

export interface MedicalRecord {
  id: string;
  patientId?: string | null;
  patient: string;
  patientCpf?: string | null;
  date: string;
  time?: string | null;
  reason: string;
  description?: string | null;
  evolution?: string | null;
  professional?: string | null;
  notes?: string;
  attachments?: string[];
  registeredAt: string;
}

export interface CreateRecordPayload {
  patient: string;
  date: string;
  time: string;
  notes?: string;
}

export async function getRecords(): Promise<ApiResponse<MedicalRecord[]>> {
  return api.get<MedicalRecord[]>("/records");
}

export async function getRecordsByPatient(
  patientId: string
): Promise<ApiResponse<MedicalRecord[]>> {
  return api.get<MedicalRecord[]>(`/records/patient/${patientId}`);
}

export async function createRecord(
  data: CreateRecordPayload
): Promise<ApiResponse<MedicalRecord>> {
  return api.post<MedicalRecord>("/records", data);
}
