import { api, type ApiResponse } from "./api";

export interface FinancialRecord {
  id: string;
  patient: string;
  date: string;
  amount: string;
  status: "Pago" | "Pendente" | "Atrasado";
  method?: string | null;
  notes?: string | null;
  registeredAt: string;
}

export interface CreateFinancialPayload {
  patient: string;
  date: string;
  amount: string;
  status: string;
  method?: string;
  notes?: string;
}

export interface UpdateFinancialPayload {
  patient?: string;
  date?: string;
  amount?: string;
  status?: string;
  method?: string;
  notes?: string;
}

export interface FinancialReportParams {
  patientId: string;
  startDate: string;
  endDate: string;
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

function buildFinancialReportUrl(params: FinancialReportParams): string {
  const query = new URLSearchParams({
    start_date: params.startDate,
    end_date: params.endDate,
  });
  return `/api/reports/financial/patient/${encodeURIComponent(params.patientId)}/pdf?${query.toString()}`;
}

function extractFilename(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) return fallback;
  const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      return encodedMatch[1];
    }
  }
  const simpleMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  return simpleMatch?.[1] || fallback;
}

export async function generateFinancialPdfReport(params: FinancialReportParams): Promise<void> {
  const token = sessionStorage.getItem("gendo_auth_token");
  const response = await fetch(buildFinancialReportUrl(params), {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    let message = "Erro ao gerar relatorio financeiro.";
    try {
      const payload = (await response.json()) as { error?: { message?: string } };
      message = payload?.error?.message || message;
    } catch {
      // ignore parsing errors
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const filename = extractFilename(
    response.headers.get("content-disposition"),
    `relatorio_financeiro_${params.patientId}_${params.startDate}_${params.endDate}.pdf`
  );

  const downloadUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = downloadUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(downloadUrl);
}
