import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { resetPassword, getAuthErrorMessage } from "@/lib/authService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const resetSchema = z
  .object({
    newPassword: z
      .string()
      .min(1, "A nova senha é obrigatória.")
      .regex(
        passwordRegex,
        "A senha deve ter no mínimo 8 caracteres, incluindo letra maiúscula, minúscula e número."
      ),
    confirmPassword: z.string().min(1, "A confirmação da senha é obrigatória."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

type ResetFormValues = z.infer<typeof resetSchema>;

const RequiredMark = () => <span className="text-destructive ml-0.5">*</span>;

const ResetPassword = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState("");

  const form = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
    mode: "onBlur",
  });

  const onSubmit = async (data: ResetFormValues) => {
    setFormError("");
    setIsLoading(true);

    try {
      // In production, email would come from the reset token/link context
      const response = await resetPassword({
        email: "",
        newPassword: data.newPassword,
      });

      if (response.success === true) {
        toast.success("Senha redefinida com sucesso.");
        setTimeout(() => navigate("/login"), 1500);
      } else {
        setFormError(getAuthErrorMessage(response.error.code));
      }
    } catch {
      setFormError(getAuthErrorMessage("NETWORK_ERROR"));
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
                Redefinir Senha
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                Digite sua nova senha abaixo.
              </p>
            </div>

            {/* General error */}
            {formError && (
              <div className="mb-5 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {formError}
              </div>
            )}

            {/* Form */}
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="newPassword"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>
                        Nova senha
                        <RequiredMark />
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Digite a nova senha"
                          className={
                            fieldState.error
                              ? "border-destructive focus-visible:ring-destructive"
                              : ""
                          }
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>
                        Confirmar nova senha
                        <RequiredMark />
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Confirme a nova senha"
                          className={
                            fieldState.error
                              ? "border-destructive focus-visible:ring-destructive"
                              : ""
                          }
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full transition-all duration-200"
                  size="lg"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Redefinindo senha...
                    </>
                  ) : (
                    "Redefinir senha"
                  )}
                </Button>
              </form>
            </Form>

            {/* Back to login */}
            <p className="text-center text-sm text-muted-foreground mt-6">
              Lembrou sua senha?{" "}
              <button
                onClick={() => navigate("/login")}
                className="text-primary font-medium hover:underline"
              >
                Voltar ao login
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
