import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { generatePatientReport, exportData } from "@/services/reportsService";
import { getPatients, type Patient } from "@/services/patientsService";

const REQUIRED_FILTERS_ALERT = "Selecione um paciente e o período antes de gerar o relatório.";

const Reports = () => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    const loadPatients = async () => {
      const response = await getPatients();
      if (response.success === false) {
        toast({
          title: "Erro ao carregar pacientes",
          description: response.error.message,
          variant: "destructive",
        });
        return;
      }
      setPatients(response.data);
    };

    loadPatients();
  }, []);

  const hasRequiredFilters = () => {
    if (!selectedPatientId || !startDate || !endDate) {
      window.alert(REQUIRED_FILTERS_ALERT);
      return false;
    }
    return true;
  };

  const hasValidDateRange = () => {
    if (endDate < startDate) {
      toast({
        title: "Período inválido",
        description: "Data final não pode ser anterior à data inicial.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const handleGeneratePdf = async () => {
    if (!hasRequiredFilters() || !hasValidDateRange()) return;

    setIsGeneratingPdf(true);
    try {
      await generatePatientReport({
        patientId: selectedPatientId,
        startDate,
        endDate,
      });
      toast({
        title: "Relatório gerado",
        description: "O PDF foi gerado com sucesso e está pronto para download.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro de conexão com o servidor";
      toast({ title: "Erro ao gerar relatório", description: message, variant: "destructive" });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleExport = async () => {
    if (!hasRequiredFilters() || !hasValidDateRange()) return;

    setIsExporting(true);
    try {
      await exportData({
        patientId: selectedPatientId,
        startDate,
        endDate,
      });
      toast({
        title: "Dados exportados",
        description: "O arquivo Excel foi gerado com sucesso.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro de conexão com o servidor";
      toast({ title: "Erro ao exportar dados", description: message, variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <Card className="shadow-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Filtros de Relatório</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="report-patient">Selecionar Paciente</Label>
            <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
              <SelectTrigger id="report-patient">
                <SelectValue placeholder="Selecione um paciente" />
              </SelectTrigger>
              <SelectContent>
                {patients.map((patient) => (
                  <SelectItem key={patient.id} value={patient.id}>
                    {patient.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Período do Relatório</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="report-start-date">Data Inicial</Label>
                <Input
                  id="report-start-date"
                  type="date"
                  value={startDate}
                  required
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="report-end-date">Data Final</Label>
                <Input
                  id="report-end-date"
                  type="date"
                  value={endDate}
                  required
                  onChange={(event) => setEndDate(event.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="shadow-card border-border">
          <CardHeader>
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-base font-semibold">Relatório do Paciente</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-6">
              Gere um relatório em PDF com os dados do paciente e o histórico clínico filtrado pelo período selecionado.
            </p>
            <Button className="w-full" onClick={handleGeneratePdf} disabled={isGeneratingPdf}>
              {isGeneratingPdf ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Gerar PDF
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-card border-border">
          <CardHeader>
            <div className="h-10 w-10 rounded-lg bg-emerald-100 flex items-center justify-center mb-2">
              <Download className="h-5 w-5 text-emerald-600" />
            </div>
            <CardTitle className="text-base font-semibold">Exportar Dados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-6">
              Exporte para Excel os dados do paciente selecionado, respeitando o período informado.
            </p>
            <Button variant="outline" className="w-full" onClick={handleExport} disabled={isExporting}>
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Exportando...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar para Excel
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Reports;
