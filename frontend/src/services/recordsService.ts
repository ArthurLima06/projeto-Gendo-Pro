import { api, type ApiResponse } from "./api";

export interface MedicalRecord {
  id: string;
  patient: string;
  date: string;
  time: string;
  reason: string;
  notes?: string;
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

export async function createRecord(
  data: CreateRecordPayload
): Promise<ApiResponse<MedicalRecord>> {
  return api.post<MedicalRecord>("/records", data);
}
