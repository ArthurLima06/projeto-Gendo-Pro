import { cn } from "@/lib/utils";

type Status = "Pago" | "Pendente" | "Atrasado";

const styles: Record<Status, string> = {
  Pago: "bg-success/10 text-success border-success/30",
  Pendente: "bg-warning/10 text-warning border-warning/30",
  Atrasado: "bg-destructive/10 text-destructive border-destructive/30 animate-pulse",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={cn(
        "inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium border",
        styles[status]
      )}
    >
      {status}
    </span>
  );
}
