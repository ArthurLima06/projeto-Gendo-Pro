import { FileText, Paperclip } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDatePtBr } from "@/components/scheduling/calendar/calendarUtils";
import { formatCpf } from "@/services/patientsService";
import type { MedicalRecord } from "@/services/recordsService";

interface PatientRecordsDrawerProps {
  open: boolean;
  patientName: string;
  patientCpf?: string | null;
  isLoading: boolean;
  records: MedicalRecord[];
  onOpenChange: (open: boolean) => void;
}

const PatientRecordsDrawer = ({
  open,
  patientName,
  patientCpf,
  isLoading,
  records,
  onOpenChange,
}: PatientRecordsDrawerProps) => {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0">
        <div className="flex h-full flex-col">
          <SheetHeader className="border-b border-border px-6 py-5">
            <SheetTitle className="text-base">Prontuario rapido</SheetTitle>
            <SheetDescription>
              Historico clinico de {patientName || "paciente selecionado"}.
              {patientCpf ? ` CPF ${formatCpf(patientCpf)}.` : ""}
            </SheetDescription>
          </SheetHeader>

          <ScrollArea className="h-full px-6 py-5">
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="space-y-2 rounded-lg border border-border p-4">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                ))}
              </div>
            ) : records.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
                <FileText className="h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">Nenhum prontuario encontrado</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Este paciente ainda nao possui registros clinicos.
                </p>
              </div>
            ) : (
              <div className="space-y-4 pb-4">
                {records.map((record) => (
                  <article key={record.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-semibold">
                        {formatDatePtBr(record.date)}
                        {record.time ? ` as ${record.time}` : ""}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {record.professional || "Profissional nao informado"}
                      </Badge>
                    </div>

                    <Separator className="my-3" />

                    <div className="space-y-3 text-xs">
                      <div>
                        <p className="text-muted-foreground">Descricao / Evolucao</p>
                        <p className="mt-1 leading-relaxed">
                          {record.description || record.evolution || record.reason || "Nao informado"}
                        </p>
                      </div>

                      <div>
                        <p className="text-muted-foreground">Observacoes</p>
                        <p className="mt-1 leading-relaxed">{record.notes || "Nao informado"}</p>
                      </div>

                      <div>
                        <p className="text-muted-foreground">Anexos</p>
                        {record.attachments && record.attachments.length > 0 ? (
                          <ul className="mt-1 space-y-1">
                            {record.attachments.map((attachment, index) => (
                              <li key={`${record.id}-${index}`} className="flex items-center gap-1.5">
                                <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="truncate">{attachment}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-muted-foreground">Sem anexos</p>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default PatientRecordsDrawer;
