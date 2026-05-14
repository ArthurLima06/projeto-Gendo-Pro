import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Loader2, Search, Users } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deletePatient as deletePatientApi,
  getPatients,
  updatePatient as updatePatientApi,
  type Patient,
} from "@/services/patientsService";
import { getAgreements, type Agreement } from "@/services/agreementsService";
import { formatCep, lookupCep, normalizeCep } from "@/services/cepService";

interface PatientEditForm {
  name: string;
  age: string;
  school: string;
  responsible: string;
  phone: string;
  email: string;
  cep: string;
  address: string;
  number: string;
  district: string;
  city: string;
  careType: "particular" | "convenio";
  agreementId: string;
  agreementPlan: string;
  notes: string;
}

const emptyEditForm: PatientEditForm = {
  name: "",
  age: "",
  school: "",
  responsible: "",
  phone: "",
  email: "",
  cep: "",
  address: "",
  number: "",
  district: "",
  city: "",
  careType: "particular",
  agreementId: "",
  agreementPlan: "",
  notes: "",
};

const PatientList = () => {
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [data, setData] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [loadError, setLoadError] = useState("");

  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [editForm, setEditForm] = useState<PatientEditForm>(emptyEditForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isLookingUpCep, setIsLookingUpCep] = useState(false);
  const [cepFeedback, setCepFeedback] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setLoadError("");
      const [patientsRes, agreementsRes] = await Promise.all([getPatients(), getAgreements({ activeOnly: true })]);
      if (patientsRes.success === false) {
        setLoadError(patientsRes.error.message);
      } else {
        setData(patientsRes.data);
      }
      if (agreementsRes.success) setAgreements(agreementsRes.data);
      setIsLoading(false);
    };
    void load();
  }, []);

  const activeAgreements = agreements.filter((item) => item.status === "ativo");
  const selectedAgreement = activeAgreements.find((item) => item.id === editForm.agreementId);
  const selectedAgreementPlans = selectedAgreement?.plans || [];

  useEffect(() => {
    const normalizedCep = normalizeCep(editForm.cep || "");
    if (!isAdmin || !editPatient || normalizedCep.length !== 8) {
      return;
    }

    const timerId = window.setTimeout(async () => {
      setIsLookingUpCep(true);
      setCepFeedback("");
      try {
        const result = await lookupCep(normalizedCep);
        if (!result) {
          setCepFeedback("CEP nao encontrado. Continue preenchendo manualmente.");
          return;
        }
        setEditForm((prev) => ({
          ...prev,
          cep: formatCep(result.cep),
          address: result.address,
          district: result.district,
          city: result.city,
        }));
        setCepFeedback("Endereco preenchido automaticamente.");
      } catch {
        setCepFeedback("Nao foi possivel consultar o CEP agora.");
      } finally {
        setIsLookingUpCep(false);
      }
    }, 500);

    return () => window.clearTimeout(timerId);
  }, [editForm.cep, editPatient, isAdmin]);

  const filtered = data.filter((patient) => {
    const q = search.toLowerCase();
    return (
      patient.name.toLowerCase().includes(q) ||
      (patient.phone || "").toLowerCase().includes(q) ||
      (patient.email || "").toLowerCase().includes(q)
    );
  });

  const handleEdit = (patient: Patient) => {
    if (!isAdmin) return;
    setEditPatient(patient);
    setEditForm({
      name: patient.name || "",
      age: patient.age || "",
      school: patient.school || "",
      responsible: patient.responsible || "",
      phone: patient.phone || "",
      email: patient.email || "",
      cep: patient.cep ? formatCep(patient.cep) : "",
      address: patient.address || "",
      number: patient.number || "",
      district: patient.district || "",
      city: patient.city || "",
      careType: patient.careType || "particular",
      agreementId: patient.agreementId || "",
      agreementPlan: patient.agreementPlan || "",
      notes: patient.notes || "",
    });
    setCepFeedback("");
  };

  const handleSave = async () => {
    if (!isAdmin || !editPatient) return;
    if (!editForm.name.trim() || !editForm.email.trim()) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatorios.",
        variant: "destructive",
      });
      return;
    }
    if (editForm.careType === "convenio") {
      if (activeAgreements.length === 0) {
        toast({
          title: "Nenhum convenio disponivel no momento.",
          variant: "destructive",
        });
        return;
      }
      if (!editForm.agreementId || !editForm.agreementPlan) {
        toast({
          title: "Campos obrigatorios",
          description: "Selecione convenio e plano para atendimento por convenio.",
          variant: "destructive",
        });
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload = {
        name: editForm.name.trim(),
        age: editForm.age.trim(),
        school: editForm.school.trim(),
        responsible: editForm.responsible.trim(),
        phone: editForm.phone.trim(),
        email: editForm.email.trim(),
        cep: editForm.cep ? normalizeCep(editForm.cep) : "",
        address: editForm.address.trim(),
        number: editForm.number.trim(),
        district: editForm.district.trim(),
        city: editForm.city.trim(),
        careType: editForm.careType,
        agreementId: editForm.careType === "convenio" ? editForm.agreementId : undefined,
        agreementPlan: editForm.careType === "convenio" ? editForm.agreementPlan : undefined,
        notes: editForm.notes.trim(),
      };
      const res = await updatePatientApi(editPatient.id, payload);
      if (res.success === false) {
        toast({
          title: "Erro ao atualizar paciente",
          description: res.error.message,
          variant: "destructive",
        });
      } else {
        setData((prev) => prev.map((item) => (item.id === editPatient.id ? res.data : item)));
        setEditPatient(null);
        setEditForm(emptyEditForm);
        setCepFeedback("");
        toast({ title: "Paciente atualizado com sucesso" });
      }
    } catch {
      toast({ title: "Erro ao atualizar paciente", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!isAdmin || !deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await deletePatientApi(deleteTarget.id);
      if (res.success === false) {
        toast({
          title: "Erro ao excluir paciente",
          description: res.error.message,
          variant: "destructive",
        });
      } else {
        setData((prev) => prev.filter((item) => item.id !== deleteTarget.id));
        setDeleteTarget(null);
        toast({ title: "Paciente excluido com sucesso" });
      }
    } catch {
      toast({ title: "Erro ao excluir paciente", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="shadow-card border-border">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base font-semibold">Pacientes</CardTitle>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar pacientes..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9 w-64 h-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton
              columns={isAdmin ? 13 : 4}
              rows={6}
              headers={
                isAdmin
                  ? ["Nome", "Atendimento", "Idade", "Profissao", "Responsavel", "Telefone", "E-mail", "CEP", "Endereco", "Numero", "Bairro", "Cidade", "Acoes"]
                  : ["Nome", "Telefone", "E-mail", "Atendimento"]
              }
            />
          ) : loadError ? (
            <EmptyState icon={Users} title="Erro ao carregar dados" description={loadError} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhum paciente encontrado"
              description={search ? "Tente ajustar os termos da busca." : "Adicione seu primeiro paciente para comecar."}
              actionLabel={!search && isAdmin ? "Adicionar paciente" : undefined}
              onAction={!search && isAdmin ? () => navigate("/patients/register") : undefined}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="text-xs uppercase tracking-wider font-medium">Nome</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider font-medium">Atendimento</TableHead>
                      {isAdmin && <TableHead className="text-xs uppercase tracking-wider font-medium">Idade</TableHead>}
                      {isAdmin && <TableHead className="text-xs uppercase tracking-wider font-medium">Profissao</TableHead>}
                      {isAdmin && <TableHead className="text-xs uppercase tracking-wider font-medium">Responsavel</TableHead>}
                      <TableHead className="text-xs uppercase tracking-wider font-medium">Telefone</TableHead>
                      <TableHead className="text-xs uppercase tracking-wider font-medium">E-mail</TableHead>
                      {isAdmin && <TableHead className="text-xs uppercase tracking-wider font-medium">CEP</TableHead>}
                      {isAdmin && <TableHead className="text-xs uppercase tracking-wider font-medium">Endereco</TableHead>}
                      {isAdmin && <TableHead className="text-xs uppercase tracking-wider font-medium">Numero</TableHead>}
                      {isAdmin && <TableHead className="text-xs uppercase tracking-wider font-medium">Bairro</TableHead>}
                      {isAdmin && <TableHead className="text-xs uppercase tracking-wider font-medium">Cidade</TableHead>}
                      {isAdmin && (
                        <TableHead className="text-xs uppercase tracking-wider font-medium text-right">Acoes</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((patient) => (
                      <TableRow key={patient.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-medium">{patient.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {patient.careType === "convenio"
                            ? `${patient.agreementName || "Convenio"}${patient.agreementPlan ? ` - ${patient.agreementPlan}` : ""}`
                            : "Particular"}
                        </TableCell>
                        {isAdmin && <TableCell className="text-muted-foreground">{patient.age || "-"}</TableCell>}
                        {isAdmin && <TableCell className="text-muted-foreground">{patient.school || "-"}</TableCell>}
                        {isAdmin && <TableCell className="text-muted-foreground">{patient.responsible || "-"}</TableCell>}
                        <TableCell className="text-muted-foreground tabular-nums">{patient.phone || "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{patient.email || "-"}</TableCell>
                        {isAdmin && <TableCell className="text-muted-foreground">{patient.cep ? formatCep(patient.cep) : "-"}</TableCell>}
                        {isAdmin && <TableCell className="text-muted-foreground">{patient.address || "-"}</TableCell>}
                        {isAdmin && <TableCell className="text-muted-foreground">{patient.number || "-"}</TableCell>}
                        {isAdmin && <TableCell className="text-muted-foreground">{patient.district || "-"}</TableCell>}
                        {isAdmin && <TableCell className="text-muted-foreground">{patient.city || "-"}</TableCell>}
                        {isAdmin && (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button size="sm" variant="outline" className="h-8 text-xs border-warning/50 text-warning hover:bg-warning/10" onClick={() => handleEdit(patient)}>
                                Editar
                              </Button>
                              <Button size="sm" variant="outline" className="h-8 text-xs border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(patient)}>
                                Remover
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <p className="text-sm text-muted-foreground">Exibindo {filtered.length} de {data.length} pacientes</p>
                <div className="flex items-center gap-1">
                  <button className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="px-3 py-1 text-sm font-medium bg-primary text-primary-foreground rounded-md">1</span>
                  <button className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editPatient} onOpenChange={(open) => !open && setEditPatient(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editar paciente</DialogTitle>
            <DialogDescription>Atualize as informacoes do paciente abaixo.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Nome completo *</Label>
              <Input value={editForm.name} onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Idade</Label>
              <Input type="number" min="0" value={editForm.age} onChange={(event) => setEditForm((prev) => ({ ...prev, age: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Profissao</Label>
              <Input value={editForm.school} onChange={(event) => setEditForm((prev) => ({ ...prev, school: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Responsavel</Label>
              <Input value={editForm.responsible} onChange={(event) => setEditForm((prev) => ({ ...prev, responsible: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={editForm.phone} onChange={(event) => setEditForm((prev) => ({ ...prev, phone: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail *</Label>
              <Input type="email" value={editForm.email} onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>CEP</Label>
              <Input value={editForm.cep} onChange={(event) => setEditForm((prev) => ({ ...prev, cep: formatCep(event.target.value) }))} />
              {isLookingUpCep && <p className="text-xs text-muted-foreground">Consultando CEP...</p>}
              {!isLookingUpCep && cepFeedback && <p className="text-xs text-muted-foreground">{cepFeedback}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Numero</Label>
              <Input value={editForm.number} onChange={(event) => setEditForm((prev) => ({ ...prev, number: event.target.value }))} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Endereco</Label>
              <Input value={editForm.address} onChange={(event) => setEditForm((prev) => ({ ...prev, address: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Bairro</Label>
              <Input value={editForm.district} onChange={(event) => setEditForm((prev) => ({ ...prev, district: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Cidade</Label>
              <Input value={editForm.city} onChange={(event) => setEditForm((prev) => ({ ...prev, city: event.target.value }))} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>Forma de atendimento</Label>
              <RadioGroup
                value={editForm.careType}
                onValueChange={(value) =>
                  setEditForm((prev) => ({
                    ...prev,
                    careType: value as "particular" | "convenio",
                    agreementId: value === "particular" ? "" : prev.agreementId,
                    agreementPlan: value === "particular" ? "" : prev.agreementPlan,
                  }))
                }
                className="flex items-center gap-6 pt-1"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="particular" id="edit-care-particular" />
                  <Label htmlFor="edit-care-particular">Particular</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="convenio" id="edit-care-convenio" disabled={activeAgreements.length === 0} />
                  <Label htmlFor="edit-care-convenio" className={activeAgreements.length === 0 ? "text-muted-foreground" : ""}>
                    Convenio
                  </Label>
                </div>
              </RadioGroup>
              {activeAgreements.length === 0 && <p className="text-xs text-muted-foreground">Nenhum convenio disponivel no momento.</p>}
            </div>
            {editForm.careType === "convenio" && (
              <>
                <div className="space-y-1.5">
                  <Label>Convenio</Label>
                  <Select value={editForm.agreementId} onValueChange={(value) => setEditForm((prev) => ({ ...prev, agreementId: value, agreementPlan: "" }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o convenio" />
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
                <div className="space-y-1.5">
                  <Label>Plano</Label>
                  <Select value={editForm.agreementPlan} onValueChange={(value) => setEditForm((prev) => ({ ...prev, agreementPlan: value }))} disabled={!selectedAgreement}>
                    <SelectTrigger>
                      <SelectValue placeholder={selectedAgreement ? "Selecione o plano" : "Selecione um convenio"} />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedAgreementPlans.map((plan) => (
                        <SelectItem key={plan} value={plan}>
                          {plan}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-1.5 md:col-span-2">
              <Label>Observacoes</Label>
              <Textarea rows={3} value={editForm.notes} onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPatient(null)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="animate-spin" /> Salvando...
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusao</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Esta acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? (
                <>
                  <Loader2 className="animate-spin" /> Excluindo...
                </>
              ) : (
                "Excluir"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PatientList;
