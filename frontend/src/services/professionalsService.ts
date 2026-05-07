import { api, type ApiResponse } from "./api";

export type ProfessionalRole = "admin" | "common";

export interface Professional {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: ProfessionalRole;
  futurePlan?: string | null;
  futureStatus?: string | null;
  futureCompanyId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProfessionalPayload {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: ProfessionalRole;
}

export interface UpdateProfessionalPayload {
  name?: string;
  email?: string;
  password?: string;
  phone?: string;
  role?: ProfessionalRole;
  future_plan?: string | null;
  future_status?: string | null;
  future_company_id?: string | null;
}

export async function getProfessionals(): Promise<ApiResponse<Professional[]>> {
  return api.get<Professional[]>("/professionals");
}

export async function createProfessional(
  data: CreateProfessionalPayload
): Promise<ApiResponse<Professional>> {
  return api.post<Professional>("/professionals", data);
}

export async function updateProfessional(
  id: string,
  data: UpdateProfessionalPayload
): Promise<ApiResponse<Professional>> {
  return api.put<Professional>(`/professionals/${id}`, data);
}

export async function deleteProfessional(
  id: string
): Promise<ApiResponse<{ id: string; deleted: boolean }>> {
  return api.delete<{ id: string; deleted: boolean }>(`/professionals/${id}`);
}
