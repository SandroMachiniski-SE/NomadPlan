import { Router, Request, Response } from "express";
import { z } from "zod";
import { autenticar } from "../middleware/auth";
import { limiteBuscaCidade, limitePrepararCidade } from "../middleware/rateLimit";
import { cidadesComPontos, normalizarCidade } from "../lib/cidades";
import { buscarCidadesNoBrasil, UFS, type CidadeEncontrada } from "../lib/geocodificacao";
import { buscarMunicipiosPorNome, municipioMaisProximo, procurarMunicipio } from "../lib/municipios";
import {
  consultarPreparo,
  PONTOS_PARA_CIDADE_PRONTA,
  pontosDaCidade,
  prepararCidade,
  type PreparoDeCidade,
} from "../lib/cidadesSobDemanda";

const cidadesRouter = Router();

const NOME_DE_CIDADE = /^[\p{L}0-9 .'’-]+$/u;

const buscaSchema = z.object({
  q: z.string().trim().min(2, "Digite ao menos 2 letras.").max(80),
});

const prepararSchema = z.object({
  cidade: z.string().trim().min(2).max(80).regex(NOME_DE_CIDADE),
  uf: z.enum(UFS),
  // Coordenadas do centro, como o Nominatim devolveu na busca: servem só para distinguir
  // cidades de mesmo nome em estados diferentes. Têm de cair dentro do Brasil.
  latitude: z.coerce.number().min(-34).max(6),
  longitude: z.coerce.number().min(-74).max(-28),
});

const pertoSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

// Mais longe que isso da sede mais próxima, a pessoa não está no Brasil (ou está no mar).
const DISTANCIA_MAXIMA_DA_SEDE_KM = 50;

const consultaSchema = z.object({
  cidade: z.string().trim().min(2).max(80),
  uf: z.enum(UFS),
});

function resumoDoPreparo(preparo: PreparoDeCidade | undefined) {
  return preparo
    ? { estado: preparo.estado, etapa: preparo.etapa, pontos: preparo.pontos ?? null, erro: preparo.erro ?? null }
    : null;
}

// Busca municípios brasileiros pelo nome. Cada resultado diz se a cidade já tem dados
// ("disponivel") ou se precisa ser preparada antes (POST /cidades/preparar).
cidadesRouter.get("/buscar", limiteBuscaCidade, async (req: Request, res: Response) => {
  try {
    const consulta = buscaSchema.safeParse(req.query);

    if (!consulta.success) {
      return res.status(400).json({ erro: consulta.error.issues[0]?.message ?? "Busca inválida." });
    }

    const texto = consulta.data.q;
    const alvo = normalizarCidade(texto);
    let encontradas: (CidadeEncontrada & { codigoIbge?: number })[] = [];
    let semServidorDeMapas = false;

    try {
      encontradas = await buscarCidadesNoBrasil(texto);
    } catch (erro) {
      // Sem o serviço de busca, os municípios do IBGE no banco (e as cidades que já têm dados).
      console.error("Erro ao buscar cidades:", erro);
      semServidorDeMapas = true;
      encontradas = await buscarMunicipiosPorNome(texto);
    }

    const dados = await Promise.all(
      encontradas.map(async (c) => {
        const pontos = await pontosDaCidade(c.cidade, c.latitude, c.longitude);
        const codigoIbge = c.codigoIbge ?? (await procurarMunicipio(`${c.cidade}/${c.uf}`))[0]?.codigoIbge ?? null;

        return {
          ...c,
          codigoIbge,
          pontos,
          disponivel: pontos >= PONTOS_PARA_CIDADE_PRONTA,
          preparo: resumoDoPreparo(consultarPreparo(c.cidade, c.uf)),
        };
      }),
    );

    // Cidades já cadastradas que a busca externa não trouxe (ou que ela não achou).
    const jaListadas = new Set(dados.map((d) => normalizarCidade(d.cidade)));
    const locais = (await cidadesComPontos())
      .filter((c) => normalizarCidade(c.cidade).includes(alvo) && !jaListadas.has(normalizarCidade(c.cidade)))
      .map((c) => ({
        cidade: c.cidade,
        uf: null,
        latitude: null,
        longitude: null,
        codigoIbge: null,
        pontos: c.pontos,
        disponivel: true,
        preparo: null,
      }));

    return res.json({ dados: [...dados, ...locais], semServidorDeMapas });
  } catch (error) {
    console.error("Erro ao buscar cidades:", error);

    return res.status(500).json({ erro: "Erro interno ao buscar cidades." });
  }
});

// Município de quem usa o GPS: a sede mais próxima das coordenadas. É POST para que as
// coordenadas não apareçam na URL (e no log de acesso); elas não são gravadas.
cidadesRouter.post("/perto", limiteBuscaCidade, async (req: Request, res: Response) => {
  try {
    const pedido = pertoSchema.safeParse(req.body);

    if (!pedido.success) {
      return res.status(400).json({ erro: "Coordenadas inválidas." });
    }

    const municipio = await municipioMaisProximo(pedido.data.latitude, pedido.data.longitude);

    if (!municipio || municipio.distanciaKm > DISTANCIA_MAXIMA_DA_SEDE_KM) {
      return res.status(404).json({ erro: "Não encontramos um município do Brasil perto de você." });
    }

    const { distanciaKm: _distancia, ...dados } = municipio;

    return res.json(dados);
  } catch {
    // Sem o erro no log: ele pode carregar as coordenadas da consulta.
    console.error("Erro ao procurar o município mais próximo.");

    return res.status(500).json({ erro: "Erro interno ao procurar a sua cidade." });
  }
});

// Pede a preparação de uma cidade nova: baixa os lugares do OpenStreetMap em segundo plano.
cidadesRouter.post("/preparar", autenticar, limitePrepararCidade, async (req: Request, res: Response) => {
  try {
    const pedido = prepararSchema.safeParse(req.body);

    if (!pedido.success) {
      return res.status(400).json({ erro: "Cidade inválida. Escolha uma das opções da busca." });
    }

    const { cidade, uf, latitude, longitude } = pedido.data;
    const resultado = await prepararCidade(cidade, uf, latitude, longitude, req.usuario!.id);

    if (resultado.situacao === "ocupado") {
      return res.status(429).json({
        erro: "Outras cidades estão sendo preparadas agora. Tente novamente em alguns minutos.",
      });
    }

    if (resultado.situacao === "pronta") {
      return res.json({ estado: "pronta", pontos: resultado.pontos });
    }

    return res.status(202).json(resumoDoPreparo(resultado.preparo));
  } catch (error) {
    console.error("Erro ao preparar cidade:", error);

    return res.status(500).json({ erro: "Erro interno ao preparar a cidade." });
  }
});

// Acompanhamento do preparo (a tela consulta de poucos em poucos segundos).
cidadesRouter.get("/preparar", async (req: Request, res: Response) => {
  const consulta = consultaSchema.safeParse(req.query);

  if (!consulta.success) {
    return res.status(400).json({ erro: "Informe a cidade e a UF." });
  }

  const preparo = consultarPreparo(consulta.data.cidade, consulta.data.uf);

  if (!preparo) {
    return res.status(404).json({ erro: "Esta cidade não está sendo preparada." });
  }

  return res.json(resumoDoPreparo(preparo));
});

export default cidadesRouter;
