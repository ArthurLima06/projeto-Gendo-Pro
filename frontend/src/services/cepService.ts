export interface CepLookupResult {
  cep: string;
  address: string;
  district: string;
  city: string;
}

interface ViaCepResponse {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  erro?: boolean;
}

export function normalizeCep(value: string): string {
  return value.replace(/\D/g, "").slice(0, 8);
}

export function formatCep(value: string): string {
  const cep = normalizeCep(value);
  if (cep.length <= 5) {
    return cep;
  }
  return `${cep.slice(0, 5)}-${cep.slice(5)}`;
}

export async function lookupCep(rawCep: string): Promise<CepLookupResult | null> {
  const cep = normalizeCep(rawCep);
  if (cep.length !== 8) {
    throw new Error("CEP deve conter 8 digitos.");
  }

  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel consultar o CEP.");
  }

  const data = (await response.json()) as ViaCepResponse;
  if (data.erro) {
    return null;
  }

  return {
    cep,
    address: data.logradouro || "",
    district: data.bairro || "",
    city: data.localidade || "",
  };
}
