import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileText } from "lucide-react";
import { TableSkeleton } from "@/components/TableSkeleton";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/hooks/use-toast";
import { getRecords, createRecord, type MedicalRecord } from "@/services/recordsService";
import { getPatients, type Patient } from "@/services/patientsService";

const Records = () => {
  const [isAdding, setIsAdding] = useState(false);
  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  // Form state
  const [formPatient, setFormPatient] = useState("");
  const [formDate, setFormDate] = useState("");
  const [formTime, setFormTime] = useState("");
  const [formNotes, setFormNotes] = useState("");

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const [recRes, patRes] = await Promise.all([getRecords(), getPatients()]);
      if (recRes.success === false) setLoadError(recRes.error.message);
      else setRecords(recRes.data);
      if (patRes.success) setPatients(patRes.data);
      setIsLoading(false);
    };
    load();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formPatient || !formDate || !formTime) {
      toast({ title: "Erro", description: "Preencha os campos obrigatórios.", variant: "destructive" });
      return;
    }
    setIsAdding(true);
    try {
      const res = await createRecord({
        patient: formPatient,
        date: formDate,
        time: formTime,
        notes: formNotes,
      });
      if (res.success === false) {
        toast({ title: "Erro ao salvar prontuário", description: res.error.message, variant: "destructive" });
      } else {
        setRecords((prev) => [res.data, ...prev]);
        setFormPatient("");
        setFormDate("");
        setFormTime("");
        setFormNotes("");
        toast({ title: "Prontuário adicionado", description: "O registro foi salvo com sucesso." });
      }
    } catch {
      toast({ title: "Erro ao salvar informações", variant: "destructive" });
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-card border-border max-w-3xl">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Adicionar Novo Prontuário</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleAdd}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <Label>Horário</Label>
                <Input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Anotações</Label>
              <Textarea placeholder="Anotações da sessão..." rows={3} value={formNotes} onChange={(e) => setFormNotes(e.target.value)} />
            </div>
            <div className="flex justify-end">
              <Button disabled={isAdding}>
                {isAdding ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adicionando...
                  </>
                ) : (
                  "Adicionar Prontuário"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="shadow-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Histórico de Prontuários</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <TableSkeleton columns={5} rows={5} headers={["Paciente", "Data", "Horário", "Motivo", "Registrado Em"]} />
          ) : loadError ? (
            <EmptyState
              icon={FileText}
              title="Erro ao carregar dados"
              description={loadError}
            />
          ) : records.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Nenhum prontuário registrado"
              description="Adicione um prontuário usando o formulário acima."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Paciente</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Data</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Horário</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Motivo</TableHead>
                  <TableHead className="text-xs uppercase tracking-wider font-medium">Registrado Em</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium">{r.patient}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{r.date}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">{r.time}</TableCell>
                    <TableCell>{r.reason}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{r.registeredAt}</TableCell>
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

export default Records;
