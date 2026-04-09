import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Loader2, DollarSign } from "lucide-react";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/hooks/use-toast";
import { getFinancialRecords, createFinancialRecord, type FinancialRecord } from "@/services/financialService";
import { getPatients, type Patient } from "@/services/patientsService";

const Financial = () => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [payments, setPayments] = useState<FinancialRecord[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loadError, setLoadError] = useState("");

  // Form state
  const [formPatient, setFormPatient] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formStatus, setFormStatus] = useState("");

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const [finRes, patRes] = await Promise.all([getFinancialRecords(), getPatients()]);
      if (finRes.success === false) setLoadError(finRes.error.message);
      else setPayments(finRes.data);
      if (patRes.success) setPatients(patRes.data);
      setIsLoading(false);
    };
    load();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPatient || !formDate || !formAmount || !formStatus) {
      toast({ title: "Erro", description: "Preencha todos os campos.", variant: "destructive" });
      return;
    }
    setIsRegistering(true);
    try {
      const res = await createFinancialRecord({
        patient: formPatient,
        date: formDate,
        amount: formAmount,
        status: formStatus,
      });
      if (res.success === false) {
        toast({ title: "Erro ao registrar pagamento", description: res.error.message, variant: "destructive" });
      } else {
        setPayments((prev) => [res.data, ...prev]);
        setFormPatient("");
        setFormDate("");
        setFormAmount("");
        setFormStatus("");
        toast({ title: "Pagamento registrado", description: "O registro financeiro foi salvo com sucesso." });
      }
    } catch {
      toast({ title: "Erro ao salvar informações", variant: "destructive" });
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-card border-border max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Registrar Pagamento</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Paciente</Label>
                <Select value={formPatient} onValueChange={setFormPatient}>
                  <SelectTrigger><SelectValue placeholder="Selecionar paciente" /></SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Valor</Label>
                <Input type="number" placeholder="0,00" step="0.01" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Status do Pagamento</Label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue placeholder="Selecionar status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pendente">Pendente</SelectItem>
                    <SelectItem value="Pago">Pago</SelectItem>
                    <SelectItem value="Atrasado">Atrasado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button disabled={isRegistering}>
                {isRegistering ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  "Registrar Pagamento"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Histórico de Pagamentos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton columns={5} rows={5} headers={["Paciente", "Data", "Valor", "Status", "Registrado Em"]} />
          ) : loadError ? (
            <EmptyState
              icon={DollarSign}
              title="Erro ao carregar dados"
              description={loadError}
            />
          ) : payments.length === 0 ? (
            <EmptyState
              icon={DollarSign}
              title="Nenhum pagamento registrado"
              description="Registre um pagamento usando o formulário acima."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Paciente</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Data</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Valor</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Registrado Em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium">{p.patient}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{p.date}</TableCell>
                    <TableCell className="font-semibold tabular-nums">{p.amount}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell className="text-muted-foreground text-sm">{p.registeredAt}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Financial;
