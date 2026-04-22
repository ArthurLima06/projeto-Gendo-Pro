import { type ApiResponse } from "./api";

export interface GlobalSearchItem {
  id: string;
  name: string;
  type: string;
  path: string;
  extraInfo: string;
}

export interface GlobalSearchResponse {
  patients: GlobalSearchItem[];
  appointments: GlobalSearchItem[];
  records: GlobalSearchItem[];
  payments: GlobalSearchItem[];
  reports: GlobalSearchItem[];
  pages: GlobalSearchItem[];
}

const EMPTY_RESULT: GlobalSearchResponse = {
  patients: [],
  appointments: [],
  records: [],
  payments: [],
  reports: [],
  pages: [],
};

function normalizeSearchResponse(
  payload: Partial<GlobalSearchResponse> | null | undefined
): GlobalSearchResponse {
  if (!payload || typeof payload !== "object") {
    return EMPTY_RESULT;
  }

  return {
    patients: Array.isArray(payload.patients) ? payload.patients : [],
    appointments: Array.isArray(payload.appointments) ? payload.appointments : [],
    records: Array.isArray(payload.records) ? payload.records : [],
    payments: Array.isArray(payload.payments) ? payload.payments : [],
    reports: Array.isArray(payload.reports) ? payload.reports : [],
    pages: Array.isArray(payload.pages) ? payload.pages : [],
  };
}

export async function search(query: string): Promise<GlobalSearchResponse> {
  console.log("SEARCH FUNCTION CALLED:", query);

  const trimmed = query.trim();
  if (!trimmed) {
    return EMPTY_RESULT;
  }

  const endpoint = `/api/search?q=${encodeURIComponent(query)}`;
  console.log("REQUEST URL:", endpoint);
  console.log("About to fetch");

  const token = sessionStorage.getItem("gendo_auth_token");
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  console.log("Fetch response:", response);

  if (!response.ok) {
    throw new Error("Erro ao buscar resultados.");
  }

  const data = (await response.json()) as
    | ApiResponse<GlobalSearchResponse>
    | GlobalSearchResponse;

  if (data && typeof data === "object" && "success" in data) {
    if (data.success === false) {
      throw new Error(data.error.message || "Erro ao buscar resultados.");
    }
    return normalizeSearchResponse(data.data);
  }

  return normalizeSearchResponse(data);
}

export const globalSearch = search;
