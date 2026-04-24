const BASE_URL = "/api";

export interface ReportDownloadParams {
  patientId: string;
  startDate: string;
  endDate: string;
}

interface ApiErrorPayload {
  error?: {
    message?: string;
  };
}

function buildReportUrl(path: string, params: ReportDownloadParams): string {
  const query = new URLSearchParams({
    start_date: params.startDate,
    end_date: params.endDate,
  });
  return `${BASE_URL}${path}?${query.toString()}`;
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

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const json = (await response.json()) as ApiErrorPayload;
      return json?.error?.message || fallback;
    } catch {
      return fallback;
    }
  }

  return fallback;
}

async function downloadReport(
  path: string,
  params: ReportDownloadParams,
  fallbackFilename: string
): Promise<void> {
  const token = sessionStorage.getItem("gendo_auth_token");
  const response = await fetch(buildReportUrl(path, params), {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    const message = await parseErrorMessage(response, "Erro ao gerar relatório.");
    throw new Error(message);
  }

  const blob = await response.blob();
  const filename = extractFilename(response.headers.get("content-disposition"), fallbackFilename);

  const fileUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = fileUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(fileUrl);
}

export async function generatePatientReport(params: ReportDownloadParams): Promise<void> {
  const fallbackFilename = `relatorio_paciente_${params.patientId}_${params.startDate}_${params.endDate}.pdf`;
  return downloadReport(`/reports/patient/${encodeURIComponent(params.patientId)}/pdf`, params, fallbackFilename);
}

export async function exportData(params: ReportDownloadParams): Promise<void> {
  const fallbackFilename = `relatorio_paciente_${params.patientId}_${params.startDate}_${params.endDate}.xlsx`;
  return downloadReport(`/reports/patient/${encodeURIComponent(params.patientId)}/excel`, params, fallbackFilename);
}
