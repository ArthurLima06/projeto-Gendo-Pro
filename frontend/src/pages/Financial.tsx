import { useEffect, useMemo, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/EmptyState";
import { TableSkeleton } from "@/components/TableSkeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "@/hooks/use-toast";
import { getAgreements, type Agreement } from "@/services/agreementsService";
import {
  createPatientFinancialTransaction,
  generateFinancialExcelReport,
  generateFinancialPdfReport,
  getFinancialPatientDetail,
  getFinancialPatients,
  updateFinancialPatientSettings,
  type FinancialPatientDetail,
  type FinancialPatientListItem,
} from "@/services/financialService";
import { formatCpf } from "@/services/patientsService";

interface TransactionDraft {
  date: string;
  amount: string;
  careType: "particular" | "convenio";
  status: "Pago" | "Pendente" | "Atrasado";
  agreementId: string;
  agreementPlan: string;
  method: string;
  notes: string;
}

interface SettingsDraft {
  autoCharge: boolean;
  consultationPrice: string;
}

interface ReportFilterDraft {
  startDate: string;
  endDate: string;
}

const INITIAL_TRANSACTION_DRAFT: TransactionDraft = {
  date: "",
  amount: "",
  careType: "particular",
  status: "Pago",
  agreementId: "",
  agreementPlan: "",
  method: "",
  notes: "",
};

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatTransactionType(type?: string): string {
  const normalized = (type || "").toLowerCase();
  if (normalized === "charge") {
    return "Cobranca";
  }
  if (normalized === "adjustment") {
    return "Ajuste";
  }
  return "Pagamento";
}

function formatRegisteredAt(value?: string | null): string {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("pt-BR");
}

const Financial = () => {
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [patients, setPatients] = useState<FinancialPatientListItem[]>([]);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [openPatientId, setOpenPatientId] = useState("");
  const [detailByPatientId, setDetailByPatientId] = useState<Record<string, FinancialPatientDetail>>({});
  const [loadingPatientId, setLoadingPatientId] = useState<string | null>(null);
  const [transactionDrafts, setTransactionDrafts] = useState<Record<string, TransactionDraft>>({});
  const [settingsDrafts, setSettingsDrafts] = useState<Record<string, SettingsDraft>>({});
  const [reportDrafts, setReportDrafts] = useState<Record<string, ReportFilterDraft>>({});
  const [submittingPatientId, setSubmittingPatientId] = useState<string | null>(null);
  const [savingSettingsPatientId, setSavingSettingsPatientId] = useState<string | null>(null);
  const [exportingKey, setExportingKey] = useState<string>("");

  const activeAgreements = useMemo(
    () => agreements.filter((item) => item.status === "ativo"),
    [agreements]
  );

  const loadPatients = async () => {
    setIsLoading(true);
    setLoadError("");

    const [patientsResponse, agreementsResponse] = await Promise.all([
      getFinancialPatients(),
      getAgreements({ activeOnly: true }),
    ]);

    if (!patientsResponse.success) {
      setLoadError(patientsResponse.error.message);
      setPatients([]);
      setIsLoading(false);
      return;
    }

    setPatients(patientsResponse.data);
    if (agreementsResponse.success) {
      setAgreements(agreementsResponse.data);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    void loadPatients();
  }, []);

  const ensurePatientDetailLoaded = async (patientId: string) => {
    if (detailByPatientId[patientId]) {
      return;
    }

    setLoadingPatientId(patientId);
    const response = await getFinancialPatientDetail(patientId);
    setLoadingPatientId(null);

    if (!response.success) {
      toast({
        title: "Erro ao carregar financeiro do paciente",
        description: response.error.message,
        variant: "destructive",
      });
      return;
    }

    const detail = response.data;
    setDetailByPatientId((prev) => ({ ...prev, [patientId]: detail }));
    setSettingsDrafts((prev) => ({
      ...prev,
      [patientId]: {
        autoCharge: detail.settings.autoCharge,
        consultationPrice: String(detail.settings.consultationPrice ?? 0),
      },
    }));
    setTransactionDrafts((prev) => ({
      ...prev,
      [patientId]: {
        ...INITIAL_TRANSACTION_DRAFT,
        date: new Date().toISOString().slice(0, 10),
        careType: detail.patient.careType || "particular",
        agreementId: detail.patient.agreementId || "",
        agreementPlan: detail.patient.agreementPlan || "",
      },
    }));
    setReportDrafts((prev) => {
      if (prev[patientId]) {
        return prev;
      }
      const today = new Date().toISOString().slice(0, 10);
      return {
        ...prev,
        [patientId]: {
          startDate: today.slice(0, 8) + "01",
          endDate: today,
        },
      };
    });
  };

  const refreshPatientDetail = async (patientId: string) => {
    const response = await getFinancialPatientDetail(patientId);
    if (!response.success) {
      toast({
        title: "Erro ao atualizar dados financeiros",
        description: response.error.message,
        variant: "destructive",
      });
      return;
    }
    setDetailByPatientId((prev) => ({ ...prev, [patientId]: response.data }));
    await loadPatients();
  };

  const updateTransactionDraft = (patientId: string, partial: Partial<TransactionDraft>) => {
    setTransactionDrafts((prev) => ({
      ...prev,
      [patientId]: { ...(prev[patientId] || INITIAL_TRANSACTION_DRAFT), ...partial },
    }));
  };

  const updateSettingsDraft = (patientId: string, partial: Partial<SettingsDraft>) => {
    setSettingsDrafts((prev) => ({
      ...prev,
      [patientId]: {
        autoCharge: false,
        consultationPrice: "0",
        ...(prev[patientId] || {}),
        ...partial,
      },
    }));
  };

  const updateReportDraft = (patientId: string, partial: Partial<ReportFilterDraft>) => {
    setReportDrafts((prev) => ({
      ...prev,
      [patientId]: {
        startDate: "",
        endDate: "",
        ...(prev[patientId] || {}),
        ...partial,
      },
    }));
  };

  const validatePeriod = (patientId: string): ReportFilterDraft | null => {
    const draft = reportDrafts[patientId];
    if (!draft?.startDate || !draft?.endDate) {
      toast({
        title: "Periodo obrigatorio",
        description: "Selecione data inicial e final para exportar.",
        variant: "destructive",
      });
      return null;
    }
    if (draft.endDate < draft.startDate) {
      toast({
        title: "Periodo invalido",
        description: "Data final nao pode ser anterior a data inicial.",
        variant: "destructive",
      });
      return null;
    }
    return draft;
  };

  const handleRegisterTransaction = async (patientId: string) => {
    if (!isAdmin) {
      return;
    }

    const draft = transactionDrafts[patientId];
    if (!draft?.date || !draft?.amount) {
      toast({
        title: "Campos obrigatorios",
        description: "Preencha data e valor para registrar o lancamento.",
        variant: "destructive",
      });
      return;
    }
    if (draft.careType === "particular" && !draft.status) {
      toast({
        title: "Campos obrigatorios",
        description: "Selecione o status do pagamento para atendimento particular.",
        variant: "destructive",
      });
      return;
    }
    if (draft.careType === "convenio" && (!draft.agreementId || !draft.agreementPlan)) {
      toast({
        title: "Campos obrigatorios",
        description: "Selecione convenio e plano para atendimento por convenio.",
        variant: "destructive",
      });
      return;
    }

    const rawAmount = Number.parseFloat(draft.amount || "0");
    const absoluteAmount = Math.abs(rawAmount);
    const normalizedAmount =
      draft.careType === "particular"
        ? draft.status === "Pago"
          ? absoluteAmount
          : -absoluteAmount
        : rawAmount;
    const transactionType =
      draft.careType === "particular"
        ? draft.status === "Pago"
          ? "payment"
          : "charge"
        : normalizedAmount >= 0
          ? "payment"
          : "charge";

    setSubmittingPatientId(patientId);
    const response = await createPatientFinancialTransaction(patientId, {
      date: draft.date,
      amount: normalizedAmount.toFixed(2),
      careType: draft.careType,
      status: draft.careType === "particular" ? draft.status : undefined,
      agreementId: draft.careType === "convenio" ? draft.agreementId : undefined,
      agreementPlan: draft.careType === "convenio" ? draft.agreementPlan : undefined,
      method: draft.careType === "particular" ? draft.method : undefined,
      notes: draft.notes,
      type: transactionType,
    });
    setSubmittingPatientId(null);

    if (!response.success) {
      toast({
        title: "Erro ao registrar lancamento",
        description: response.error.message,
        variant: "destructive",
      });
      return;
    }

    updateTransactionDraft(patientId, {
      ...INITIAL_TRANSACTION_DRAFT,
      date: draft.date,
      careType: draft.careType,
      status: draft.status,
      agreementId: draft.careType === "convenio" ? draft.agreementId : "",
      agreementPlan: draft.careType === "convenio" ? draft.agreementPlan : "",
    });
    await refreshPatientDetail(patientId);
    toast({
      title: "Lancamento registrado",
      description: "O historico financeiro do paciente foi atualizado.",
    });
  };

  const handleSaveSettings = async (patientId: string) => {
    if (!isAdmin) {
      return;
    }
    const draft = settingsDrafts[patientId];
    if (!draft) {
      return;
    }

    const price = Number.parseFloat(draft.consultationPrice || "0");
    if (Number.isNaN(price) || price < 0) {
      toast({
        title: "Valor invalido",
        description: "Informe um valor automatico valido.",
        variant: "destructive",
      });
      return;
    }

    setSavingSettingsPatientId(patientId);
    const response = await updateFinancialPatientSettings(patientId, {
      autoCharge: draft.autoCharge,
      consultationPrice: price,
    });
    setSavingSettingsPatientId(null);

    if (!response.success) {
      toast({
        title: "Erro ao salvar cobranca automatica",
        description: response.error.message,
        variant: "destructive",
      });
      return;
    }

    await refreshPatientDetail(patientId);
    toast({
      title: "Configuracao salva",
      description: "A cobranca automatica do paciente foi atualizada.",
    });
  };

  const handleExportPdf = async (patientId: string) => {
    if (!isAdmin) {
      return;
    }
    const period = validatePeriod(patientId);
    if (!period) {
      return;
    }

    setExportingKey(`${patientId}-pdf`);
    try {
      await generateFinancialPdfReport({
        patientId,
        startDate: period.startDate,
        endDate: period.endDate,
      });
      toast({
        title: "PDF gerado",
        description: "Relatorio financeiro exportado com sucesso.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao gerar PDF financeiro.";
      toast({ title: "Erro ao gerar PDF", description: message, variant: "destructive" });
    } finally {
      setExportingKey("");
    }
  };

  const handleExportExcel = async (patientId: string) => {
    if (!isAdmin) {
      return;
    }
    const period = validatePeriod(patientId);
    if (!period) {
      return;
    }

    setExportingKey(`${patientId}-excel`);
    try {
      await generateFinancialExcelReport({
        patientId,
        startDate: period.startDate,
        endDate: period.endDate,
      });
      toast({
        title: "Excel exportado",
        description: "Relatorio financeiro exportado com sucesso.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao exportar Excel financeiro.";
      toast({ title: "Erro ao exportar Excel", description: message, variant: "destructive" });
    } finally {
      setExportingKey("");
    }
  };

  return (
    <div className="space-y-6">
      {!isAdmin && (
        <Card className="border-border shadow-card">
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              Voce esta em modo visualizacao. Apenas administradores podem registrar pagamentos, editar cobranca automatica e exportar.
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Central Financeira por Paciente</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6">
              <TableSkeleton columns={4} rows={6} headers={["Paciente", "Saldo", "Pendente", "Atrasado"]} />
            </div>
          ) : loadError ? (
            <EmptyState icon={FileText} title="Erro ao carregar financeiro" description={loadError} />
          ) : patients.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nenhum paciente cadastrado"
              description="Cadastre pacientes para iniciar o controle financeiro."
            />
          ) : (
            <Accordion
              type="single"
              collapsible
              value={openPatientId}
              onValueChange={(value) => {
                setOpenPatientId(value);
                if (value) {
                  void ensurePatientDetailLoaded(value);
                }
              }}
              className="w-full"
            >
              {patients.map((patient) => {
                const detail = detailByPatientId[patient.id];
                const transactionDraft = transactionDrafts[patient.id] || INITIAL_TRANSACTION_DRAFT;
                const settingsDraft = settingsDrafts[patient.id];
                const reportDraft = reportDrafts[patient.id];
                const selectedAgreement = activeAgreements.find(
                  (agreement) => agreement.id === transactionDraft.agreementId
                );
                const selectedPlans = selectedAgreement?.plans || [];
                const isDetailLoading = loadingPatientId === patient.id;

                return (
                  <AccordionItem key={patient.id} value={patient.id} className="border-border">
                    <AccordionTrigger className="px-4 sm:px-6 hover:no-underline">
                      <div className="grid w-full grid-cols-1 gap-2 text-left sm:grid-cols-4 sm:items-center">
                        <span className="font-medium">
                          {patient.name}
                          {patient.cpf && (
                            <span className="block text-xs font-normal text-muted-foreground tabular-nums">
                              CPF {formatCpf(patient.cpf)}
                            </span>
                          )}
                        </span>
                        <span
                          className={`text-sm font-semibold ${
                            patient.summary.balance < 0 ? "text-destructive" : "text-success"
                          }`}
                        >
                          Saldo: {formatCurrency(patient.summary.balance)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          Pendente: {formatCurrency(patient.summary.totalPending)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          Lancamentos: {patient.transactionsCount}
                        </span>
                      </div>
                    </AccordionTrigger>

                    <AccordionContent className="px-4 pb-6 sm:px-6">
                      {isDetailLoading || !detail ? (
                        <div className="space-y-3">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Carregando dados financeiros do paciente...</p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
                            <Card className="border-border">
                              <CardContent className="pt-4">
                                <p className="text-xs text-muted-foreground">Saldo atual</p>
                                <p
                                  className={`mt-1 text-base font-semibold ${
                                    detail.summary.balance < 0 ? "text-destructive" : "text-success"
                                  }`}
                                >
                                  {formatCurrency(detail.summary.balance)}
                                </p>
                              </CardContent>
                            </Card>
                            <Card className="border-border">
                              <CardContent className="pt-4">
                                <p className="text-xs text-muted-foreground">Total pago</p>
                                <p className="mt-1 text-base font-semibold">{formatCurrency(detail.summary.totalPaid)}</p>
                              </CardContent>
                            </Card>
                            <Card className="border-border">
                              <CardContent className="pt-4">
                                <p className="text-xs text-muted-foreground">Pendente</p>
                                <p className="mt-1 text-base font-semibold">{formatCurrency(detail.summary.totalPending)}</p>
                              </CardContent>
                            </Card>
                            <Card className="border-border">
                              <CardContent className="pt-4">
                                <p className="text-xs text-muted-foreground">Atrasado</p>
                                <p className="mt-1 text-base font-semibold">{formatCurrency(detail.summary.totalOverdue)}</p>
                              </CardContent>
                            </Card>
                            <Card className="border-border">
                              <CardContent className="pt-4">
                                <p className="text-xs text-muted-foreground">Total convenio</p>
                                <p className="mt-1 text-base font-semibold">{formatCurrency(detail.summary.totalConvenio)}</p>
                              </CardContent>
                            </Card>
                            <Card className="border-border">
                              <CardContent className="pt-4">
                                <p className="text-xs text-muted-foreground">Total particular</p>
                                <p className="mt-1 text-base font-semibold">{formatCurrency(detail.summary.totalParticular)}</p>
                              </CardContent>
                            </Card>
                          </div>

                          <Card className="border-border">
                            <CardHeader>
                              <CardTitle className="text-sm font-semibold">Cobranca automatica</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div className="flex items-center justify-between rounded-md border border-border p-3">
                                <div>
                                  <p className="text-sm font-medium">Ativar cobranca por agendamento</p>
                                  <p className="text-xs text-muted-foreground">
                                    Quando ativo, consultas particulares geram divida automatica.
                                  </p>
                                </div>
                                <Switch
                                  checked={settingsDraft?.autoCharge || false}
                                  disabled={!isAdmin}
                                  onCheckedChange={(checked) =>
                                    updateSettingsDraft(patient.id, { autoCharge: checked })
                                  }
                                />
                              </div>

                              <div className="space-y-2">
                                <Label>Valor automatico da consulta</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={settingsDraft?.consultationPrice || "0"}
                                  disabled={!isAdmin || !(settingsDraft?.autoCharge || false)}
                                  onChange={(event) =>
                                    updateSettingsDraft(patient.id, { consultationPrice: event.target.value })
                                  }
                                />
                              </div>

                              {isAdmin && (
                                <div className="flex justify-end">
                                  <Button
                                    onClick={() => void handleSaveSettings(patient.id)}
                                    disabled={savingSettingsPatientId === patient.id}
                                  >
                                    {savingSettingsPatientId === patient.id ? (
                                      <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Salvando...
                                      </>
                                    ) : (
                                      "Salvar cobranca automatica"
                                    )}
                                  </Button>
                                </div>
                              )}
                            </CardContent>
                          </Card>

                          {isAdmin && (
                            <Card className="border-border">
                              <CardHeader>
                                <CardTitle className="text-sm font-semibold">Registrar Pagamento</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-4">
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                  <div className="space-y-2">
                                    <Label>Valor</Label>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={transactionDraft.amount}
                                      onChange={(event) =>
                                        updateTransactionDraft(patient.id, { amount: event.target.value })
                                      }
                                      placeholder="Ex: 120.00"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Data</Label>
                                    <Input
                                      type="date"
                                      value={transactionDraft.date}
                                      onChange={(event) =>
                                        updateTransactionDraft(patient.id, { date: event.target.value })
                                      }
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Tipo de atendimento</Label>
                                    <Select
                                      value={transactionDraft.careType}
                                      onValueChange={(value) => {
                                        const next = value as "particular" | "convenio";
                                        updateTransactionDraft(patient.id, {
                                          careType: next,
                                          agreementId: next === "convenio" ? transactionDraft.agreementId : "",
                                          agreementPlan: next === "convenio" ? transactionDraft.agreementPlan : "",
                                        });
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="particular">Particular</SelectItem>
                                        <SelectItem value="convenio" disabled={activeAgreements.length === 0}>
                                          Convenio
                                        </SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>

                                {transactionDraft.careType === "convenio" ? (
                                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                    <div className="space-y-2">
                                      <Label>Convenio</Label>
                                      <Select
                                        value={transactionDraft.agreementId}
                                        onValueChange={(value) =>
                                          updateTransactionDraft(patient.id, {
                                            agreementId: value,
                                            agreementPlan: "",
                                          })
                                        }
                                      >
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
                                      <Select
                                        value={transactionDraft.agreementPlan}
                                        onValueChange={(value) =>
                                          updateTransactionDraft(patient.id, { agreementPlan: value })
                                        }
                                        disabled={!transactionDraft.agreementId}
                                      >
                                        <SelectTrigger>
                                          <SelectValue
                                            placeholder={
                                              transactionDraft.agreementId
                                                ? "Selecionar plano"
                                                : "Selecione um convenio"
                                            }
                                          />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {selectedPlans.map((plan) => (
                                            <SelectItem key={plan} value={plan}>
                                              {plan}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Status do pagamento</Label>
                                      <div className="h-10 rounded-md border border-border px-3 flex items-center">
                                        <Badge className="bg-primary/10 text-primary border-primary/30">Convenio</Badge>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                      <Label>Status do pagamento</Label>
                                      <Select
                                        value={transactionDraft.status}
                                        onValueChange={(value) =>
                                          updateTransactionDraft(patient.id, {
                                            status: value as "Pago" | "Pendente" | "Atrasado",
                                          })
                                        }
                                      >
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="Pago">Pago</SelectItem>
                                          <SelectItem value="Pendente">Pendente</SelectItem>
                                          <SelectItem value="Atrasado">Atrasado</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Metodo de pagamento</Label>
                                      <Input
                                        value={transactionDraft.method}
                                        onChange={(event) =>
                                          updateTransactionDraft(patient.id, { method: event.target.value })
                                        }
                                        placeholder="Pix, cartao, dinheiro..."
                                      />
                                    </div>
                                  </div>
                                )}

                                <div className="space-y-2">
                                  <Label>Observacao</Label>
                                  <Textarea
                                    value={transactionDraft.notes}
                                    onChange={(event) =>
                                      updateTransactionDraft(patient.id, { notes: event.target.value })
                                    }
                                    rows={3}
                                    placeholder="Detalhes do registro financeiro..."
                                  />
                                </div>

                                <div className="flex justify-end">
                                  <Button
                                    onClick={() => void handleRegisterTransaction(patient.id)}
                                    disabled={submittingPatientId === patient.id}
                                  >
                                    {submittingPatientId === patient.id ? (
                                      <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Salvando...
                                      </>
                                    ) : (
                                      "Registrar Pagamento"
                                    )}
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          )}

                          <Card className="border-border">
                            <CardHeader>
                              <CardTitle className="text-sm font-semibold">Historico Financeiro do Paciente</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4 p-0">
                              <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                                      <TableHead>Data</TableHead>
                                      <TableHead>Valor</TableHead>
                                      <TableHead>Tipo</TableHead>
                                      <TableHead>Atendimento</TableHead>
                                      <TableHead>Status</TableHead>
                                      <TableHead>Metodo de pagamento</TableHead>
                                      <TableHead>Convenio</TableHead>
                                      <TableHead>Plano</TableHead>
                                      <TableHead>Observacoes</TableHead>
                                      <TableHead>Data do registro</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {detail.transactions.length === 0 ? (
                                      <TableRow>
                                        <TableCell colSpan={10} className="text-center text-muted-foreground">
                                          Nenhum lancamento financeiro para este paciente.
                                        </TableCell>
                                      </TableRow>
                                    ) : (
                                      detail.transactions.map((transaction) => (
                                        <TableRow key={transaction.id} className="hover:bg-muted/30">
                                          <TableCell>{transaction.date}</TableCell>
                                          <TableCell
                                            className={
                                              Number.parseFloat(transaction.amount) < 0
                                                ? "font-semibold text-destructive"
                                                : "font-semibold"
                                            }
                                          >
                                            {formatCurrency(Number.parseFloat(transaction.amount || "0"))}
                                          </TableCell>
                                          <TableCell className="uppercase text-xs text-muted-foreground">
                                            {formatTransactionType(transaction.type)}
                                          </TableCell>
                                          <TableCell>
                                            {transaction.careType === "convenio" ? "Convenio" : "Particular"}
                                          </TableCell>
                                          <TableCell>
                                            {transaction.careType === "convenio" ? (
                                              <Badge className="bg-primary/10 text-primary border-primary/30">Convenio</Badge>
                                            ) : (
                                              <StatusBadge status={transaction.status} />
                                            )}
                                          </TableCell>
                                          <TableCell>{transaction.method || "-"}</TableCell>
                                          <TableCell>
                                            {transaction.careType === "convenio"
                                              ? transaction.agreementName || "Convenio"
                                              : "-"}
                                          </TableCell>
                                          <TableCell>
                                            {transaction.careType === "convenio"
                                              ? transaction.agreementPlan || "-"
                                              : "-"}
                                          </TableCell>
                                          <TableCell>{transaction.notes || "-"}</TableCell>
                                          <TableCell>{formatRegisteredAt(transaction.registeredAt)}</TableCell>
                                        </TableRow>
                                      ))
                                    )}
                                  </TableBody>
                                </Table>
                              </div>

                              {isAdmin && (
                                <div className="grid grid-cols-1 gap-4 border-t border-border px-4 pb-4 pt-4 md:grid-cols-2 lg:grid-cols-5">
                                  <div className="space-y-2">
                                    <Label>Data inicial</Label>
                                    <Input
                                      type="date"
                                      value={reportDraft?.startDate || ""}
                                      onChange={(event) =>
                                        updateReportDraft(patient.id, { startDate: event.target.value })
                                      }
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <Label>Data final</Label>
                                    <Input
                                      type="date"
                                      value={reportDraft?.endDate || ""}
                                      onChange={(event) =>
                                        updateReportDraft(patient.id, { endDate: event.target.value })
                                      }
                                    />
                                  </div>
                                  <div className="flex items-end">
                                    <Button
                                      className="w-full"
                                      onClick={() => void handleExportPdf(patient.id)}
                                      disabled={exportingKey === `${patient.id}-pdf`}
                                    >
                                      {exportingKey === `${patient.id}-pdf` ? (
                                        <>
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                          Gerando...
                                        </>
                                      ) : (
                                        <>
                                          <FileText className="mr-2 h-4 w-4" />
                                          PDF
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                  <div className="flex items-end">
                                    <Button
                                      variant="outline"
                                      className="w-full"
                                      onClick={() => void handleExportExcel(patient.id)}
                                      disabled={exportingKey === `${patient.id}-excel`}
                                    >
                                      {exportingKey === `${patient.id}-excel` ? (
                                        <>
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                          Exportando...
                                        </>
                                      ) : (
                                        <>
                                          <Download className="mr-2 h-4 w-4" />
                                          Excel
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Financial;
