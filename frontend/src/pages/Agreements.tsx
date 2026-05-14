import { useEffect, useMemo, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  createAgreement,
  deleteAgreement,
  getAgreements,
  updateAgreement,
  type Agreement,
  type AgreementStatus,
} from "@/services/agreementsService";

interface AgreementFormState {
  name: string;
  careType: string;
  plans: string[];
  newPlan: string;
  notes: string;
  status: AgreementStatus;
}

const defaultForm: AgreementFormState = {
  name: "",
  careType: "",
  plans: [],
  newPlan: "",
  notes: "",
  status: "ativo",
};

const Agreements = () => {
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";

  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<AgreementFormState>(defaultForm);
  const [editing, setEditing] = useState<Agreement | null>(null);
  const [editForm, setEditForm] = useState<AgreementFormState>(defaultForm);
  const [deleteTarget, setDeleteTarget] = useState<Agreement | null>(null);

  const sortedAgreements = useMemo(
    () => [...agreements].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [agreements]
  );

  const loadAgreements = async () => {
    setIsLoading(true);
    setError("");
    const res = await getAgreements();
    if (!res.success) {
      setError(res.error.message);
      setIsLoading(false);
      return;
    }
    setAgreements(res.data);
    setIsLoading(false);
  };

  useEffect(() => {
    void loadAgreements();
  }, []);

  const appendPlan = (target: "create" | "edit") => {
    const current = target === "create" ? form : editForm;
    const value = current.newPlan.trim();
    if (!value) return;
    if (current.plans.includes(value)) {
      toast({ title: "Plano duplicado", description: "Este plano ja foi adicionado.", variant: "destructive" });
      return;
    }
    if (target === "create") {
      setForm((prev) => ({ ...prev, plans: [...prev.plans, value], newPlan: "" }));
      return;
    }
    setEditForm((prev) => ({ ...prev, plans: [...prev.plans, value], newPlan: "" }));
  };

  const removePlan = (target: "create" | "edit", value: string) => {
    if (target === "create") {
      setForm((prev) => ({ ...prev, plans: prev.plans.filter((item) => item !== value) }));
      return;
    }
    setEditForm((prev) => ({ ...prev, plans: prev.plans.filter((item) => item !== value) }));
  };

  const ensureFormIsValid = (target: AgreementFormState): boolean => {
    if (!target.name.trim()) {
      toast({ title: "Campo obrigatorio", description: "Informe o nome do convenio.", variant: "destructive" });
      return false;
    }
    if (target.plans.length === 0) {
      toast({ title: "Planos obrigatorios", description: "Adicione ao menos um plano aceito.", variant: "destructive" });
      return false;
    }
    return true;
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin) return;
    if (!ensureFormIsValid(form)) return;

    setIsSubmitting(true);
    const res = await createAgreement({
      name: form.name.trim(),
      careType: form.careType.trim() || undefined,
      plans: form.plans,
      notes: form.notes.trim() || undefined,
      status: form.status,
    });
    setIsSubmitting(false);

    if (!res.success) {
      toast({ title: "Erro ao cadastrar convenio", description: res.error.message, variant: "destructive" });
      return;
    }

    setAgreements((prev) => [...prev, res.data]);
    setForm(defaultForm);
    toast({ title: "Convenio cadastrado", description: "O convenio foi salvo com sucesso." });
  };

  const openEditDialog = (agreement: Agreement) => {
    setEditing(agreement);
    setEditForm({
      name: agreement.name || "",
      careType: agreement.careType || "",
      plans: agreement.plans || [],
      newPlan: "",
      notes: agreement.notes || "",
      status: agreement.status,
    });
  };

  const handleSaveEdit = async () => {
    if (!editing || !isAdmin) return;
    if (!ensureFormIsValid(editForm)) return;

    setIsSubmitting(true);
    const res = await updateAgreement(editing.id, {
      name: editForm.name.trim(),
      careType: editForm.careType.trim() || undefined,
      plans: editForm.plans,
      notes: editForm.notes.trim() || undefined,
      status: editForm.status,
    });
    setIsSubmitting(false);

    if (!res.success) {
      toast({ title: "Erro ao atualizar convenio", description: res.error.message, variant: "destructive" });
      return;
    }

    setAgreements((prev) => prev.map((item) => (item.id === editing.id ? res.data : item)));
    setEditing(null);
    setEditForm(defaultForm);
    toast({ title: "Convenio atualizado", description: "As alteracoes foram salvas." });
  };

  const handleDeleteAgreement = async () => {
    if (!deleteTarget || !isAdmin) return;
    setIsDeleting(true);
    const res = await deleteAgreement(deleteTarget.id);
    setIsDeleting(false);
    if (!res.success) {
      toast({ title: "Erro ao excluir convenio", description: res.error.message, variant: "destructive" });
      return;
    }
    setAgreements((prev) => prev.filter((item) => item.id !== deleteTarget.id));
    setDeleteTarget(null);
    if (editing?.id === deleteTarget.id) {
      setEditing(null);
      setEditForm(defaultForm);
    }
    toast({ title: "Convenio removido", description: "O convenio foi excluido com sucesso." });
  };

  return (
    <div className="space-y-6">
      <Card className="border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Gerenciamento de Convenios</CardTitle>
        </CardHeader>
        <CardContent>
          {isAdmin ? (
            <form className="grid grid-cols-1 gap-4 lg:grid-cols-2" onSubmit={handleCreate}>
              <div className="space-y-2">
                <Label>Nome do convenio *</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Ex: Unimed"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de atendimento</Label>
                <Select value={form.careType} onValueChange={(value) => setForm((prev) => ({ ...prev, careType: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Fisioterapia">Fisioterapia</SelectItem>
                    <SelectItem value="Consulta">Consulta</SelectItem>
                    <SelectItem value="Exames">Exames</SelectItem>
                    <SelectItem value="Outros">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 lg:col-span-2">
                <Label>Planos aceitos *</Label>
                <div className="flex gap-2">
                  <Input
                    value={form.newPlan}
                    onChange={(event) => setForm((prev) => ({ ...prev, newPlan: event.target.value }))}
                    placeholder="Ex: Unimed Premium"
                  />
                  <Button type="button" variant="outline" onClick={() => appendPlan("create")}>
                    Adicionar
                  </Button>
                </div>
                {form.plans.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {form.plans.map((plan) => (
                      <Badge key={plan} className="gap-2 bg-primary/10 text-primary border-primary/30">
                        {plan}
                        <button type="button" onClick={() => removePlan("create", plan)} className="text-xs">
                          x
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as AgreementStatus }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 lg:col-span-2">
                <Label>Observacoes</Label>
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Informacoes adicionais sobre o convenio..."
                />
              </div>
              <div className="flex items-end lg:col-span-2">
                <Button className="w-full transition-all duration-200" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Cadastrar convenio"
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Voce possui perfil comum e pode apenas visualizar os convenios cadastrados.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Convenios cadastrados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando convenios...
            </div>
          ) : error ? (
            <EmptyState icon={Building2} title="Erro ao carregar convenios" description={error} />
          ) : sortedAgreements.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Nenhum convenio cadastrado"
              description="Cadastre convenios para habilitar atendimento por convenio."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Nome</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Tipo</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Planos</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Status</TableHead>
                  {isAdmin && <TableHead className="text-xs uppercase tracking-wider font-medium text-right">Acoes</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAgreements.map((agreement) => (
                  <TableRow key={agreement.id} className="transition-all duration-200 hover:bg-muted/30">
                    <TableCell className="font-medium">{agreement.name}</TableCell>
                    <TableCell className="text-muted-foreground">{agreement.careType || "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{agreement.plans.join(", ")}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          agreement.status === "ativo"
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                            : "bg-muted text-muted-foreground border-border"
                        }
                      >
                        {agreement.status === "ativo" ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(agreement)}>
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

      <Dialog open={!!editing} onOpenChange={(open) => (!open ? setEditing(null) : null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Editar convenio</DialogTitle>
            <DialogDescription>Atualize os dados e planos aceitos do convenio.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={editForm.name}
                onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de atendimento</Label>
              <Select value={editForm.careType} onValueChange={(value) => setEditForm((prev) => ({ ...prev, careType: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Fisioterapia">Fisioterapia</SelectItem>
                  <SelectItem value="Consulta">Consulta</SelectItem>
                  <SelectItem value="Exames">Exames</SelectItem>
                  <SelectItem value="Outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Planos aceitos *</Label>
              <div className="flex gap-2">
                <Input
                  value={editForm.newPlan}
                  onChange={(event) => setEditForm((prev) => ({ ...prev, newPlan: event.target.value }))}
                  placeholder="Adicionar novo plano"
                />
                <Button type="button" variant="outline" onClick={() => appendPlan("edit")}>
                  Adicionar
                </Button>
              </div>
              {editForm.plans.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {editForm.plans.map((plan) => (
                    <Badge key={plan} className="gap-2 bg-primary/10 text-primary border-primary/30">
                      {plan}
                      <button type="button" onClick={() => removePlan("edit", plan)} className="text-xs">
                        x
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(value) => setEditForm((prev) => ({ ...prev, status: value as AgreementStatus }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observacoes</Label>
              <Textarea
                rows={3}
                value={editForm.notes}
                onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="destructive" onClick={() => editing && setDeleteTarget(editing)} disabled={isSubmitting}>
              Excluir convenio
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSubmitting}>
              {isSubmitting ? (
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusao</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este convenio?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAgreement}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Excluindo...
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

export default Agreements;
