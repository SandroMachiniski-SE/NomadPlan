// Teste de carga do NomadPlan (RNF01, RNF02, RNF04, RNF27).
//
// Cada "usuário virtual" é uma conexão que dispara uma requisição, espera a resposta e
// dispara a próxima, durante o tempo definido. Mede latência (média, p50, p95, p99, máx.),
// vazão e erros para cada cenário, com 1 usuário (base de comparação) e com N usuários.
//
// Uso (a API precisa estar no ar, de preferência compilada: NODE_ENV=production node dist/src/server.js):
//   node carga/carga.mjs [--url http://localhost:3333] [--usuarios 100] [--duracao 20] [--pausa-ms 0] [--saida relatorio.json]
//
// --pausa-ms: tempo médio de "pensar" entre uma requisição e a seguinte de cada usuário (sorteado
// entre 50% e 150% do valor). Com 0 (padrão) cada usuário dispara sem parar — um teste de
// saturação, bem mais severo que o uso real. Para o perfil de 100 pessoas navegando, use ~1000.
//
// Atenção: os limites de taxa (RB10) bloqueariam o teste; suba a API com RATE_LIMIT_OFF=1.

import { writeFileSync } from "node:fs";
import http from "node:http";
import { performance } from "node:perf_hooks";

const args = process.argv.slice(2);
const opcao = (nome, padrao) => {
  const i = args.indexOf(`--${nome}`);
  return i >= 0 ? args[i + 1] : padrao;
};

const BASE = new URL(opcao("url", "http://localhost:3333"));
const USUARIOS = Number(opcao("usuarios", 100));
const DURACAO_S = Number(opcao("duracao", 20));
const SAIDA = opcao("saida", "");
const PAUSA_MS = Number(opcao("pausa-ms", 0));

const agente = new http.Agent({ keepAlive: true, maxSockets: Math.max(USUARIOS, 1) });

function requisitar(metodo, caminho, { token, corpo } = {}) {
  return new Promise((resolve) => {
    const inicio = performance.now();
    const dados = corpo ? JSON.stringify(corpo) : undefined;

    const req = http.request(
      {
        agent: agente,
        host: BASE.hostname,
        port: BASE.port,
        path: caminho,
        method: metodo,
        headers: {
          ...(dados ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(dados) } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        timeout: 30_000,
      },
      (res) => {
        const pedacos = [];
        res.on("data", (p) => pedacos.push(p));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            ms: performance.now() - inicio,
            corpo: Buffer.concat(pedacos).toString("utf8"),
          }),
        );
      },
    );

    req.on("timeout", () => req.destroy(new Error("tempo esgotado")));
    req.on("error", () => resolve({ status: 0, ms: performance.now() - inicio, corpo: "" }));
    if (dados) req.write(dados);
    req.end();
  });
}

function percentil(ordenado, p) {
  if (ordenado.length === 0) return 0;
  return ordenado[Math.min(ordenado.length - 1, Math.ceil((p / 100) * ordenado.length) - 1)];
}

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function cenario(nome, usuarios, gerarRequisicao, pausaMs = 0) {
  const latencias = [];
  let erros = 0;
  const fim = performance.now() + DURACAO_S * 1000;
  const inicio = performance.now();

  async function usuarioVirtual(indice) {
    let n = 0;
    while (performance.now() < fim) {
      const { metodo, caminho, opcoes } = gerarRequisicao(indice, n++);
      const r = await requisitar(metodo, caminho, opcoes);

      if (r.status >= 200 && r.status < 300) latencias.push(r.ms);
      else erros += 1;

      if (pausaMs > 0) await dormir(pausaMs * (0.5 + Math.random()));
    }
  }

  await Promise.all(Array.from({ length: usuarios }, (_, i) => usuarioVirtual(i)));

  const total = performance.now() - inicio;
  const ordenado = [...latencias].sort((a, b) => a - b);
  const media = ordenado.reduce((s, v) => s + v, 0) / (ordenado.length || 1);

  return {
    cenario: nome,
    usuarios,
    requisicoes: latencias.length + erros,
    erros,
    reqPorSegundo: Number(((latencias.length + erros) / (total / 1000)).toFixed(1)),
    mediaMs: Number(media.toFixed(1)),
    p50Ms: Number(percentil(ordenado, 50).toFixed(1)),
    p95Ms: Number(percentil(ordenado, 95).toFixed(1)),
    p99Ms: Number(percentil(ordenado, 99).toFixed(1)),
    maxMs: Number((ordenado.at(-1) ?? 0).toFixed(1)),
  };
}

async function prepararUsuario() {
  const email = `carga.${Date.now()}@carga.test`;
  const r = await requisitar("POST", "/auth/registrar", {
    corpo: { nome: "Usuário de Carga", email, senha: "senha-de-carga-123", aceitouPolitica: true },
  });

  if (r.status !== 201) {
    throw new Error(`Não foi possível criar o usuário de teste (status ${r.status}): ${r.corpo}`);
  }

  return JSON.parse(r.corpo).token;
}

async function main() {
  const saude = await requisitar("GET", "/health");
  if (saude.status !== 200) throw new Error(`API fora do ar em ${BASE.origin} (status ${saude.status}).`);

  const token = await prepararUsuario();

  // Pontos reais para variar as consultas.
  const lista = JSON.parse((await requisitar("GET", "/pontos?limite=100")).corpo).dados;
  const cidades = [...new Set(lista.map((p) => p.cidade))];
  const categorias = [...new Set(lista.map((p) => p.categoria))];
  const ids = lista.map((p) => p.id);

  if (lista.length === 0) throw new Error("O banco não tem pontos publicados para o teste.");

  const cenarios = [
    [
      "Busca por cidade e categoria",
      (i, n) => ({
        metodo: "GET",
        caminho: `/pontos?cidade=${encodeURIComponent(cidades[(i + n) % cidades.length])}&categoria=${encodeURIComponent(categorias[n % categorias.length])}`,
      }),
    ],
    [
      "Busca por proximidade (raio de 10 km)",
      (i, n) => {
        const p = lista[(i + n) % lista.length];
        return { metodo: "GET", caminho: `/pontos?lat=${p.latitude}&lng=${p.longitude}&raioKm=10&ordenar=distancia` };
      },
    ],
    ["Detalhe do ponto", (i, n) => ({ metodo: "GET", caminho: `/pontos/${ids[(i + n) % ids.length]}` })],
    [
      "Geração de roteiro",
      (i, n) => ({
        metodo: "POST",
        caminho: "/roteiros/gerar",
        opcoes: {
          token,
          corpo: { cidade: cidades[(i + n) % cidades.length], horasDisponiveis: 6, dataHoraInicio: "2026-11-04T09:00:00-03:00" },
        },
      }),
    ],
  ];

  const resultados = [];

  for (const [nome, gerar] of cenarios) {
    console.log(`\n▶ ${nome}`);
    const base = await cenario(nome, 1, gerar);
    const carga = await cenario(nome, USUARIOS, gerar, PAUSA_MS);

    resultados.push({ base, carga, razaoMedia: Number((carga.mediaMs / (base.mediaMs || 1)).toFixed(2)) });

    console.table([base, carga]);
  }

  if (SAIDA) {
    writeFileSync(
      SAIDA,
      JSON.stringify({ url: BASE.origin, usuarios: USUARIOS, duracaoS: DURACAO_S, pausaMs: PAUSA_MS, resultados }, null, 2),
    );
    console.log(`\nResultados gravados em ${SAIDA}`);
  }

  agente.destroy();
}

main().catch((erro) => {
  console.error(erro.message);
  process.exit(1);
});
