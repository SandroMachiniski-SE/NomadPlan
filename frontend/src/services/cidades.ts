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
