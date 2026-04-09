import { QueryClientProvider } from "@tanstack/react-query";
import { QueryClient } from "@tanstack/query-core";
import { BrowserRouter, Route, Routes, Outlet } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/DashboardLayout";
import ProtectedRoute from "@/components/ProtectedRoute";
import Login from "./pages/Login";
import Index from "./pages/Index";
import PatientRegistration from "./pages/PatientRegistration";
import Scheduling from "./pages/Scheduling";
import Records from "./pages/Records";
import PatientList from "./pages/PatientList";
import Reports from "./pages/Reports";
import Financial from "./pages/Financial";
import Register from "./pages/Register";
import PaymentBlocked from "./pages/PaymentBlocked";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const Layout = () => (
  <DashboardLayout>
    <Outlet />
  </DashboardLayout>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/payment-blocked" element={<PaymentBlocked />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/dashboard" element={<Index />} />
                <Route path="/patients/register" element={<PatientRegistration />} />
                <Route path="/scheduling" element={<Scheduling />} />
                <Route path="/records" element={<Records />} />
                <Route path="/patients" element={<PatientList />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/financial" element={<Financial />} />
              </Route>
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
