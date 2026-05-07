import { createContext, useContext, useState, useCallback, ReactNode, useMemo } from "react";
import { logoutUser, type AuthUser, type UserRole } from "@/lib/authService";

export type PaymentStatus = "active" | "pending" | "overdue";

interface AuthContextType {
  isAuthenticated: boolean;
  currentUser: AuthUser | null;
  userEmail: string;
  userRole: UserRole | null;
  paymentStatus: PaymentStatus;
  login: (user: AuthUser, token: string) => void;
  logout: () => void;
  setPaymentStatus: (status: PaymentStatus) => void;
  recheckPayment: () => void;
}

function readStoredUser(): AuthUser | null {
  const raw = sessionStorage.getItem("gendo_user");
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as AuthUser;
    if (!parsed?.id || !parsed?.email || !parsed?.name || !parsed?.role) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  currentUser: null,
  userEmail: "",
  userRole: null,
  paymentStatus: "active",
  login: () => {},
  logout: () => {},
  setPaymentStatus: () => {},
  recheckPayment: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => readStoredUser());

  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const hasAuthFlag = sessionStorage.getItem("gendo_auth") === "true";
    const hasToken = !!sessionStorage.getItem("gendo_auth_token");
    const hasUser = !!readStoredUser();
    return hasAuthFlag && hasToken && hasUser;
  });

  const [paymentStatus, setPaymentStatusState] = useState<PaymentStatus>(() =>
    (sessionStorage.getItem("gendo_payment_status") as PaymentStatus) || "active"
  );

  const login = useCallback((user: AuthUser, token: string) => {
    sessionStorage.setItem("gendo_auth", "true");
    sessionStorage.setItem("gendo_auth_token", token);
    sessionStorage.setItem("gendo_user", JSON.stringify(user));
    sessionStorage.setItem("gendo_user_email", user.email);
    setCurrentUser(user);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    void logoutUser();
    sessionStorage.removeItem("gendo_auth");
    sessionStorage.removeItem("gendo_user");
    sessionStorage.removeItem("gendo_user_email");
    sessionStorage.removeItem("gendo_auth_token");
    setIsAuthenticated(false);
    setCurrentUser(null);
  }, []);

  const setPaymentStatus = useCallback((status: PaymentStatus) => {
    sessionStorage.setItem("gendo_payment_status", status);
    setPaymentStatusState(status);
  }, []);

  const recheckPayment = useCallback(() => {
    sessionStorage.setItem("gendo_payment_status", "active");
    setPaymentStatusState("active");
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      isAuthenticated,
      currentUser,
      userEmail: currentUser?.email || "",
      userRole: currentUser?.role || null,
      paymentStatus,
      login,
      logout,
      setPaymentStatus,
      recheckPayment,
    }),
    [isAuthenticated, currentUser, paymentStatus, login, logout, setPaymentStatus, recheckPayment]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
