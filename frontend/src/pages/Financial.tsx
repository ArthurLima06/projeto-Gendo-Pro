import { useEffect, useState } from "react";
import { DollarSign, FileText, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/hooks/use-toast";
import {
  createFinancialRecord,
  generateFinancialPdfReport,
  getFinancialRecords,
  updateFinancialRecord,
  type FinancialRecord,
} from "@/services/financialService";
import { getPatients, type Patient } from "@/services/patientsService";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const Financial = () => {
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";

  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [payments, setPayments] = useState<FinancialRecord[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loadError, setLoadError] = useState("");

  const [formPatient, setFormPatient] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formStatus, setFormStatus] = useState("");
  const [formMethod, setFormMethod] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const [reportPatientId, setReportPatientId] = useState("");
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  const [editingPayment, setEditingPayment] = useState<FinancialRecord | null>(null);
  const [editPatient, setEditPatient] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editMethod, setEditMethod] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const [finRes, patRes] = await Promise.all([getFinancialRecords(), getPatients()]);
      if (finRes.success === false) setLoadError(finRes.error.message);
      else setPayments(finRes.data);
      if (patRes.success) setPatients(patRes.data);
      setIsLoading(false);
    };
    void load();
  }, []);

  const resetCreateForm = () => {
    setFormPatient("");
    setFormDate("");
    setFormAmount("");
    setFormStatus("");
    setFormMethod("");
    setFormNotes("");
  };

  const hasValidReportRange = () => {
    if (!reportPatientId || !reportStartDate || !reportEndDate) {
      toast({
        title: "Filtros obrigatorios",
        description: "Selecione paciente, data inicial e data final para gerar o PDF.",
        variant: "destructive",
      });
      return false;
    }
    if (reportEndDate < reportStartDate) {
      toast({
        title: "Periodo invalido",
        description: "Data final nao pode ser anterior a data inicial.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAdmin) return;

    if (!formPatient || !formDate || !formAmount || !formStatus) {
      toast({ title: "Erro", description: "Preencha todos os campos obrigatorios.", variant: "destructive" });
      return;
    }

    setIsRegistering(true);
    try {
      const res = await createFinancialRecord({
        patient: formPatient,
        date: formDate,
        amount: formAmount,
        status: formStatus,
        method: formMethod,
        notes: formNotes,
      });
      if (res.success === false) {
        toast({ title: "Erro ao registrar pagamento", description: res.error.message, variant: "destructive" });
      } else {
        setPayments((prev) => [res.data, ...prev]);
        resetCreateForm();
        toast({ title: "Pagamento registrado", description: "O registro financeiro foi salvo com sucesso." });
      }
    } catch {
      toast({ title: "Erro ao salvar informacoes", variant: "destructive" });
    } finally {
      setIsRegistering(false);
    }
  };

  const handleGenerateFinancialPdf = async () => {
    if (!isAdmin || !hasValidReportRange()) return;

    setIsGeneratingReport(true);
    try {
      await generateFinancialPdfReport({
        patientId: reportPatientId,
        startDate: reportStartDate,
        endDate: reportEndDate,
      });
      toast({
        title: "Relatorio financeiro gerado",
        description: "O PDF financeiro foi gerado com sucesso.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao gerar relatorio financeiro.";
      toast({ title: "Erro ao gerar PDF", description: message, variant: "destructive" });
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const openEditDialog = (payment: FinancialRecord) => {
    if (!isAdmin) return;
    setEditingPayment(payment);
    setEditPatient(payment.patient);
    setEditDate(payment.date);
    setEditAmount(payment.amount.replace(",", ".").replace("R$", "").trim());
    setEditStatus(payment.status);
    setEditMethod(payment.method || "");
    setEditNotes(payment.notes || "");
  };

  const handleSaveEdit = async () => {
    if (!editingPayment || !isAdmin) return;

    if (!editPatient || !editDate || !editAmount || !editStatus) {
      toast({
        title: "Campos obrigatorios",
        description: "Preencha paciente, data, valor e status.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingEdit(true);
    const res = await updateFinancialRecord(editingPayment.id, {
      patient: editPatient,
      date: editDate,
      amount: editAmount,
      status: editStatus,
      method: editMethod,
      notes: editNotes,
    });
    setIsSavingEdit(false);

    if (!res.success) {
      toast({
        title: "Erro ao atualizar pagamento",
        description: res.error.message,
        variant: "destructive",
      });
      return;
    }

    setPayments((prev) => prev.map((item) => (item.id === editingPayment.id ? res.data : item)));
    setEditingPayment(null);
    toast({ title: "Pagamento atualizado", description: "As alteracoes financeiras foram aplicadas." });
  };

  return (
    <div className="space-y-6">
      {isAdmin ? (
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
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar paciente" />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map((patient) => (
                        <SelectItem key={patient.id} value={patient.name}>
                          {patient.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input type="date" value={formDate} onChange={(event) => setFormDate(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Valor</Label>
                  <Input type="number" placeholder="0,00" step="0.01" value={formAmount} onChange={(event) => setFormAmount(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Status do Pagamento</Label>
                  <Select value={formStatus} onValueChange={setFormStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pendente">Pendente</SelectItem>
                      <SelectItem value="Pago">Pago</SelectItem>
                      <SelectItem value="Atrasado">Atrasado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Metodo de pagamento</Label>
                  <Input value={formMethod} onChange={(event) => setFormMethod(event.target.value)} placeholder="Pix, cartao, dinheiro..." />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Observacoes</Label>
                  <Textarea value={formNotes} onChange={(event) => setFormNotes(event.target.value)} rows={3} placeholder="Detalhes do pagamento..." />
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
      ) : (
        <Card className="shadow-card border-border">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Voce esta em modo visualizacao. Apenas administradores podem registrar, editar ou exportar dados financeiros.
            </p>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <Card className="shadow-card border-border max-w-4xl">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Relatorio Financeiro</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Selecionar Paciente</Label>
              <Select value={reportPatientId} onValueChange={setReportPatientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um paciente" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.id}>
                      {patient.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data inicial</Label>
                <Input type="date" value={reportStartDate} onChange={(event) => setReportStartDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Data final</Label>
                <Input type="date" value={reportEndDate} onChange={(event) => setReportEndDate(event.target.value)} />
              </div>
            </div>
            <Button onClick={handleGenerateFinancialPdf} disabled={isGeneratingReport} className="w-full md:w-auto">
              {isGeneratingReport ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Gerar PDF Financeiro
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Historico de Pagamentos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton
              columns={isAdmin ? 6 : 5}
              rows={5}
              headers={isAdmin ? ["Paciente", "Data", "Valor", "Status", "Registrado Em", "Acoes"] : ["Paciente", "Data", "Valor", "Status", "Registrado Em"]}
            />
          ) : loadError ? (
            <EmptyState icon={DollarSign} title="Erro ao carregar dados" description={loadError} />
          ) : payments.length === 0 ? (
            <EmptyState icon={DollarSign} title="Nenhum pagamento registrado" description="Nao ha movimentacoes financeiras para exibir." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Paciente</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Data</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Valor</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Status</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Registrado Em</TableHead>
                  {isAdmin && <TableHead className="text-xs uppercase tracking-wider font-medium text-right">Acoes</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium">{payment.patient}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{payment.date}</TableCell>
                    <TableCell className="font-semibold tabular-nums">{payment.amount}</TableCell>
                    <TableCell>
                      <StatusBadge status={payment.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{payment.registeredAt}</TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(payment)}>
                          Editar
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingPayment} onOpenChange={(open) => !open && setEditingPayment(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar pagamento</DialogTitle>
            <DialogDescription>Ajuste os dados financeiros e o status do pagamento.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Paciente</Label>
              <Select value={editPatient} onValueChange={setEditPatient}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar paciente" />
                </SelectTrigger>
                <SelectContent>
                  {patients.map((patient) => (
                    <SelectItem key={patient.id} value={patient.name}>
                      {patient.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Data</Label>
                <Input type="date" value={editDate} onChange={(event) => setEditDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Valor</Label>
                <Input type="number" step="0.01" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pendente">Pendente</SelectItem>
                  <SelectItem value="Pago">Pago</SelectItem>
                  <SelectItem value="Atrasado">Atrasado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Metodo de pagamento</Label>
              <Input value={editMethod} onChange={(event) => setEditMethod(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Observacoes</Label>
              <Textarea value={editNotes} onChange={(event) => setEditNotes(event.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPayment(null)} disabled={isSavingEdit}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSavingEdit}>
              {isSavingEdit ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar alteracoes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Financial;
