import { api, type ApiResponse } from "./api";

export interface Patient {
  id: string;
  name: string;
  cpf?: string | null;
  age?: string;
  school?: string;
  responsible?: string;
  phone: string;
  email: string;
  cep?: string;
  address?: string;
  number?: string;
  district?: string;
  city?: string;
  careType: "particular" | "convenio";
  agreementId?: string | null;
  agreementName?: string | null;
  agreementPlan?: string | null;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePatientPayload {
  name: string;
  cpf: string;
  age?: string;
  school?: string;
  responsible?: string;
  phone: string;
  email: string;
  cep?: string;
  address?: string;
  number?: string;
  district?: string;
  city?: string;
  careType: "particular" | "convenio";
  agreementId?: string;
  agreementPlan?: string;
  notes?: string;
}

export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, "").slice(0, 11);
}

export function formatCpf(value: string): string {
  const digits = normalizeCpf(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function isValidCpf(value: string): boolean {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculateDigit = (base: string) => {
    const total = base
      .split("")
      .reduce((sum, digit, index) => sum + Number(digit) * (base.length + 1 - index), 0);
    const remainder = (total * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(cpf.slice(0, 9)) === Number(cpf[9]) && calculateDigit(cpf.slice(0, 10)) === Number(cpf[10]);
}

export async function getPatients(): Promise<ApiResponse<Patient[]>> {
  return api.get<Patient[]>("/patients");
}

export async function getPatient(id: string): Promise<ApiResponse<Patient>> {
  return api.get<Patient>(`/patients/${id}`);
}

export async function createPatient(
  data: CreatePatientPayload
): Promise<ApiResponse<Patient>> {
  return api.post<Patient>("/patients", data);
}

export async function updatePatient(
  id: string,
  data: Partial<CreatePatientPayload>
): Promise<ApiResponse<Patient>> {
  return api.put<Patient>(`/patients/${id}`, data);
}

export async function deletePatient(
  id: string
): Promise<ApiResponse<{ deleted: boolean }>> {
  return api.delete<{ deleted: boolean }>(`/patients/${id}`);
}
