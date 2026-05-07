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
import type { Professional } from "@/services/professionalsService";
import type { Appointment } from "@/stores/appointmentStore";

interface EventModalSubmitPayload {
  patient: string;
  patient_id?: string;
  date: string;
  time: string;
  professional: string;
  professional_id?: string;
  reason: string;
  notes: string;
  durationMinutes: number;
}

interface EventModalProps {
  open: boolean;
  mode: "create" | "edit";
  appointment: Appointment | null;
  patients: Patient[];
  professionals: Professional[];
  initialDate?: string;
  initialTime?: string;
  initialDurationMinutes?: number;
  onCancel: () => void;
  onSave: (payload: EventModalSubmitPayload) => Promise<void>;
}

function normalizeDuration(value: number | undefined): number {
  if (!value || Number.isNaN(value)) {
    return 60;
  }
  return Math.max(15, Math.min(1440, Math.round(value / 5) * 5));
}

const EventModal = ({
  open,
  mode,
  appointment,
  patients,
  professionals,
  initialDate,
  initialTime,
  initialDurationMinutes,
  onCancel,
  onSave,
}: EventModalProps) => {
  const [patient, setPatient] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [isSaving, setIsSaving] = useState(false);

  const professionalOptions = useMemo(() => {
    const map = new Map(professionals.map((item) => [item.id, item]));
    if (appointment?.professional && appointment.professionalId) {
      map.set(appointment.professionalId, {
        id: appointment.professionalId,
        name: appointment.professional,
        email: "",
        role: "common",
        createdAt: "",
        updatedAt: "",
      });
    }
    return Array.from(map.values());
  }, [professionals, appointment]);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (mode === "edit" && appointment) {
      setPatient(appointment.patient || "");
      setDate(appointment.date || "");
      setTime((appointment.time || "").slice(0, 5));
      const byId = professionalOptions.find((item) => item.id === appointment.professionalId);
      const byName = professionalOptions.find((item) => item.name === appointment.professional);
      setProfessionalId(byId?.id || byName?.id || "");
      setReason(appointment.reason || "");
      setNotes(appointment.notes || "");
      setDurationMinutes(normalizeDuration(initialDurationMinutes));
      return;
    }

    setPatient("");
    setDate(initialDate || "");
    setTime((initialTime || "").slice(0, 5));
    setProfessionalId("");
    setReason("");
    setNotes("");
    setDurationMinutes(normalizeDuration(initialDurationMinutes));
  }, [open, mode, appointment, initialDate, initialTime, initialDurationMinutes, professionalOptions]);

  const patientOptions = useMemo(() => {
    const names = new Set(patients.map((item) => item.name));
    if (appointment?.patient) {
      names.add(appointment.patient);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [patients, appointment]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!patient || !date || !time) {
      toast({
        title: "Preencha os campos obrigatorios",
        description: "Paciente, data e horario sao obrigatorios.",
        variant: "destructive",
      });
      return;
    }

    const selectedPatient = patients.find((item) => item.name === patient);
    const selectedProfessional = professionalOptions.find((item) => item.id === professionalId);

    setIsSaving(true);
    try {
      await onSave({
        patient,
        patient_id: selectedPatient?.id,
        date,
        time,
        professional: selectedProfessional?.name || "",
        professional_id: selectedProfessional?.id,
        reason,
        notes,
        durationMinutes: normalizeDuration(durationMinutes),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => (!isOpen ? onCancel() : null)}>
      <DialogContent className="w-[90%] max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Editar Agendamento" : "Agendar Consulta"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Atualize os dados do agendamento e clique em salvar para aplicar as alteracoes."
              : "Preencha os dados para finalizar o agendamento."}
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(value) => setDate(value.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Horario</Label>
              <Input type="time" value={time} onChange={(value) => setTime(value.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Duracao (min)</Label>
            <Input
              type="number"
              min={15}
              step={5}
              value={durationMinutes}
              onChange={(value) => setDurationMinutes(Number.parseInt(value.target.value || "60", 10))}
            />
          </div>

          <div className="space-y-2">
            <Label>Profissional</Label>
            <Select value={professionalId} onValueChange={setProfessionalId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar profissional" />
              </SelectTrigger>
              <SelectContent>
                {professionalOptions.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
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
              onChange={(value) => setReason(value.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Observacoes</Label>
            <Textarea
              placeholder="Observacoes adicionais..."
              rows={4}
              value={notes}
              onChange={(value) => setNotes(value.target.value)}
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
              ) : mode === "edit" ? (
                "Salvar alteracoes"
              ) : (
                "Agendar Consulta"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export type { EventModalSubmitPayload };
export default EventModal;
