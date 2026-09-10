import "dotenv/config";
import { PrismaClient, StatusPonto, TipoConta } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const usuario = await prisma.usuario.upsert({
    where: {
      email: "admin@NomadPlanmais.local",
    },
    update: {},
    create: {
      nome: "Administrador NomadPlan",
      email: "admin@NomadPlanmais.local",
      senhaHash: "senha-temporaria",
      tipoConta: TipoConta.ADMIN,
      cidadeBase: "Joinville",
    },
  });

  await prisma.pontoTuristico.createMany({
    data: [
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
        acessibilidade: "Acessibilidade parcial",
        horarioFuncionamento: "Terça a domingo, 9h-17h",
        status: StatusPonto.PUBLICADO,
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
        idResponsavel: usuario.id,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.pontoTuristico.createMany({
    data: gerarPontosAdicionais(usuario.id),
    skipDuplicates: true,
  });

  console.log("Dados iniciais inseridos com sucesso.");
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
  const ACESSIBILIDADES = ["Acessível", "Parcialmente acessível", "A verificar"];
  const HORARIOS = ["Todos os dias, 9h-18h", "Seg-Sáb, 8h-20h", "Ter-Dom, 10h-17h", "24h"];

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