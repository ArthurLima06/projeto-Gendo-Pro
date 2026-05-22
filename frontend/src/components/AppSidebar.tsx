import {
  LayoutDashboard,
  UserPlus,
  CalendarDays,
  FileText,
  Users,
  BarChart3,
  DollarSign,
  LogOut,
} from "lucide-react";
import gendoLogo from "@/assets/gendo-logo.png";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";

const items = [
  { title: "Painel", url: "/dashboard", icon: LayoutDashboard },
  { title: "Cadastro de Pacientes", url: "/patients/register", icon: UserPlus },
  { title: "Agendamento", url: "/scheduling", icon: CalendarDays },
  { title: "Prontuários", url: "/records", icon: FileText },
  { title: "Lista de Pacientes", url: "/patients", icon: Users },
  { title: "Relatórios", url: "/reports", icon: BarChart3 },
  { title: "Financeiro", url: "/financial", icon: DollarSign },
];

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const normalizePath = (path: string) => (path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path);
  const isRouteActive = (path: string) => normalizePath(location.pathname) === normalizePath(path);

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, location.pathname, setOpenMobile]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <img src={gendoLogo} alt="GridTime" className="h-8 w-8 rounded-lg shrink-0 object-contain" />
          {!collapsed && (
            <span className="font-semibold text-foreground text-sm">GridTime</span>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive = isRouteActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={collapsed ? item.title : undefined}
                    >
                      <NavLink
                        to={item.url}
                        end
                        className={`relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ease-out transform-gpu ${
                          isActive
                            ? "bg-blue-500/15 text-blue-500 translate-x-1"
                            : "text-sidebar-foreground hover:bg-white/5 hover:translate-x-0.5"
                        }`}
                        activeClassName=""
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-[60%] w-[3px] -translate-y-1/2 rounded-r bg-blue-500" />
                        )}
                        <item.icon className={`h-4 w-4 shrink-0 ${isActive ? "text-blue-500" : "text-muted-foreground"}`} />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Logout */}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  tooltip={collapsed ? "Sair" : undefined}
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-muted transition-colors cursor-pointer"
                >
                  <LogOut className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {!collapsed && <span>Sair</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
