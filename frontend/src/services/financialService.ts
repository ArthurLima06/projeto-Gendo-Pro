import { api, type ApiResponse } from "./api";

export interface FinancialRecord {
  id: string;
  patient: string;
  date: string;
  amount: string;
  status: "Pago" | "Pendente" | "Atrasado";
  registeredAt: string;
}

export interface CreateFinancialPayload {
  patient: string;
  date: string;
  amount: string;
  status: string;
}

export async function getFinancialRecords(): Promise<ApiResponse<FinancialRecord[]>> {
  return api.get<FinancialRecord[]>("/financial");
}

export async function createFinancialRecord(
  data: CreateFinancialPayload
): Promise<ApiResponse<FinancialRecord>> {
  return api.post<FinancialRecord>("/financial", data);
}
