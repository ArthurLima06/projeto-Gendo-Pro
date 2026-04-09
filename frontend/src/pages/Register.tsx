import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import gendoLogo from "@/assets/logo-gendo-pro.png";

const features = [
  "Cadastro de pacientes",
  "Agendamento inteligente",
  "Controle financeiro",
  "Relatórios em PDF",
  "Exportação de dados",
  "Suporte prioritário",
];

const Register = () => {
  const navigate = useNavigate();

  const handlePayment = () => {
    // Simulate external payment redirect, then return to login
    window.alert("Redirecionando para o sistema de pagamento...\n\nApós o pagamento, você será redirecionado para o login.");
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img
            src={gendoLogo}
            alt="Gendo Pro"
            className="h-16 w-16 object-contain"
          />
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-foreground">
            Comece a usar o Gendo Pro
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
            Gerencie seus pacientes, agendamentos e finanças em um único lugar.
          </p>
        </div>

        {/* Pricing Card */}
        <Card className="shadow-elevated border-border">
          <CardHeader className="text-center pb-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Plano Profissional
            </p>
            <div className="mt-3">
              <span className="text-4xl font-bold text-foreground">R$ 49,90</span>
              <span className="text-sm text-muted-foreground">/mês</span>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Acesso completo a todas as funcionalidades do sistema.
            </p>
          </CardHeader>

          <CardContent className="pt-4">
            {/* Features */}
            <ul className="space-y-3 mb-8">
              {features.map((feature) => (
                <li key={feature} className="flex items-center gap-3">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Check className="h-3 w-3 text-primary" />
                  </div>
                  <span className="text-sm text-foreground">{feature}</span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <Button
              onClick={handlePayment}
              className="w-full transition-all duration-200"
              size="lg"
            >
              Continuar para pagamento
            </Button>
          </CardContent>
        </Card>

        {/* Back to login */}
        <p className="text-center text-sm text-muted-foreground mt-6">
          Já tem uma conta?{" "}
          <button
            onClick={() => navigate("/login")}
            className="text-primary font-medium hover:underline"
          >
            Entrar
          </button>
        </p>
      </div>
    </div>
  );
};

export default Register;
