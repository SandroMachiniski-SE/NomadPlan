import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import fs from "fs";
import bcrypt from "bcryptjs";
import { Prisma, StatusPonto, TipoConta } from "@prisma/client";
import prisma from "../lib/prisma";
import { criarApp } from "../app";
import { gerarToken } from "../lib/auth";
import { PASTA_UPLOADS_TESTE } from "./ambiente";

export interface ServidorDeTeste {
  base: string;
  fechar: () => Promise<void>;
}

export async function iniciarServidor(): Promise<ServidorDeTeste> {
  const app = criarApp();

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });

  const { port } = server.address() as AddressInfo;

  return {
    base: `http://127.0.0.1:${port}`,
    fechar: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await prisma.$disconnect();
      fs.rmSync(PASTA_UPLOADS_TESTE, { recursive: true, force: true });
    },
  };
}

export interface RespostaHttp<T = any> {
  status: number;
  corpo: T;
  headers: Headers;
  texto: string;
}

export interface OpcoesRequisicao {
  token?: string;
  json?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
}

export function criarCliente(base: string) {
  return async function requisitar<T = any>(
    metodo: string,
    caminho: string,
    opcoes: OpcoesRequisicao = {},
  ): Promise<RespostaHttp<T>> {
    const headers: Record<string, string> = { ...(opcoes.headers ?? {}) };

    if (opcoes.token) {
      headers.Authorization = `Bearer ${opcoes.token}`;
    }

    let body: BodyInit | undefined;

    if (opcoes.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opcoes.json);
    } else if (opcoes.form) {
      body = opcoes.form;
    }

    const resposta = await fetch(`${base}${caminho}`, { method: metodo, headers, body });
    const texto = await resposta.text();

    let corpo: unknown = texto;
    try {
      corpo = texto ? JSON.parse(texto) : null;
    } catch {
      // resposta não JSON (CSV, por exemplo): fica como texto
    }

    return { status: resposta.status, corpo: corpo as T, headers: resposta.headers, texto };
  };
}

const TABELAS_PRESERVADAS = new Set(["_prisma_migrations", "spatial_ref_sys"]);

/** Zera todas as tabelas da aplicação (mantém as de sistema e as migrations). */
export async function limparBanco(): Promise<void> {
  const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `;

  const alvo = tabelas
    .map((t) => t.tablename)
    .filter((nome) => !TABELAS_PRESERVADAS.has(nome))
    .map((nome) => `"${nome}"`);

  if (alvo.length > 0) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${alvo.join(", ")} RESTART IDENTITY CASCADE`);
  }
}

// Custo baixo só nos testes: o bcrypt de produção usa 10 rodadas.
const HASH_PADRAO = bcrypt.hashSync("senha-de-teste-123", 4);
let contador = 0;

export const SENHA_DE_TESTE = "senha-de-teste-123";

export async function criarUsuario(
  dados: Partial<{
    nome: string;
    email: string;
    tipoConta: TipoConta;
    reputacao: number;
    ativo: boolean;
    cidadeBase: string;
    interesses: string[];
  }> = {},
) {
  contador += 1;

  const usuario = await prisma.usuario.create({
    data: {
      nome: dados.nome ?? `Usuário ${contador}`,
      email: dados.email ?? `usuario${contador}-${Date.now()}@teste.dev`,
      senhaHash: HASH_PADRAO,
      tipoConta: dados.tipoConta ?? TipoConta.VISITANTE,
      reputacao: dados.reputacao ?? 0,
      ativo: dados.ativo ?? true,
      cidadeBase: dados.cidadeBase ?? null,
      interesses: dados.interesses ?? [],
    },
  });

  const token = gerarToken({ sub: usuario.id, tipoConta: usuario.tipoConta });

  return { usuario, token };
}

export async function criarPonto(
  dados: Partial<{
    nome: string;
    categoria: string;
    cidade: string;
    latitude: number | null;
    longitude: number | null;
    horarioFuncionamento: string | null;
    faixaPreco: string | null;
    acessibilidade: string | null;
    descricao: string | null;
    telefoneContato: string | null;
    status: StatusPonto;
    seloVerificado: boolean;
    idResponsavel: number | null;
    imagemUrl: string | null;
  }> = {},
) {
  contador += 1;

  return prisma.pontoTuristico.create({
    data: {
      nome: dados.nome ?? `Ponto ${contador}`,
      categoria: dados.categoria ?? "Natureza",
      cidade: dados.cidade ?? "Joinville",
      latitude: dados.latitude === undefined ? -26.3045 : dados.latitude,
      longitude: dados.longitude === undefined ? -48.8487 : dados.longitude,
      horarioFuncionamento:
        dados.horarioFuncionamento === undefined ? "Todos os dias, 24h" : dados.horarioFuncionamento,
      faixaPreco: dados.faixaPreco ?? null,
      acessibilidade: dados.acessibilidade ?? null,
      descricao: dados.descricao ?? null,
      telefoneContato: dados.telefoneContato ?? null,
      status: dados.status ?? StatusPonto.PUBLICADO,
      seloVerificado: dados.seloVerificado ?? false,
      idResponsavel: dados.idResponsavel ?? null,
      imagemUrl: dados.imagemUrl ?? null,
    } satisfies Prisma.PontoTuristicoUncheckedCreateInput,
  });
}

/** PNG 1x1 válido, para testar upload de imagem. */
export const PNG_MINIMO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export function formularioComArquivo(
  campo: string,
  conteudo: Buffer,
  nomeArquivo: string,
  tipo: string,
): FormData {
  const form = new FormData();
  form.append(campo, new Blob([new Uint8Array(conteudo)], { type: tipo }), nomeArquivo);
  return form;
}
