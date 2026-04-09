import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const ProtectedRoute = () => {
  const { isAuthenticated, paymentStatus } = useAuth();

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (paymentStatus !== "active") return <Navigate to="/payment-blocked" replace />;

  return <Outlet />;
};

export default ProtectedRoute;
