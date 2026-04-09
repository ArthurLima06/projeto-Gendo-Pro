import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useLocation } from "react-router-dom";
import UserProfileDropdown from "@/components/UserProfileDropdown";
import NotificationsPanel from "@/components/NotificationsPanel";

const pageTitles: Record<string, string> = {
  "/": "Painel",
  "/patients/register": "Cadastro de Pacientes",
  "/scheduling": "Agendamento de Consultas",
  "/records": "Prontuários",
  "/patients": "Lista de Pacientes",
  "/reports": "Relatórios",
  "/financial": "Financeiro",
};

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const title = pageTitles[location.pathname] || "Painel";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-16 border-b border-border bg-card/80 backdrop-blur-md flex items-center px-4 md:px-8 justify-between shrink-0 sticky top-0 z-10">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />
              <h1 className="text-lg font-semibold text-foreground">{title}</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden md:flex relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar..."
                  className="pl-9 w-64 h-9 bg-muted/50 border-transparent focus:border-border focus:bg-card"
                />
              </div>
              <NotificationsPanel />
              <UserProfileDropdown />
            </div>
          </header>
          <main className="flex-1 overflow-y-auto p-4 md:p-8">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
