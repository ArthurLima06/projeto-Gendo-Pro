import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { generatePatientReport, exportData } from "@/services/reportsService";

const Reports = () => {
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleGeneratePdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const res = await generatePatientReport();
      if (res.success === false) {
        toast({
          title: "Erro ao gerar relatório",
          description: res.error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Relatório gerado",
          description: "O PDF foi gerado com sucesso e está pronto para download.",
        });
      }
    } catch {
      toast({ title: "Erro de conexão com o servidor", variant: "destructive" });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const res = await exportData();
      if (res.success === false) {
        toast({
          title: "Erro ao exportar dados",
          description: res.error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Dados exportados",
          description: "O arquivo Excel foi gerado com sucesso.",
        });
      }
    } catch {
      toast({ title: "Erro de conexão com o servidor", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl">
      <Card className="shadow-card border-border">
        <CardHeader>
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="text-base font-semibold">Relatório do Paciente</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-6">
            Gere um relatório em PDF com o histórico de sessões do paciente, incluindo datas, anotações e detalhes do profissional.
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
            Exporte os dados do sistema para Excel, incluindo pacientes, consultas ou registros financeiros para análise externa.
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
  );
};

export default Reports;
