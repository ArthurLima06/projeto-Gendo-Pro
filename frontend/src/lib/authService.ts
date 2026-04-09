// Authentication service — prepared for future backend API integration
// Replace the `loginUser` implementation with a real API call when ready.

export type AuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "USER_NOT_FOUND"
  | "INVALID_PASSWORD"
  | "INVALID_TOKEN"
  | "NETWORK_ERROR"
  | "SERVER_ERROR"
  | "UNKNOWN_ERROR";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthSuccessResponse {
  success: true;
  user: AuthUser;
  token: string;
}

export interface AuthErrorResponse {
  success: false;
  error: {
    code: AuthErrorCode;
    message: string;
  };
}

export type AuthResponse = AuthSuccessResponse | AuthErrorResponse;

const ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  INVALID_CREDENTIALS: "Email ou senha inválidos",
  USER_NOT_FOUND: "Usuário não encontrado",
  INVALID_PASSWORD: "Senha incorreta",
  INVALID_TOKEN: "Link de redefinição inválido ou expirado.",
  NETWORK_ERROR: "Erro de conexão. Tente novamente.",
  SERVER_ERROR: "Erro interno do servidor",
  UNKNOWN_ERROR: "Ocorreu um erro inesperado. Tente novamente.",
};

export function getAuthErrorMessage(code: string): string {
  return ERROR_MESSAGES[code as AuthErrorCode] ?? ERROR_MESSAGES.UNKNOWN_ERROR;
}

/**
 * Authenticate user against the backend API.
 *
 * TODO: Replace this simulated implementation with a real fetch call:
 *
 *   const res = await fetch("/api/auth/login", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify({ email, password }),
 *   });
 *   return res.json() as Promise<AuthResponse>;
 */
export async function loginUser(
  email: string,
  _password: string
): Promise<AuthResponse> {
  // Simulated network delay
  await new Promise((r) => setTimeout(r, 1500));

  // Simulate success for now — replace with real API call
  return {
    success: true,
    user: { id: crypto.randomUUID(), name: email.split("@")[0], email },
    token: "simulated-jwt-token",
  };
}

export interface ResetPasswordRequest {
  email: string;
  newPassword: string;
}

export interface ResetPasswordSuccessResponse {
  success: true;
}

export interface ResetPasswordErrorResponse {
  success: false;
  error: {
    code: AuthErrorCode;
    message: string;
  };
}

export type ResetPasswordResponse =
  | ResetPasswordSuccessResponse
  | ResetPasswordErrorResponse;

/**
 * Reset user password via backend API.
 *
 * TODO: Replace with real fetch call:
 *
 *   const res = await fetch("/api/auth/reset-password", {
 *     method: "POST",
 *     headers: { "Content-Type": "application/json" },
 *     body: JSON.stringify({ email, newPassword }),
 *   });
 *   return res.json() as Promise<ResetPasswordResponse>;
 */
export async function resetPassword(
  data: ResetPasswordRequest
): Promise<ResetPasswordResponse> {
  // Simulated network delay
  await new Promise((r) => setTimeout(r, 1500));

  // Simulate success — replace with real API call
  return { success: true };
}
