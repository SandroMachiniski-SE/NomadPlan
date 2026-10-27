import "../ambienteBuscaLenta";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../lib/prisma";
import { criarCliente, criarPonto, iniciarServidor, limparBanco, type ServidorDeTeste } from "../suporte";

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("busca que estoura o tempo limite (AF02)", () => {
  let servidor: ServidorDeTeste;
  let api: ReturnType<typeof criarCliente>;

  before(async () => {
    await limparBanco();
    await criarPonto({ nome: "Mirante", cidade: "Joinville" });
    servidor = await iniciarServidor();
    api = criarCliente(servidor.base);
  });

  after(async () => {
    await servidor.fechar();
  });

  // Mantém a tabela de pontos travada em uma transação paralela, o que faz qualquer busca
  // ficar esperando no banco de forma determinística (sem depender de "sorte" de tempo).
  async function comTabelaTravada<T>(acao: () => Promise<T>): Promise<T> {
    let liberar!: () => void;
    const bloqueio = new Promise<void>((resolve) => {
      liberar = resolve;
    });

    let travou!: () => void;
    const travada = new Promise<void>((resolve) => {
      travou = resolve;
    });

    const transacao = prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe("LOCK TABLE ponto_turistico IN ACCESS EXCLUSIVE MODE");
        travou();
        await bloqueio;
      },
      { timeout: 20000 },
    );

    await travada;

    try {
      return await acao();
    } finally {
      liberar();
      await transacao;
      await esperar(50);
    }
  }

  it("responde 504 com a mensagem do RFC quando não há nada em cache, sem derrubar o servidor", async () => {
    const r = await comTabelaTravada(() => api("GET", "/pontos?cidade=Blumenau"));

    assert.equal(r.status, 504);
    assert.equal(r.corpo.erro, "Não foi possível completar a busca no momento. Tente novamente.");
    assert.equal(r.corpo.tempoEsgotado, true);

    assert.equal((await api("GET", "/health")).status, 200);
    assert.equal((await api("GET", "/pontos?cidade=Blumenau")).status, 200, "volta ao normal quando o banco responde");
  });

  it("devolve o último resultado igual, marcado como desatualizado, quando o banco demora", async () => {
    const normal = await api("GET", "/pontos?cidade=Joinville");
    assert.equal(normal.status, 200);
    assert.equal(normal.corpo.desatualizado, undefined);

    const r = await comTabelaTravada(() => api("GET", "/pontos?cidade=Joinville"));

    assert.equal(r.status, 200);
    assert.equal(r.corpo.desatualizado, true);
    assert.deepEqual(
      r.corpo.dados.map((p: { nome: string }) => p.nome),
      ["Mirante"],
    );
  });
});
