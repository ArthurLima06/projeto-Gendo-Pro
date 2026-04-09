import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, ChevronLeft, ChevronRight, Users, Loader2 } from "lucide-react";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
  getPatients,
  updatePatient as updatePatientApi,
  deletePatient as deletePatientApi,
  type Patient,
} from "@/services/patientsService";

const PatientList = () => {
  const [search, setSearch] = useState("");
  const [data, setData] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const navigate = useNavigate();

  // Edit state
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [editForm, setEditForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [isSaving, setIsSaving] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setLoadError("");
      const res = await getPatients();
      if (res.success === false) {
        setLoadError(res.error.message);
      } else {
        setData(res.data);
      }
      setIsLoading(false);
    };
    load();
  }, []);

  const filtered = data.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  // Open edit modal
  const handleEdit = (patient: Patient) => {
    setEditPatient(patient);
    setEditForm({
      name: patient.name,
      phone: patient.phone,
      email: patient.email,
      notes: patient.notes || "",
    });
  };

  // Save edit
  const handleSave = async () => {
    if (!editPatient) return;
    if (!editForm.name.trim() || !editForm.email.trim()) {
      toast({ title: "Erro", description: "Preencha todos os campos obrigatórios.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const res = await updatePatientApi(editPatient.id, editForm);
      if (res.success === false) {
        toast({ title: "Erro ao atualizar paciente", description: res.error.message, variant: "destructive" });
      } else {
        setData((prev) =>
          prev.map((p) =>
            p.id === editPatient.id
              ? { ...p, ...editForm, updatedAt: new Date().toISOString().slice(0, 10) }
              : p
          )
        );
        setEditPatient(null);
        toast({ title: "Paciente atualizado com sucesso" });
      }
    } catch {
      toast({ title: "Erro ao atualizar paciente", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // Confirm delete
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await deletePatientApi(deleteTarget.id);
      if (res.success === false) {
        toast({ title: "Erro ao excluir paciente", description: res.error.message, variant: "destructive" });
      } else {
        setData((prev) => prev.filter((p) => p.id !== deleteTarget.id));
        setDeleteTarget(null);
        toast({ title: "Paciente excluído com sucesso" });
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
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-64 h-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton columns={4} rows={6} headers={["Nome", "Telefone", "E-mail", "Ações"]} />
          ) : loadError ? (
            <EmptyState
              icon={Users}
              title="Erro ao carregar dados"
              description={loadError}
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhum paciente encontrado"
              description={search ? "Tente ajustar os termos da busca." : "Adicione seu primeiro paciente para começar."}
              actionLabel={!search ? "Adicionar paciente" : undefined}
              onAction={!search ? () => navigate("/patients/register") : undefined}
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="text-xs uppercase tracking-wider font-medium">Nome</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider font-medium">Telefone</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider font-medium">E-mail</TableHead>
                    <TableHead className="text-xs uppercase tracking-wider font-medium text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">{p.phone}</TableCell>
                      <TableCell className="text-muted-foreground">{p.email}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs border-warning/50 text-warning hover:bg-warning/10"
                            onClick={() => handleEdit(p)}
                          >
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs border-destructive/50 text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteTarget(p)}
                          >
                            Remover
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Exibindo {filtered.length} de {data.length} pacientes
                </p>
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

      {/* Edit Modal */}
      <Dialog open={!!editPatient} onOpenChange={(open) => !open && setEditPatient(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar paciente</DialogTitle>
            <DialogDescription>Atualize as informações do paciente abaixo.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Nome completo *</Label>
              <Input id="edit-name" value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-phone">Telefone</Label>
                <Input id="edit-phone" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-email">E-mail *</Label>
                <Input id="edit-email" type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-notes">Observações</Label>
              <Textarea id="edit-notes" value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPatient(null)} disabled={isSaving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? <><Loader2 className="animate-spin" /> Salvando...</> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <span className="font-medium text-foreground">{deleteTarget?.name}</span>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} disabled={isDeleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isDeleting ? <><Loader2 className="animate-spin" /> Excluindo...</> : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PatientList;
