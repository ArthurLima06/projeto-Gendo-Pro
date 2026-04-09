import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type PaymentStatus = "active" | "pending" | "overdue";

interface AuthContextType {
  isAuthenticated: boolean;
  userEmail: string;
  paymentStatus: PaymentStatus;
  login: (email?: string, token?: string) => void;
  logout: () => void;
  setPaymentStatus: (status: PaymentStatus) => void;
  recheckPayment: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  userEmail: "",
  paymentStatus: "active",
  login: () => {},
  logout: () => {},
  setPaymentStatus: () => {},
  recheckPayment: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(() =>
    sessionStorage.getItem("gendo_auth") === "true"
  );

  const [userEmail, setUserEmail] = useState(() =>
    sessionStorage.getItem("gendo_user_email") || ""
  );

  const [paymentStatus, setPaymentStatusState] = useState<PaymentStatus>(() =>
    (sessionStorage.getItem("gendo_payment_status") as PaymentStatus) || "active"
  );

  const login = useCallback((email?: string, token?: string) => {
    sessionStorage.setItem("gendo_auth", "true");
    if (email) {
      sessionStorage.setItem("gendo_user_email", email);
      setUserEmail(email);
    }
    if (token) {
      sessionStorage.setItem("gendo_auth_token", token);
    }
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem("gendo_auth");
    sessionStorage.removeItem("gendo_user_email");
    sessionStorage.removeItem("gendo_auth_token");
    setIsAuthenticated(false);
    setUserEmail("");
  }, []);

  const setPaymentStatus = useCallback((status: PaymentStatus) => {
    sessionStorage.setItem("gendo_payment_status", status);
    setPaymentStatusState(status);
  }, []);

  const recheckPayment = useCallback(() => {
    sessionStorage.setItem("gendo_payment_status", "active");
    setPaymentStatusState("active");
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, userEmail, paymentStatus, login, logout, setPaymentStatus, recheckPayment }}>
      {children}
    </AuthContext.Provider>
  );
};
