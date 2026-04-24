import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import type { Patient } from "@/services/patientsService";
import type { Appointment } from "@/stores/appointmentStore";

export interface EditAppointmentPayload {
  patient: string;
  patient_id?: string;
  date: string;
  time: string;
  professional: string;
  professional_id?: string;
  reason: string;
  notes: string;
}

interface EditAppointmentModalProps {
  open: boolean;
  appointment: Appointment | null;
  patients: Patient[];
  professionals: string[];
  onCancel: () => void;
  onSave: (data: EditAppointmentPayload) => Promise<void>;
}

const EditAppointmentModal = ({
  open,
  appointment,
  patients,
  professionals,
  onCancel,
  onSave,
}: EditAppointmentModalProps) => {
  const [patient, setPatient] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [professional, setProfessional] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open || !appointment) {
      return;
    }

    setPatient(appointment.patient || "");
    setDate(appointment.date || "");
    setTime(appointment.time || "");
    setProfessional(appointment.professional || "");
    setReason(appointment.reason || "");
    setNotes(appointment.notes || "");
  }, [open, appointment]);

  const patientOptions = useMemo(() => {
    const names = new Set(patients.map((item) => item.name));
    if (appointment?.patient) {
      names.add(appointment.patient);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [patients, appointment]);

  const professionalOptions = useMemo(() => {
    const names = new Set(professionals);
    if (appointment?.professional) {
      names.add(appointment.professional);
    }
    return Array.from(names);
  }, [professionals, appointment]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!patient || !date || !time) {
      toast({
        title: "Preencha os campos obrigatórios",
        description: "Paciente, data e horário são obrigatórios.",
        variant: "destructive",
      });
      return;
    }

    const selectedPatient = patients.find((item) => item.name === patient);

    setIsSaving(true);
    try {
      await onSave({
        patient,
        patient_id: selectedPatient?.id,
        date,
        time,
        professional,
        professional_id: professional || undefined,
        reason,
        notes,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => (!isOpen ? onCancel() : null)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar Agendamento</DialogTitle>
          <DialogDescription>
            Atualize os dados do agendamento e clique em salvar para aplicar as alterações.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label>Paciente</Label>
            <Select value={patient} onValueChange={setPatient}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar paciente" />
              </SelectTrigger>
              <SelectContent>
                {patientOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Horário</Label>
              <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Profissional</Label>
            <Select value={professional} onValueChange={setProfessional}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar profissional" />
              </SelectTrigger>
              <SelectContent>
                {professionalOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Motivo</Label>
            <Input
              placeholder="Motivo da consulta"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea
              placeholder="Observações adicionais..."
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EditAppointmentModal;
