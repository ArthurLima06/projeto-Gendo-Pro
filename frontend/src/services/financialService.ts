import { api, type ApiResponse } from "./api";
import { downloadReportFile, type DateRangeReportParams } from "./reportsService";

export interface FinancialRecord {
  id: string;
  patientId?: string | null;
  patient: string;
  patientCpf?: string | null;
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
  updatedAt?: string | null;
  type?: "payment" | "charge" | "adjustment";
  source?: string | null;
  appointmentId?: string | null;
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

export interface FinancialSummary {
  balance: number;
  totalPaid: number;
  totalPending: number;
  totalOverdue: number;
  totalConvenio: number;
  totalParticular: number;
}

export interface FinancialSettings {
  autoCharge: boolean;
  consultationPrice: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface FinancialPatientListItem {
  id: string;
  name: string;
  cpf?: string | null;
  careType: "particular" | "convenio";
  agreementId?: string | null;
  agreementName?: string | null;
  agreementPlan?: string | null;
  summary: FinancialSummary;
  settings: FinancialSettings;
  transactionsCount: number;
}

export interface FinancialPatientDetail {
  patient: {
    id: string;
    name: string;
    cpf?: string | null;
    careType: "particular" | "convenio";
    agreementId?: string | null;
    agreementName?: string | null;
    agreementPlan?: string | null;
  };
  summary: FinancialSummary;
  settings: FinancialSettings;
  transactions: FinancialRecord[];
}

export interface CreatePatientFinancialTransactionPayload {
  date: string;
  amount: string;
  careType: "particular" | "convenio";
  method?: string;
  notes?: string;
  type?: "payment" | "charge" | "adjustment";
  status?: "Pago" | "Pendente" | "Atrasado" | "Convenio";
  agreementId?: string;
  agreementPlan?: string;
}

export async function getFinancialRecords(): Promise<ApiResponse<FinancialRecord[]>> {
  return api.get<FinancialRecord[]>("/financial");
}

export async function getFinancialPatients(): Promise<ApiResponse<FinancialPatientListItem[]>> {
  return api.get<FinancialPatientListItem[]>("/financial/patients");
}

export async function getFinancialPatientDetail(
  patientId: string
): Promise<ApiResponse<FinancialPatientDetail>> {
  return api.get<FinancialPatientDetail>(`/financial/patient/${patientId}`);
}

export async function createPatientFinancialTransaction(
  patientId: string,
  data: CreatePatientFinancialTransactionPayload
): Promise<ApiResponse<FinancialRecord>> {
  return api.post<FinancialRecord>(`/financial/patient/${patientId}/transactions`, data);
}

export async function updateFinancialPatientSettings(
  patientId: string,
  data: Pick<FinancialSettings, "autoCharge" | "consultationPrice">
): Promise<ApiResponse<FinancialSettings>> {
  return api.put<FinancialSettings>(`/financial/patient/${patientId}/settings`, data);
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
