import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDatePtBr } from "@/components/scheduling/calendar/calendarUtils";
import type { Appointment } from "@/stores/appointmentStore";

interface EventPreviewCardProps {
  appointment: Appointment;
  position: { x: number; y: number };
  durationMinutes: number;
  onOpenRecord: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function clampToViewport(position: { x: number; y: number }) {
  const cardWidth = 320;
  const cardHeight = 240;
  const margin = 12;

  const maxX = window.innerWidth - cardWidth - margin;
  const maxY = window.innerHeight - cardHeight - margin;

  return {
    x: Math.max(margin, Math.min(position.x, maxX)),
    y: Math.max(margin, Math.min(position.y, maxY)),
  };
}

const EventPreviewCard = ({
  appointment,
  position,
  durationMinutes,
  onOpenRecord,
  onEdit,
  onDelete,
  onMouseEnter,
  onMouseLeave,
}: EventPreviewCardProps) => {
  const safePosition = clampToViewport(position);

  return (
    <div
      className="fixed z-[120] w-80 rounded-xl border border-border bg-background/95 p-4 shadow-2xl backdrop-blur-sm"
      style={{ left: safePosition.x, top: safePosition.y }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      role="dialog"
      aria-label="Preview do agendamento"
    >
      <div className="space-y-2">
        <h4 className="text-sm font-semibold leading-tight">{appointment.patient || "Paciente nao informado"}</h4>
        <p className="text-xs text-muted-foreground">
          {formatDatePtBr(appointment.date)} as {appointment.time} ({durationMinutes} min)
        </p>
      </div>

      <div className="mt-3 space-y-2 text-xs">
        <div className="grid grid-cols-[88px_1fr] gap-2">
          <span className="text-muted-foreground">Profissional</span>
          <span className="truncate">{appointment.professionalDisplay || appointment.professional || "Nao informado"}</span>
        </div>
        <div className="grid grid-cols-[88px_1fr] gap-2">
          <span className="text-muted-foreground">Motivo</span>
          <span className="truncate">{appointment.reason || "Nao informado"}</span>
        </div>
        <div className="grid grid-cols-[88px_1fr] gap-2">
          <span className="text-muted-foreground">Atendimento</span>
          <span>{appointment.careType === "convenio" ? "Convenio" : "Particular"}</span>
        </div>
        {appointment.careType === "convenio" && (
          <>
            <div className="grid grid-cols-[88px_1fr] gap-2">
              <span className="text-muted-foreground">Convenio</span>
              <span className="truncate">{appointment.agreementName || "Nao informado"}</span>
            </div>
            <div className="grid grid-cols-[88px_1fr] gap-2">
              <span className="text-muted-foreground">Plano</span>
              <span className="truncate">{appointment.agreementPlan || "Nao informado"}</span>
            </div>
          </>
        )}
        <div>
          <span className="text-muted-foreground">Observacoes</span>
          <p className="line-clamp-3 pt-1 leading-relaxed">{appointment.notes || "Nao informado"}</p>
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="secondary" className="gap-1.5" onClick={onOpenRecord}>
          Prontuario
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
          Editar
        </Button>
        <Button size="sm" variant="destructive" className="gap-1.5" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
          Excluir
        </Button>
      </div>
    </div>
  );
};

export default EventPreviewCard;
