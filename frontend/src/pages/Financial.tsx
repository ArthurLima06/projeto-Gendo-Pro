import { useEffect, useState } from "react";
import { DollarSign, Download, FileText, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/hooks/use-toast";
import {
  createFinancialRecord,
  generateFinancialExcelReport,
  generateFinancialPdfReport,
  getFinancialRecords,
  updateFinancialRecord,
  type FinancialRecord,
} from "@/services/financialService";
import { getPatients, type Patient } from "@/services/patientsService";
import { getAgreements, type Agreement } from "@/services/agreementsService";
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
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loadError, setLoadError] = useState("");

  const [formPatient, setFormPatient] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formCareType, setFormCareType] = useState<"particular" | "convenio">("particular");
  const [formStatus, setFormStatus] = useState("");
  const [formAgreementId, setFormAgreementId] = useState("");
  const [formAgreementPlan, setFormAgreementPlan] = useState("");
  const [formMethod, setFormMethod] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const [reportPatientId, setReportPatientId] = useState("");
  const [reportStartDate, setReportStartDate] = useState("");
  const [reportEndDate, setReportEndDate] = useState("");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isExportingReport, setIsExportingReport] = useState(false);

  const [editingPayment, setEditingPayment] = useState<FinancialRecord | null>(null);
  const [editPatient, setEditPatient] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editCareType, setEditCareType] = useState<"particular" | "convenio">("particular");
  const [editStatus, setEditStatus] = useState("");
  const [editAgreementId, setEditAgreementId] = useState("");
  const [editAgreementPlan, setEditAgreementPlan] = useState("");
  const [editMethod, setEditMethod] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const [finRes, patRes, agreementsRes] = await Promise.all([
        getFinancialRecords(),
        getPatients(),
        getAgreements({ activeOnly: true }),
      ]);
      if (finRes.success === false) setLoadError(finRes.error.message);
      else setPayments(finRes.data);
      if (patRes.success) setPatients(patRes.data);
      if (agreementsRes.success) setAgreements(agreementsRes.data);
      setIsLoading(false);
    };
    void load();
  }, []);

  const activeAgreements = agreements.filter((item) => item.status === "ativo");
  const selectedCreateAgreement = activeAgreements.find((item) => item.id === formAgreementId);
  const selectedCreatePlans = selectedCreateAgreement?.plans || [];
  const selectedEditAgreement = activeAgreements.find((item) => item.id === editAgreementId);
  const selectedEditPlans = selectedEditAgreement?.plans || [];

  const resetCreateForm = () => {
    setFormPatient("");
    setFormDate("");
    setFormAmount("");
    setFormCareType("particular");
    setFormStatus("");
    setFormAgreementId("");
    setFormAgreementPlan("");
    setFormMethod("");
    setFormNotes("");
  };

  const hasValidReportRange = () => {
    if (!reportPatientId || !reportStartDate || !reportEndDate) {
      toast({
        title: "Filtros obrigatorios",
        description: "Selecione paciente, data inicial e data final para gerar o relatorio.",
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

    if (!formPatient || !formDate || !formAmount) {
      toast({ title: "Erro", description: "Preencha todos os campos obrigatorios.", variant: "destructive" });
      return;
    }
    if (formCareType === "particular" && !formStatus) {
      toast({ title: "Erro", description: "Selecione o status para atendimento particular.", variant: "destructive" });
      return;
    }
    if (formCareType === "convenio") {
      if (activeAgreements.length === 0) {
        toast({ title: "Nenhum convenio disponivel no momento.", variant: "destructive" });
        return;
      }
      if (!formAgreementId || !formAgreementPlan) {
        toast({ title: "Erro", description: "Selecione convenio e plano para atendimento por convenio.", variant: "destructive" });
        return;
      }
    }

    setIsRegistering(true);
    try {
      const res = await createFinancialRecord({
        patient: formPatient,
        date: formDate,
        amount: formAmount,
        careType: formCareType,
        status: formCareType === "particular" ? formStatus : undefined,
        agreementId: formCareType === "convenio" ? formAgreementId : undefined,
        agreementPlan: formCareType === "convenio" ? formAgreementPlan : undefined,
        method: formCareType === "particular" ? formMethod : undefined,
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

  const handleExportFinancialExcel = async () => {
    if (!isAdmin || !hasValidReportRange()) return;

    setIsExportingReport(true);
    try {
      await generateFinancialExcelReport({
        patientId: reportPatientId,
        startDate: reportStartDate,
        endDate: reportEndDate,
      });
      toast({
        title: "Relatorio financeiro exportado",
        description: "O arquivo Excel financeiro foi gerado com sucesso.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao gerar relatorio financeiro.";
      toast({ title: "Erro ao exportar Excel", description: message, variant: "destructive" });
    } finally {
      setIsExportingReport(false);
    }
  };

  const openEditDialog = (payment: FinancialRecord) => {
    if (!isAdmin) return;
    setEditingPayment(payment);
    setEditPatient(payment.patient);
    setEditDate(payment.date);
    setEditAmount(payment.amount.replace(",", ".").replace("R$", "").trim());
    setEditCareType(payment.careType || "particular");
    setEditStatus(payment.status);
    setEditAgreementId(payment.agreementId || "");
    setEditAgreementPlan(payment.agreementPlan || "");
    setEditMethod(payment.method || "");
    setEditNotes(payment.notes || "");
  };

  const handleSaveEdit = async () => {
    if (!editingPayment || !isAdmin) return;

    if (!editPatient || !editDate || !editAmount) {
      toast({
        title: "Campos obrigatorios",
        description: "Preencha paciente, data e valor.",
        variant: "destructive",
      });
      return;
    }
    if (editCareType === "particular" && !editStatus) {
      toast({
        title: "Campos obrigatorios",
        description: "Selecione o status para atendimento particular.",
        variant: "destructive",
      });
      return;
    }
    if (editCareType === "convenio" && (!editAgreementId || !editAgreementPlan)) {
      toast({
        title: "Campos obrigatorios",
        description: "Selecione convenio e plano para atendimento por convenio.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingEdit(true);
    const res = await updateFinancialRecord(editingPayment.id, {
      patient: editPatient,
      date: editDate,
      amount: editAmount,
      careType: editCareType,
      status: editCareType === "particular" ? editStatus : undefined,
      agreementId: editCareType === "convenio" ? editAgreementId : undefined,
      agreementPlan: editCareType === "convenio" ? editAgreementPlan : undefined,
      method: editCareType === "particular" ? editMethod : undefined,
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
                  <Label>Forma de atendimento</Label>
                  <Select
                    value={formCareType}
                    onValueChange={(value) => {
                      const next = value as "particular" | "convenio";
                      setFormCareType(next);
                      if (next === "particular") {
                        setFormAgreementId("");
                        setFormAgreementPlan("");
                      } else {
                        setFormStatus("");
                        setFormMethod("");
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="particular">Particular</SelectItem>
                      <SelectItem value="convenio" disabled={activeAgreements.length === 0}>Convenio</SelectItem>
                    </SelectContent>
                  </Select>
                  {activeAgreements.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum convenio disponivel no momento.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Status do Pagamento</Label>
                  {formCareType === "particular" ? (
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
                  ) : (
                    <div className="h-10 rounded-md border border-border px-3 text-sm flex items-center text-muted-foreground">
                      Status automatico: Convenio
                    </div>
                  )}
                </div>
                {formCareType === "convenio" ? (
                  <>
                    <div className="space-y-2">
                      <Label>Convenio</Label>
                      <Select value={formAgreementId} onValueChange={(value) => { setFormAgreementId(value); setFormAgreementPlan(""); }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecionar convenio" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeAgreements.map((agreement) => (
                            <SelectItem key={agreement.id} value={agreement.id}>
                              {agreement.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Plano</Label>
                      <Select value={formAgreementPlan} onValueChange={setFormAgreementPlan} disabled={!selectedCreateAgreement}>
                        <SelectTrigger>
                          <SelectValue placeholder={selectedCreateAgreement ? "Selecionar plano" : "Selecione um convenio"} />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedCreatePlans.map((plan) => (
                            <SelectItem key={plan} value={plan}>
                              {plan}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <Label>Metodo de pagamento</Label>
                    <Input value={formMethod} onChange={(event) => setFormMethod(event.target.value)} placeholder="Pix, cartao, dinheiro..." />
                  </div>
                )}
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
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={handleGenerateFinancialPdf} disabled={isGeneratingReport} className="w-full sm:w-auto">
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
              <Button
                variant="outline"
                onClick={handleExportFinancialExcel}
                disabled={isExportingReport}
                className="w-full sm:w-auto"
              >
                {isExportingReport ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Exportando...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Exportar para Excel
                  </>
                )}
              </Button>
            </div>
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
              columns={isAdmin ? 7 : 6}
              rows={5}
              headers={isAdmin ? ["Paciente", "Data", "Valor", "Status", "Atendimento", "Registrado Em", "Acoes"] : ["Paciente", "Data", "Valor", "Status", "Atendimento", "Registrado Em"]}
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
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Atendimento</TableHead>
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
                      {payment.careType === "convenio" ? (
                        <Badge className="bg-primary/10 text-primary border-primary/30">Convenio</Badge>
                      ) : (
                        <StatusBadge status={payment.status} />
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {payment.careType === "convenio"
                        ? `${payment.agreementName || "Convenio"}${payment.agreementPlan ? ` - ${payment.agreementPlan}` : ""}`
                        : "Particular"}
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
              <Label>Forma de atendimento</Label>
              <Select
                value={editCareType}
                onValueChange={(value) => {
                  const next = value as "particular" | "convenio";
                  setEditCareType(next);
                  if (next === "particular") {
                    setEditAgreementId("");
                    setEditAgreementPlan("");
                  } else {
                    setEditMethod("");
                    setEditStatus("");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="particular">Particular</SelectItem>
                  <SelectItem value="convenio" disabled={activeAgreements.length === 0}>Convenio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editCareType === "convenio" && (
              <>
                <div className="space-y-2">
                  <Label>Convenio</Label>
                  <Select value={editAgreementId} onValueChange={(value) => { setEditAgreementId(value); setEditAgreementPlan(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar convenio" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeAgreements.map((agreement) => (
                        <SelectItem key={agreement.id} value={agreement.id}>
                          {agreement.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Plano</Label>
                  <Select value={editAgreementPlan} onValueChange={setEditAgreementPlan} disabled={!selectedEditAgreement}>
                    <SelectTrigger>
                      <SelectValue placeholder={selectedEditAgreement ? "Selecionar plano" : "Selecione um convenio"} />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedEditPlans.map((plan) => (
                        <SelectItem key={plan} value={plan}>
                          {plan}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>Status</Label>
              {editCareType === "particular" ? (
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
              ) : (
                <div className="h-10 rounded-md border border-border px-3 text-sm flex items-center text-muted-foreground">
                  Status automatico: Convenio
                </div>
              )}
            </div>
            {editCareType === "particular" && (
              <div className="space-y-2">
                <Label>Metodo de pagamento</Label>
                <Input value={editMethod} onChange={(event) => setEditMethod(event.target.value)} />
              </div>
            )}
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
