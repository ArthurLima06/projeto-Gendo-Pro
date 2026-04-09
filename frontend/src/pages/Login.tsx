import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { loginUser, getAuthErrorMessage } from "@/lib/authService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import gendoLogo from "@/assets/logo-gendo-pro.png";

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "E-mail obrigatório")
    .email("E-mail inválido"),
  password: z
    .string()
    .min(1, "Senha é obrigatória"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const Login = () => {
  const { login, paymentStatus } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
  });

  const onSubmit = async (data: LoginFormValues) => {
    setLoginError("");
    setIsLoading(true);

    try {
      const response = await loginUser(data.email, data.password);

      if (response.success === true) {
        login(data.email, response.token);
        if (paymentStatus !== "active") {
          navigate("/payment-blocked");
        } else {
          navigate("/dashboard");
        }
      } else {
        const errorCode = response.error.code;
        setLoginError(getAuthErrorMessage(errorCode));
      }
    } catch {
      setLoginError(getAuthErrorMessage("NETWORK_ERROR"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <Card className="shadow-elevated border-border">
          <CardContent className="pt-8 pb-8 px-8">
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <img
                src={gendoLogo}
                alt="Gendo Pro"
                className="h-16 w-16 object-contain"
              />
            </div>

            {/* Title */}
            <div className="text-center mb-8">
              <h1 className="text-2xl font-semibold text-foreground">
                Bem-vindo ao Gendo Pro
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                Gerencie seus atendimentos de forma simples e eficiente.
              </p>
            </div>

            {/* General login error */}
            {loginError && (
              <div className="mb-5 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {loginError}
              </div>
            )}

            {/* Form */}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="seu@email.com"
                          className={fieldState.error ? "border-destructive focus-visible:ring-destructive" : ""}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Senha</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          className={fieldState.error ? "border-destructive focus-visible:ring-destructive" : ""}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Remember me + Forgot password */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <Checkbox
                      checked={rememberMe}
                      onCheckedChange={(v) => setRememberMe(v === true)}
                    />
                    <span className="text-sm text-muted-foreground">Manter-me conectado</span>
                  </label>
                  <button
                    type="button"
                    className="text-sm text-primary font-medium hover:underline"
                    onClick={() => navigate("/reset-password")}
                  >
                    Esqueceu sua senha?
                  </button>
                </div>

                <Button
                  type="submit"
                  className="w-full transition-all duration-200"
                  size="lg"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Entrando...
                    </>
                  ) : (
                    "Entrar"
                  )}
                </Button>
              </form>
            </Form>

            {/* Registration CTA */}
            <p className="text-center text-sm text-muted-foreground mt-6">
              Não tem uma conta?{" "}
              <button
                onClick={() => navigate("/register")}
                className="text-primary font-medium hover:underline"
              >
                Cadastre-se
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
