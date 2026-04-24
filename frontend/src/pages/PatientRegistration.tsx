import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { createPatient } from "@/services/patientsService";

const patientSchema = z
  .object({
    name: z.string().min(1, "Informe o nome completo"),
    age: z
      .string()
      .min(1, "Informe a idade")
      .refine((v) => !isNaN(Number(v)) && Number(v) >= 0, "Idade inválida"),
    school: z.string().optional(),
    responsible: z.string().optional(),
    phone: z.string().min(1, "Informe o telefone"),
    email: z
      .string()
      .min(1, "Informe o email")
      .email("Email inválido"),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const age = Number(data.age);
    if (!isNaN(age) && age < 18 && (!data.responsible || data.responsible.trim() === "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o responsável",
        path: ["responsible"],
      });
    }
  });

type PatientFormValues = z.infer<typeof patientSchema>;

const RequiredMark = () => <span className="text-destructive ml-0.5">*</span>;

const PatientRegistration = () => {
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema),
    defaultValues: { name: "", age: "", school: "", responsible: "", phone: "", email: "", notes: "" },
    mode: "onSubmit",
  });

  const ageValue = form.watch("age");
  const isMinor = !isNaN(Number(ageValue)) && Number(ageValue) < 18 && ageValue !== "";

  const onSubmit = async (data: PatientFormValues) => {
    setIsSaving(true);
    try {
      const res = await createPatient({
        name: data.name,
        age: data.age,
        school: data.school,
        responsible: data.responsible,
        phone: data.phone,
        email: data.email,
        notes: data.notes,
      });
      if (res.success === false) {
        toast({ title: "Erro ao salvar paciente", description: res.error.message, variant: "destructive" });
      } else {
        toast({ title: "Paciente salvo com sucesso", description: "O cadastro foi registrado no sistema." });
        form.reset();
      }
    } catch {
      toast({ title: "Erro de conexão com o servidor", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    form.reset();
    toast({ title: "Formulário limpo", description: "Todos os campos foram resetados." });
  };

  return (
    <div className="max-w-4xl">
      <Card className="shadow-card border-border">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Cadastrar Novo Paciente</CardTitle>
          <p className="text-sm text-muted-foreground">Preencha os dados do paciente abaixo.</p>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField control={form.control} name="name" render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>Nome Completo<RequiredMark /></FormLabel>
                    <FormControl>
                      <Input placeholder="Digite o nome completo" className={fieldState.error ? "border-destructive focus-visible:ring-destructive" : ""} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="age" render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>Idade<RequiredMark /></FormLabel>
                    <FormControl>
                      <Input type="number" min="0" placeholder="Digite a idade" className={fieldState.error ? "border-destructive focus-visible:ring-destructive" : ""} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="school" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Escolaridade</FormLabel>
                    <FormControl>
                      <Input placeholder="Digite o nível de escolaridade" {...field} />
                    </FormControl>
                  </FormItem>
                )} />

                <FormField control={form.control} name="responsible" render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>Responsável{isMinor && <RequiredMark />}</FormLabel>
                    <FormControl>
                      <Input placeholder="Pai, mãe ou responsável" className={fieldState.error ? "border-destructive focus-visible:ring-destructive" : ""} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="phone" render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>Telefone<RequiredMark /></FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="(00) 00000-0000" className={fieldState.error ? "border-destructive focus-visible:ring-destructive" : ""} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="email" render={({ field, fieldState }) => (
                  <FormItem>
                    <FormLabel>E-mail<RequiredMark /></FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="email@exemplo.com" className={fieldState.error ? "border-destructive focus-visible:ring-destructive" : ""} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Observações adicionais..." rows={4} {...field} />
                  </FormControl>
                </FormItem>
              )} />

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <Button type="button" variant="ghost" onClick={handleClear}>Limpar</Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (<><Loader2 className="h-4 w-4 animate-spin" />Salvando...</>) : "Salvar Paciente"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
};

export default PatientRegistration;
