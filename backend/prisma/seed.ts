import "dotenv/config";
import { Prisma, PrismaClient, StatusPonto, TipoConta } from "@prisma/client";
import { gerarHashSenha } from "../src/lib/auth";

const prisma = new PrismaClient();

const SENHA_DEMONSTRACAO = "senha-temporaria";

async function main() {
  // O seed cria contas com senha conhecida: em produção seria uma porta aberta.
  if (process.env.NODE_ENV === "production") {
    throw new Error("O seed cria contas de demonstração com senha conhecida e não deve rodar em produção.");
  }

  const usuario = await prisma.usuario.upsert({
    where: {
      email: "admin@nomadplan.local",
    },
    update: {},
    create: {
      nome: "Administrador NomadPlan",
      email: "admin@nomadplan.local",
      // Login de demonstração: admin@nomadplan.local / senha-temporaria (troque em produção).
      senhaHash: await gerarHashSenha(SENHA_DEMONSTRACAO),
      tipoConta: TipoConta.ADMIN,
      cidadeBase: "Joinville",
      consentimentoEm: new Date(),
    },
  });

  await criarContasDeDemonstracao();

  await inserirPontosNovos([
    {
      nome: "Mirante de Joinville",
      descricao: "Ponto turístico com vista panorâmica da cidade.",
      categoria: "Natureza",
      cidade: "Joinville",
      endereco: "Joinville, SC",
      latitude: -26.3045,
      longitude: -48.8487,
      faixaPreco: "Gratuito",
      acessibilidade: "A verificar",
      horarioFuncionamento: "Todos os dias, 24h",
      status: StatusPonto.PUBLICADO,
      seloVerificado: true,
      idResponsavel: usuario.id,
    },
    {
      nome: "Museu Nacional de Imigração e Colonização",
      descricao: "Espaço histórico e cultural dedicado à imigração em Joinville.",
      categoria: "Cultura",
      cidade: "Joinville",
      endereco: "Rua Rio Branco, 229, Joinville - SC",
      latitude: -26.3041,
      longitude: -48.8466,
      faixaPreco: "Gratuito",
      acessibilidade: "Rampa de acesso, elevador e banheiro adaptado",
      horarioFuncionamento: "Terça a domingo, 9h-17h",
      status: StatusPonto.PUBLICADO,
      seloVerificado: true,
      idResponsavel: usuario.id,
    },
    {
      nome: "Parque Zoobotânico",
      descricao: "Área verde para lazer, caminhada e contato com a natureza.",
      categoria: "Natureza",
      cidade: "Joinville",
      endereco: "Rua Pastor Guilherme Rau, Joinville - SC",
      latitude: -26.2969,
      longitude: -48.8429,
      faixaPreco: "Gratuito",
      acessibilidade: "A verificar",
      horarioFuncionamento: "Todos os dias, 8h-18h",
      status: StatusPonto.PUBLICADO,
      seloVerificado: true,
      idResponsavel: usuario.id,
    },
  ]);

  await inserirPontosNovos(gerarPontosAdicionais(usuario.id));

  console.log("Dados iniciais inseridos com sucesso.");
  console.log(`Login de demonstração: admin@nomadplan.local / ${SENHA_DEMONSTRACAO} (e moderador@, negocio@ e morador@nomadplan.local).`);
}

// Contas de cada papel para demonstrar o sistema.
async function criarContasDeDemonstracao() {
  const senhaHash = await gerarHashSenha(SENHA_DEMONSTRACAO);
  const contas = [
    { nome: "Moderador NomadPlan", email: "moderador@nomadplan.local", tipoConta: TipoConta.MODERADOR },
    { nome: "Negócio NomadPlan", email: "negocio@nomadplan.local", tipoConta: TipoConta.NEGOCIO },
    { nome: "Morador NomadPlan", email: "morador@nomadplan.local", tipoConta: TipoConta.MORADOR },
  ];

  for (const conta of contas) {
    await prisma.usuario.upsert({
      where: { email: conta.email },
      update: {},
      create: { ...conta, senhaHash, cidadeBase: "Joinville", consentimentoEm: new Date() },
    });
  }
}

// O seed pode ser executado mais de uma vez: só entram os pontos que ainda não existem
// (a tabela não tem restrição de nome único, então "skipDuplicates" não bastaria).
async function inserirPontosNovos(pontos: Prisma.PontoTuristicoUncheckedCreateInput[]) {
  for (const ponto of pontos) {
    const existe = await prisma.pontoTuristico.findFirst({
      where: { nome: ponto.nome, cidade: ponto.cidade },
      select: { id: true },
    });

    if (!existe) {
      await prisma.pontoTuristico.create({ data: ponto });
    }
  }
}

// Gera um dataset maior (RFC seção 5.3: cobertura mínima de 100 pontos) para
// exercitar busca, filtros e paginação com um volume mais realista. Usa um PRNG
// simples e determinístico (sem dependências) para manter o seed reprodutível.
function gerarPontosAdicionais(idResponsavel: number) {
  const CIDADES = [
    { cidade: "Joinville", lat: -26.3045, lng: -48.8487 },
    { cidade: "Florianópolis", lat: -27.5954, lng: -48.548 },
    { cidade: "Blumenau", lat: -26.9194, lng: -49.0661 },
  ];

  const CATEGORIAS = [
    "Natureza",
    "Cultura",
    "Gastronomia",
    "Hospedagem",
    "Aventura",
    "Compras",
    "Religioso",
  ];

  const FAIXAS_PRECO = ["Gratuito", "$", "$$", "$$$"];
  const ACESSIBILIDADES = [
    "Rampa de acesso e banheiro adaptado",
    "Piso tátil e sinalização em Libras",
    "Estacionamento reservado",
    "A verificar",
  ];
  const HORARIOS = ["Todos os dias, 9h-18h", "Seg-Sáb, 8h-20h", "Ter-Dom, 10h-17h", "Todos os dias, 24h"];

  let semente = 42;
  function proximoAleatorio() {
    // PRNG determinístico (xorshift32) — mesmo dataset a cada execução do seed.
    semente ^= semente << 13;
    semente ^= semente >>> 17;
    semente ^= semente << 5;
    semente |= 0;
    return (semente >>> 0) / 4294967295;
  }

  const TOTAL_PONTOS_GERADOS = 110;
  const pontos = [];

  for (let i = 0; i < TOTAL_PONTOS_GERADOS; i += 1) {
    const cidadeBase = CIDADES[i % CIDADES.length];
    const categoria = CATEGORIAS[i % CATEGORIAS.length];
    const jitterLat = (proximoAleatorio() - 0.5) * 0.09; // ~ +/-5km
    const jitterLng = (proximoAleatorio() - 0.5) * 0.09;

    pontos.push({
      nome: `${categoria} ${cidadeBase.cidade} #${i + 1}`,
      descricao: `Atrativo de ${categoria.toLowerCase()} gerado para testes de busca em ${cidadeBase.cidade}.`,
      categoria,
      cidade: cidadeBase.cidade,
      endereco: `${cidadeBase.cidade} - SC`,
      latitude: cidadeBase.lat + jitterLat,
      longitude: cidadeBase.lng + jitterLng,
      faixaPreco: FAIXAS_PRECO[i % FAIXAS_PRECO.length],
      acessibilidade: ACESSIBILIDADES[i % ACESSIBILIDADES.length],
      horarioFuncionamento: HORARIOS[i % HORARIOS.length],
      status: StatusPonto.PUBLICADO,
      // 2 em cada 5 pontos têm o selo de verificado (meta do RFC: pelo menos 30%).
      seloVerificado: i % 5 < 2,
      idResponsavel,
    });
  }

  return pontos;
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });