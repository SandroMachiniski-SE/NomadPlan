import { useEffect, useState } from "react";
import api from "./api";

export interface CidadeDisponivel {
  cidade: string;
  pontos: number;
}

// A lista muda pouco: é buscada uma vez por carregamento da página e compartilhada.
let pedido: Promise<CidadeDisponivel[]> | null = null;

function carregarCidades(): Promise<CidadeDisponivel[]> {
  pedido ??= api
    .get<{ dados: CidadeDisponivel[] }>("/pontos/cidades")
    .then((resposta) => resposta.data.dados)
    .catch((erro) => {
      console.error("Erro ao carregar as cidades:", erro);
      pedido = null;
      return [];
    });

  return pedido;
}

/** Cidades que têm pontos publicados (vazia enquanto carrega ou se a API falhar). */
export function useCidadesDisponiveis(): CidadeDisponivel[] {
  const [cidades, setCidades] = useState<CidadeDisponivel[]>([]);

  useEffect(() => {
    let ativo = true;

    carregarCidades().then((lista) => {
      if (ativo) setCidades(lista);
    });

    return () => {
      ativo = false;
    };
  }, []);

  return cidades;
}

export interface PreparoDaCidade {
  estado: "preparando" | "pronta" | "erro";
  etapa?: string;
  pontos?: number | null;
  erro?: string | null;
}

/** Município brasileiro devolvido pela busca; sem UF/coordenadas quando vem só do nosso banco. */
export interface CidadeDaBusca {
  cidade: string;
  uf: string | null;
  latitude: number | null;
  longitude: number | null;
  pontos: number;
  disponivel: boolean;
  preparo: PreparoDaCidade | null;
}

export async function buscarCidadesDoBrasil(texto: string) {
  const resposta = await api.get<{ dados: CidadeDaBusca[]; semServidorDeMapas: boolean }>("/cidades/buscar", {
    params: { q: texto },
  });

  return resposta.data;
}

/** Pede a preparação de uma cidade nova (baixa os lugares do OpenStreetMap em segundo plano). */
export async function prepararCidade(cidade: CidadeDaBusca): Promise<PreparoDaCidade> {
  const resposta = await api.post<PreparoDaCidade>("/cidades/preparar", {
    cidade: cidade.cidade,
    uf: cidade.uf,
    latitude: cidade.latitude,
    longitude: cidade.longitude,
  });

  return resposta.data;
}

export async function consultarPreparoDaCidade(cidade: string, uf: string): Promise<PreparoDaCidade> {
  const resposta = await api.get<PreparoDaCidade>("/cidades/preparar", { params: { cidade, uf } });

  return resposta.data;
}
