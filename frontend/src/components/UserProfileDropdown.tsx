import { useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Settings, LogOut, Sun, Moon, Camera, Lock, User } from "lucide-react";

const UserProfileDropdown = () => {
  const navigate = useNavigate();
  const { logout, userEmail } = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = useMemo(() => {
    if (!userEmail) return "GP";
    const local = userEmail.split("@")[0];
    const letters = local.replace(/[^a-zA-Z]/g, "");
    return (letters.length >= 2 ? letters.slice(0, 2) : letters.padEnd(2, "X")).toUpperCase();
  }, [userEmail]);

  const displayEmail = userEmail || "empresa@email.com";

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("gendo_theme", next ? "dark" : "light");
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setProfileImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95 transition-transform">
            <Avatar className="h-8 w-8 cursor-pointer">
              {profileImage ? (
                <img src={profileImage} alt="Perfil" className="h-full w-full object-cover rounded-full" />
              ) : (
                <AvatarFallback className="bg-primary text-primary-foreground text-xs font-medium">
                  {initials}
                </AvatarFallback>
              )}
            </Avatar>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" sideOffset={8} className="w-64">
          <DropdownMenuLabel className="font-normal">
            <div className="flex items-center gap-3 py-1">
              <div className="relative group">
                <Avatar className="h-10 w-10">
                  {profileImage ? (
                    <img src={profileImage} alt="Perfil" className="h-full w-full object-cover rounded-full" />
                  ) : (
                    <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                      {initials}
                    </AvatarFallback>
                  )}
                </Avatar>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <Camera className="h-3.5 w-3.5 text-white" />
                </button>
              </div>
              <div className="flex flex-col">
                <p className="text-sm font-medium text-foreground">Gendo Pro</p>
                <p className="text-xs text-muted-foreground truncate max-w-[160px]">{displayEmail}</p>
              </div>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => setSettingsOpen(true)} className="cursor-pointer">
            <Settings className="mr-2 h-4 w-4" />
            Configurações
          </DropdownMenuItem>

          <DropdownMenuItem onClick={toggleTheme} className="cursor-pointer">
            {isDark ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            {isDark ? "Modo claro" : "Modo escuro"}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageUpload}
      />

      {/* Settings Modal — compact */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-5 pb-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4" />
              Configurações
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 px-6 pb-5">
            <div className="space-y-4">
              {/* Account Info */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                  Informações da conta
                </h4>
                <div className="grid gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Nome</Label>
                    <Input value="Gendo Pro" readOnly className="mt-1 h-8 text-sm bg-muted/50" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">E-mail</Label>
                    <Input value={displayEmail} readOnly className="mt-1 h-8 text-sm bg-muted/50" />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Change Password */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  Alterar senha
                </h4>
                <div className="grid gap-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Senha atual</Label>
                    <Input type="password" placeholder="••••••••" className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Nova senha</Label>
                    <Input type="password" placeholder="••••••••" className="mt-1 h-8 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Confirmar nova senha</Label>
                    <Input type="password" placeholder="••••••••" className="mt-1 h-8 text-sm" />
                  </div>
                </div>
                <Button size="sm" className="w-full h-8 text-sm">
                  Salvar alterações
                </Button>
              </div>

              <Separator />

              {/* Theme */}
              <div className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2">
                  {isDark ? <Moon className="h-3.5 w-3.5 text-muted-foreground" /> : <Sun className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className="text-sm font-medium">Modo escuro</span>
                </div>
                <Switch checked={isDark} onCheckedChange={toggleTheme} />
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UserProfileDropdown;
