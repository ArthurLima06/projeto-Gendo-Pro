import { api, type ApiResponse } from "./api";

export type AgreementStatus = "ativo" | "inativo";

export interface Agreement {
  id: string;
  name: string;
  careType?: string | null;
  plans: string[];
  notes?: string | null;
  status: AgreementStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgreementPayload {
  name: string;
  careType?: string;
  plans: string[];
  notes?: string;
  status: AgreementStatus;
}

export interface UpdateAgreementPayload {
  name?: string;
  careType?: string;
  plans?: string[];
  notes?: string;
  status?: AgreementStatus;
}

export async function getAgreements(params?: {
  status?: AgreementStatus;
  activeOnly?: boolean;
}): Promise<ApiResponse<Agreement[]>> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.activeOnly) query.set("active_only", "1");
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return api.get<Agreement[]>(`/agreements${suffix}`);
}

export async function createAgreement(
  payload: CreateAgreementPayload
): Promise<ApiResponse<Agreement>> {
  return api.post<Agreement>("/agreements", payload);
}

export async function updateAgreement(
  id: string,
  payload: UpdateAgreementPayload
): Promise<ApiResponse<Agreement>> {
  return api.put<Agreement>(`/agreements/${id}`, payload);
}

export async function deleteAgreement(
  id: string
): Promise<ApiResponse<{ id: string; deleted: boolean }>> {
  return api.delete<{ id: string; deleted: boolean }>(`/agreements/${id}`);
}
