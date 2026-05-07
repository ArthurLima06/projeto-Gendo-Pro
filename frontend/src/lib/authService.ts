export type UserRole = "admin" | "common";

export type AuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "USER_NOT_FOUND"
  | "INVALID_PASSWORD"
  | "INVALID_TOKEN"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NETWORK_ERROR"
  | "SERVER_ERROR"
  | "UNKNOWN_ERROR";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
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
  INVALID_CREDENTIALS: "Email ou senha invalidos",
  USER_NOT_FOUND: "Usuario nao encontrado",
  INVALID_PASSWORD: "Senha incorreta",
  INVALID_TOKEN: "Link de redefinicao invalido ou expirado.",
  UNAUTHORIZED: "Sessao expirada. Faca login novamente.",
  FORBIDDEN: "Voce nao tem permissao para esta acao.",
  NETWORK_ERROR: "Erro de conexao. Tente novamente.",
  SERVER_ERROR: "Erro interno do servidor",
  UNKNOWN_ERROR: "Ocorreu um erro inesperado. Tente novamente.",
};

export function getAuthErrorMessage(code: string): string {
  return ERROR_MESSAGES[code as AuthErrorCode] ?? ERROR_MESSAGES.UNKNOWN_ERROR;
}

interface ApiSuccess<T> {
  success: true;
  data: T;
}

interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
  };
}

type ApiResult<T> = ApiSuccess<T> | ApiError;

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const json = (await res.json()) as ApiResult<{ token: string; user: AuthUser }>;
    if (json.success) {
      return {
        success: true,
        token: json.data.token,
        user: json.data.user,
      };
    }

    return {
      success: false,
      error: {
        code: (json.error.code as AuthErrorCode) || "UNKNOWN_ERROR",
        message: json.error.message || getAuthErrorMessage(json.error.code),
      },
    };
  } catch {
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: getAuthErrorMessage("NETWORK_ERROR"),
      },
    };
  }
}

export async function logoutUser(): Promise<void> {
  const token = sessionStorage.getItem("gendo_auth_token");
  if (!token) {
    return;
  }

  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    // ignore logout failures on client side
  }
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const token = sessionStorage.getItem("gendo_auth_token");
  if (!token) {
    return null;
  }

  try {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    const json = (await res.json()) as ApiResult<{ user: AuthUser }>;
    if (!json.success) {
      return null;
    }
    return json.data.user;
  } catch {
    return null;
  }
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

export async function resetPassword(
  data: ResetPasswordRequest
): Promise<ResetPasswordResponse> {
  try {
    const token = sessionStorage.getItem("gendo_auth_token");
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
    });
    const json = (await res.json()) as ApiResult<{ success: boolean }>;

    if (json.success) {
      return { success: true };
    }

    return {
      success: false,
      error: {
        code: (json.error.code as AuthErrorCode) || "UNKNOWN_ERROR",
        message: json.error.message || getAuthErrorMessage(json.error.code),
      },
    };
  } catch {
    return {
      success: false,
      error: {
        code: "NETWORK_ERROR",
        message: getAuthErrorMessage("NETWORK_ERROR"),
      },
    };
  }
}
