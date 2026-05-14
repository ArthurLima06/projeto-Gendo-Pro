import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createPatient } from "@/services/patientsService";
import { formatCep, lookupCep, normalizeCep } from "@/services/cepService";
import { getAgreements, type Agreement } from "@/services/agreementsService";

const patientSchema = z
  .object({
    name: z.string().min(1, "Informe o nome completo"),
    age: z
      .string()
      .min(1, "Informe a idade")
      .refine((v) => !isNaN(Number(v)) && Number(v) >= 0, "Idade invalida"),
    school: z.string().optional(),
    responsible: z.string().optional(),
    phone: z.string().min(1, "Informe o telefone"),
    email: z.string().min(1, "Informe o email").email("Email invalido"),
    cep: z
      .string()
      .optional()
      .refine((value) => !value || normalizeCep(value).length === 8, "CEP invalido"),
    number: z.string().optional(),
    address: z.string().optional(),
    district: z.string().optional(),
    city: z.string().optional(),
    careType: z.enum(["particular", "convenio"], { required_error: "Selecione a forma de atendimento" }),
    agreementId: z.string().optional(),
    agreementPlan: z.string().optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const age = Number(data.age);
    if (!isNaN(age) && age < 18 && (!data.responsible || data.responsible.trim() === "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Informe o responsavel",
        path: ["responsible"],
      });
    }
    if (data.careType === "convenio") {
      if (!data.agreementId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Selecione o convenio",
          path: ["agreementId"],
        });
      }
      if (!data.agreementPlan) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Selecione o plano",
          path: ["agreementPlan"],
        });
      }
    }
  });

type PatientFormValues = z.infer<typeof patientSchema>;
type CepFeedback = { type: "warning" | "info"; message: string } | null;

const RequiredMark = () => <span className="text-destructive ml-0.5">*</span>;

const PatientRegistration = () => {
  const [isSaving, setIsSaving] = useState(false);
  const [isLookingUpCep, setIsLookingUpCep] = useState(false);
  const [cepFeedback, setCepFeedback] = useState<CepFeedback>(null);
  const [agreements, setAgreements] = useState<Agreement[]>([]);
  const lastLookupCepRef = useRef("");

  const form = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      name: "",
      age: "",
      school: "",
      responsible: "",
      phone: "",
      email: "",
      cep: "",
      number: "",
      address: "",
      district: "",
      city: "",
      careType: "particular",
      agreementId: "",
      agreementPlan: "",
      notes: "",
    },
    mode: "onSubmit",
  });

  const ageValue = form.watch("age");
  const cepValue = form.watch("cep");
  const careTypeValue = form.watch("careType");
  const agreementIdValue = form.watch("agreementId");
  const isMinor = !isNaN(Number(ageValue)) && Number(ageValue) < 18 && ageValue !== "";
  const activeAgreements = agreements.filter((item) => item.status === "ativo");
  const selectedAgreement = activeAgreements.find((item) => item.id === agreementIdValue);
  const selectedAgreementPlans = selectedAgreement?.plans || [];

  useEffect(() => {
    const loadAgreements = async () => {
      const response = await getAgreements({ activeOnly: true });
      if (response.success) {
        setAgreements(response.data);
      }
    };
    void loadAgreements();
  }, []);

  useEffect(() => {
    if (careTypeValue !== "convenio") {
      form.setValue("agreementId", "");
      form.setValue("agreementPlan", "");
    }
  }, [careTypeValue, form]);

  useEffect(() => {
    const currentPlan = form.getValues("agreementPlan") || "";
    if (currentPlan && !selectedAgreementPlans.includes(currentPlan)) {
      form.setValue("agreementPlan", "");
    }
  }, [selectedAgreementPlans, form]);

  useEffect(() => {
    const normalizedCep = normalizeCep(cepValue || "");
    if (normalizedCep.length < 8) {
      setCepFeedback(null);
      return;
    }
    if (normalizedCep === lastLookupCepRef.current) {
      return;
    }

    const timerId = window.setTimeout(async () => {
      setIsLookingUpCep(true);
      try {
        const result = await lookupCep(normalizedCep);
        if (!result) {
          setCepFeedback({ type: "warning", message: "CEP nao encontrado. Continue preenchendo manualmente." });
          return;
        }
        form.setValue("address", result.address, { shouldDirty: true, shouldValidate: true });
        form.setValue("district", result.district, { shouldDirty: true, shouldValidate: true });
        form.setValue("city", result.city, { shouldDirty: true, shouldValidate: true });
        form.setValue("cep", formatCep(result.cep), { shouldDirty: true, shouldValidate: true });
        setCepFeedback({ type: "info", message: "Endereco preenchido automaticamente. Voce pode editar se precisar." });
        lastLookupCepRef.current = result.cep;
      } catch {
        setCepFeedback({ type: "warning", message: "Nao foi possivel consultar o CEP agora." });
      } finally {
        setIsLookingUpCep(false);
      }
    }, 500);

    return () => window.clearTimeout(timerId);
  }, [cepValue, form]);

  const onSubmit = async (data: PatientFormValues) => {
    if (data.careType === "convenio" && activeAgreements.length === 0) {
      toast({
        title: "Nenhum convenio disponivel no momento.",
        description: "Cadastre e ative ao menos um convenio para selecionar esta opcao.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const res = await createPatient({
        name: data.name,
        age: data.age,
        school: data.school,
        responsible: data.responsible,
        phone: data.phone,
        email: data.email,
        cep: data.cep ? normalizeCep(data.cep) : "",
        number: data.number,
        address: data.address,
        district: data.district,
        city: data.city,
        careType: data.careType,
        agreementId: data.careType === "convenio" ? data.agreementId : undefined,
        agreementPlan: data.careType === "convenio" ? data.agreementPlan : undefined,
        notes: data.notes,
      });
      if (res.success === false) {
        toast({ title: "Erro ao salvar paciente", description: res.error.message, variant: "destructive" });
      } else {
        toast({ title: "Paciente salvo com sucesso", description: "O cadastro foi registrado no sistema." });
        form.reset();
        setCepFeedback(null);
        lastLookupCepRef.current = "";
      }
    } catch {
      toast({ title: "Erro de conexao com o servidor", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    form.reset();
    setCepFeedback(null);
    lastLookupCepRef.current = "";
    toast({ title: "Formulario limpo", description: "Todos os campos foram resetados." });
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
                <FormField
                  control={form.control}
                  name="careType"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Forma de atendimento<RequiredMark /></FormLabel>
                      <FormControl>
                        <RadioGroup
                          value={field.value}
                          onValueChange={field.onChange}
                          className="flex flex-wrap items-center gap-6"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="particular" id="care-particular" />
                            <Label htmlFor="care-particular">Particular</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="convenio" id="care-convenio" disabled={activeAgreements.length === 0} />
                            <Label htmlFor="care-convenio" className={activeAgreements.length === 0 ? "text-muted-foreground" : ""}>
                              Convenio
                            </Label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      {activeAgreements.length === 0 && (
                        <p className="text-xs text-muted-foreground">Nenhum convenio disponivel no momento.</p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {careTypeValue === "convenio" && (
                  <>
                    <FormField
                      control={form.control}
                      name="agreementId"
                      render={({ field, fieldState }) => (
                        <FormItem>
                          <FormLabel>Convenio<RequiredMark /></FormLabel>
                          <Select value={field.value || ""} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger className={fieldState.error ? "border-destructive focus-visible:ring-destructive" : ""}>
                                <SelectValue placeholder="Selecione o convenio" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {activeAgreements.map((agreement) => (
                                <SelectItem key={agreement.id} value={agreement.id}>
                                  {agreement.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="agreementPlan"
                      render={({ field, fieldState }) => (
                        <FormItem>
                          <FormLabel>Tipo do plano<RequiredMark /></FormLabel>
                          <Select value={field.value || ""} onValueChange={field.onChange} disabled={!selectedAgreement}>
                            <FormControl>
                              <SelectTrigger className={fieldState.error ? "border-destructive focus-visible:ring-destructive" : ""}>
                                <SelectValue placeholder={selectedAgreement ? "Selecione o plano" : "Selecione um convenio primeiro"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {selectedAgreementPlans.map((plan) => (
                                <SelectItem key={plan} value={plan}>
                                  {plan}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Nome Completo<RequiredMark /></FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Digite o nome completo"
                          className={fieldState.error ? "border-destructive focus-visible:ring-destructive" : ""}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="age"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Idade<RequiredMark /></FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          placeholder="Digite a idade"
                          className={fieldState.error ? "border-destructive focus-visible:ring-destructive" : ""}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="school"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Profissao</FormLabel>
                      <FormControl>
                        <Input placeholder="Digite a profissao" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="responsible"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Responsavel{isMinor && <RequiredMark />}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Pai, mae ou responsavel"
                          className={fieldState.error ? "border-destructive focus-visible:ring-destructive" : ""}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Telefone<RequiredMark /></FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          placeholder="(00) 00000-0000"
                          className={fieldState.error ? "border-destructive focus-visible:ring-destructive" : ""}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>E-mail<RequiredMark /></FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="email@exemplo.com"
                          className={fieldState.error ? "border-destructive focus-visible:ring-destructive" : ""}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="cep"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>CEP</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="00000-000"
                          className={fieldState.error ? "border-destructive focus-visible:ring-destructive" : ""}
                          value={field.value || ""}
                          onChange={(event) => field.onChange(formatCep(event.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                      {isLookingUpCep && <p className="text-xs text-muted-foreground">Consultando CEP...</p>}
                      {!isLookingUpCep && cepFeedback && (
                        <p
                          className={`text-xs ${
                            cepFeedback.type === "warning" ? "text-warning" : "text-muted-foreground"
                          }`}
                        >
                          {cepFeedback.message}
                        </p>
                      )}
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Numero</FormLabel>
                      <FormControl>
                        <Input placeholder="Numero do local" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Endereco</FormLabel>
                      <FormControl>
                        <Input placeholder="Rua, avenida ou logradouro" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="district"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bairro</FormLabel>
                      <FormControl>
                        <Input placeholder="Bairro" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cidade</FormLabel>
                      <FormControl>
                        <Input placeholder="Cidade" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Observacoes</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Observacoes adicionais..." rows={4} {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <Button type="button" variant="ghost" onClick={handleClear}>
                  Limpar
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar Paciente"
                  )}
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
