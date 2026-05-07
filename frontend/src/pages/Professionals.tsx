import { useEffect, useMemo, useState } from "react";
import { Loader2, ShieldCheck, Users } from "lucide-react";
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
  createProfessional,
  deleteProfessional,
  getProfessionals,
  updateProfessional,
  type Professional,
  type ProfessionalRole,
} from "@/services/professionalsService";

interface ProfessionalFormState {
  name: string;
  email: string;
  password: string;
  phone: string;
  role: ProfessionalRole;
}

interface EditFormState {
  name: string;
  email: string;
  phone: string;
  role: ProfessionalRole;
  password: string;
}

const defaultCreateForm: ProfessionalFormState = {
  name: "",
  email: "",
  password: "",
  phone: "",
  role: "common",
};

const defaultEditForm: EditFormState = {
  name: "",
  email: "",
  phone: "",
  role: "common",
  password: "",
};

const Professionals = () => {
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";

  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<ProfessionalFormState>(defaultCreateForm);

  const [editing, setEditing] = useState<Professional | null>(null);
  const [editForm, setEditForm] = useState<EditFormState>(defaultEditForm);
  const [deleteTarget, setDeleteTarget] = useState<Professional | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const sortedProfessionals = useMemo(
    () => [...professionals].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [professionals]
  );

  const loadProfessionals = async () => {
    setIsLoading(true);
    setError("");
    const res = await getProfessionals();
    if (!res.success) {
      setError(res.error.message);
      setIsLoading(false);
      return;
    }
    setProfessionals(res.data);
    setIsLoading(false);
  };

  useEffect(() => {
    void loadProfessionals();
  }, []);

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin) {
      return;
    }

    if (!form.name.trim() || !form.email.trim() || !form.password.trim() || !form.role) {
      toast({
        title: "Campos obrigatorios",
        description: "Nome, email, senha e tipo de acesso sao obrigatorios.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    const response = await createProfessional({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      phone: form.phone.trim(),
      role: form.role,
    });
    setIsSubmitting(false);

    if (!response.success) {
      toast({
        title: "Erro ao cadastrar profissional",
        description: response.error.message,
        variant: "destructive",
      });
      return;
    }

    setProfessionals((prev) => [...prev, response.data]);
    setForm(defaultCreateForm);
    toast({
      title: "Profissional cadastrado",
      description: "O novo usuario ja pode fazer login no sistema.",
    });
  };

  const openEditDialog = (professional: Professional) => {
    setEditing(professional);
    setEditForm({
      name: professional.name,
      email: professional.email,
      phone: professional.phone || "",
      role: professional.role,
      password: "",
    });
  };

  const handleSaveEdit = async () => {
    if (!editing || !isAdmin) {
      return;
    }

    if (!editForm.name.trim() || !editForm.email.trim() || !editForm.role) {
      toast({
        title: "Campos obrigatorios",
        description: "Nome, email e tipo de acesso sao obrigatorios.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    const response = await updateProfessional(editing.id, {
      name: editForm.name.trim(),
      email: editForm.email.trim(),
      phone: editForm.phone.trim(),
      role: editForm.role,
      ...(editForm.password.trim() ? { password: editForm.password } : {}),
    });
    setIsSubmitting(false);

    if (!response.success) {
      toast({
        title: "Erro ao atualizar profissional",
        description: response.error.message,
        variant: "destructive",
      });
      return;
    }

    setProfessionals((prev) => prev.map((item) => (item.id === editing.id ? response.data : item)));
    setEditing(null);
    setEditForm(defaultEditForm);
    toast({
      title: "Profissional atualizado",
      description: "As informacoes foram salvas com sucesso.",
    });
  };

  const handleDeleteProfessional = async () => {
    if (!deleteTarget || !isAdmin) {
      return;
    }

    setIsDeleting(true);
    const response = await deleteProfessional(deleteTarget.id);
    setIsDeleting(false);

    if (!response.success) {
      toast({
        title: "Erro ao excluir profissional",
        description: response.error.message,
        variant: "destructive",
      });
      return;
    }

    setProfessionals((prev) => prev.filter((item) => item.id !== deleteTarget.id));
    setDeleteTarget(null);
    if (editing?.id === deleteTarget.id) {
      setEditing(null);
      setEditForm(defaultEditForm);
    }
    toast({
      title: "Profissional excluido",
      description: "O acesso do usuario foi removido com sucesso.",
    });
  };

  return (
    <div className="space-y-6">
      <Card className="border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Gerenciamento de Profissionais</CardTitle>
        </CardHeader>
        <CardContent>
          {isAdmin ? (
            <form className="grid grid-cols-1 gap-4 lg:grid-cols-2" onSubmit={handleCreate}>
              <div className="space-y-2">
                <Label>Nome completo *</Label>
                <Input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Nome do profissional"
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail *</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="profissional@clinica.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Senha *</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  placeholder="Minimo 8 caracteres"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de acesso *</Label>
                <Select
                  value={form.role}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, role: value as ProfessionalRole }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o perfil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="common">Comum</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button className="w-full transition-all duration-200" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Cadastrar profissional"
                  )}
                </Button>
              </div>
            </form>
          ) : (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Voce possui perfil comum e pode apenas visualizar os profissionais cadastrados.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border shadow-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Profissionais cadastrados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando profissionais...
            </div>
          ) : error ? (
            <EmptyState icon={Users} title="Erro ao carregar profissionais" description={error} />
          ) : sortedProfessionals.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="Nenhum profissional cadastrado"
              description="Cadastre o primeiro profissional para habilitar acesso ao sistema."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Nome</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium">E-mail</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Telefone</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Role</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Status</TableHead>
                  {isAdmin && (
                    <TableHead className="text-xs uppercase tracking-wider font-medium text-right">Acoes</TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedProfessionals.map((professional) => (
                  <TableRow key={professional.id} className="transition-all duration-200 hover:bg-muted/30">
                    <TableCell className="font-medium">{professional.name}</TableCell>
                    <TableCell className="text-muted-foreground">{professional.email}</TableCell>
                    <TableCell className="text-muted-foreground">{professional.phone || "-"}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          professional.role === "admin"
                            ? "bg-blue-500/15 text-blue-500 border-blue-500/30"
                            : "bg-muted text-muted-foreground border-border"
                        }
                      >
                        {professional.role === "admin" ? "Admin" : "Comum"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          (professional.futureStatus || "active") === "active"
                            ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                            : "bg-muted text-muted-foreground border-border"
                        }
                      >
                        {(professional.futureStatus || "active").toLowerCase() === "active" ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(professional)}>
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar profissional</DialogTitle>
            <DialogDescription>
              Atualize os dados do profissional e ajuste as permissoes quando necessario.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome completo *</Label>
              <Input
                value={editForm.name}
                onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>E-mail *</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(event) => setEditForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input
                value={editForm.phone}
                onChange={(event) => setEditForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de acesso *</Label>
              <Select
                value={editForm.role}
                onValueChange={(value) => setEditForm((prev) => ({ ...prev, role: value as ProfessionalRole }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="common">Comum</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nova senha (opcional)</Label>
              <Input
                type="password"
                value={editForm.password}
                onChange={(event) => setEditForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Deixe em branco para manter a senha atual"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => editing && setDeleteTarget(editing)}
              disabled={isSubmitting}
              className="mr-auto"
            >
              Excluir Profissional
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
              Tem certeza que deseja excluir este profissional?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProfessional}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Excluindo...
                </>
              ) : (
                "Excluir Profissional"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Professionals;
