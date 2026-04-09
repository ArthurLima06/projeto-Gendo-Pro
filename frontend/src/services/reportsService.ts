import { api, type ApiResponse } from "./api";

export interface ReportResult {
  url: string;
  filename: string;
}

export async function generatePatientReport(): Promise<ApiResponse<ReportResult>> {
  return api.post<ReportResult>("/reports/patient-pdf", {});
}

export async function exportData(): Promise<ApiResponse<ReportResult>> {
  return api.post<ReportResult>("/reports/export-excel", {});
}
