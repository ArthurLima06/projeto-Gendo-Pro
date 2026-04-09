import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { ShieldAlert, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import gendoLogo from "@/assets/logo-gendo-pro.png";

const PaymentBlocked = () => {
  const navigate = useNavigate();
  const { recheckPayment, paymentStatus } = useAuth();
  const [isChecking, setIsChecking] = useState(false);

  const handleRegularize = () => {
    // Simulate redirect to external payment platform
    window.open("https://example.com/payment", "_blank");
  };

  const handleRecheck = async () => {
    setIsChecking(true);
    await new Promise((r) => setTimeout(r, 1500));
    recheckPayment();
    setIsChecking(false);
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <Card className="shadow-elevated border-border">
          <CardContent className="pt-8 pb-8 px-8">
            <div className="flex justify-center mb-6">
              <img src={gendoLogo} alt="Gendo Pro" className="h-16 w-16 object-contain" />
            </div>

            <div className="flex justify-center mb-4">
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <ShieldAlert className="h-6 w-6 text-destructive" />
              </div>
            </div>

            <div className="text-center mb-8">
              <h1 className="text-2xl font-semibold text-foreground">Acesso restrito</h1>
              <p className="text-sm text-muted-foreground mt-3">
                Seu acesso está temporariamente indisponível devido a pendências no pagamento.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Regularize sua assinatura para continuar utilizando o sistema.
              </p>
              {paymentStatus === "overdue" && (
                <span className="inline-flex mt-3 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-destructive/10 text-destructive border-destructive/30">
                  Pagamento atrasado
                </span>
              )}
              {paymentStatus === "pending" && (
                <span className="inline-flex mt-3 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-warning/10 text-warning border-warning/30">
                  Pagamento pendente
                </span>
              )}
            </div>

            <div className="space-y-3">
              <Button onClick={handleRegularize} className="w-full" size="lg">
                Regularizar pagamento
              </Button>

              <Button
                variant="outline"
                onClick={handleRecheck}
                className="w-full"
                size="lg"
                disabled={isChecking}
              >
                {isChecking ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Verificando...
                  </>
                ) : (
                  "Já realizei o pagamento"
                )}
              </Button>
            </div>

            <p className="text-center text-sm text-muted-foreground mt-6">
              Precisa de ajuda?{" "}
              <a href="mailto:suporte@gendopro.com" className="text-primary font-medium hover:underline">
                Fale conosco
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PaymentBlocked;
