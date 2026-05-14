import { api, type ApiResponse } from "./api";
import { downloadReportFile, type DateRangeReportParams } from "./reportsService";

export interface FinancialRecord {
  id: string;
  patient: string;
  date: string;
  amount: string;
  status: "Pago" | "Pendente" | "Atrasado" | "Convenio";
  careType: "particular" | "convenio";
  agreementId?: string | null;
  agreementName?: string | null;
  agreementPlan?: string | null;
  method?: string | null;
  notes?: string | null;
  registeredAt: string;
}

export interface CreateFinancialPayload {
  patient: string;
  date: string;
  amount: string;
  careType: "particular" | "convenio";
  status?: string;
  agreementId?: string;
  agreementPlan?: string;
  method?: string;
  notes?: string;
}

export interface UpdateFinancialPayload {
  patient?: string;
  date?: string;
  amount?: string;
  careType?: "particular" | "convenio";
  status?: string;
  agreementId?: string;
  agreementPlan?: string;
  method?: string;
  notes?: string;
}

export interface FinancialReportParams extends DateRangeReportParams {
  patientId: string;
}

export async function getFinancialRecords(): Promise<ApiResponse<FinancialRecord[]>> {
  return api.get<FinancialRecord[]>("/financial");
}

export async function createFinancialRecord(
  data: CreateFinancialPayload
): Promise<ApiResponse<FinancialRecord>> {
  return api.post<FinancialRecord>("/financial", data);
}

export async function updateFinancialRecord(
  id: string,
  data: UpdateFinancialPayload
): Promise<ApiResponse<FinancialRecord>> {
  return api.put<FinancialRecord>(`/financial/${id}`, data);
}

function buildFinancialReportPath(patientId: string, format: "pdf" | "excel"): string {
  return `/reports/financial/patient/${encodeURIComponent(patientId)}/${format}`;
}

export async function generateFinancialPdfReport(params: FinancialReportParams): Promise<void> {
  const fallbackFilename = `relatorio_financeiro_${params.patientId}_${params.startDate}_${params.endDate}.pdf`;
  return downloadReportFile(
    buildFinancialReportPath(params.patientId, "pdf"),
    params,
    fallbackFilename,
    "Erro ao gerar relatorio financeiro."
  );
}

export async function generateFinancialExcelReport(params: FinancialReportParams): Promise<void> {
  const fallbackFilename = `relatorio_financeiro_${params.patientId}_${params.startDate}_${params.endDate}.xlsx`;
  return downloadReportFile(
    buildFinancialReportPath(params.patientId, "excel"),
    params,
    fallbackFilename,
    "Erro ao gerar relatorio financeiro."
  );
}
