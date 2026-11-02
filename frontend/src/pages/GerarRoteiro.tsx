import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import type { Roteiro, RespostaRecomendacao } from "../types/roteiro";
import { useAuth } from "../context/useAuth";
import { extrairMensagemErro } from "../utils/erro";
import { CATEGORIAS_PONTOS, iconeDaCategoria } from "../constants/categorias";
import EscolherCidade from "../components/EscolherCidade";
import Icone from "../components/Icone";
import SugestoesDeCidade from "../components/SugestoesDeCidade";
import CaixaViagemDeCarro from "../components/viagem/CaixaViagemDeCarro";
import DecisaoDeChegada from "../components/viagem/DecisaoDeChegada";
import PernoiteNaEstrada from "../components/viagem/PernoiteNaEstrada";
import TrechoNaEstrada from "../components/viagem/TrechoNaEstrada";
import MapaRoteiroCarregavel from "../components/MapaRoteiroCarregavel";
import type { ParadaNoMapa } from "../components/MapaRoteiro";
import { useCidadesDisponiveis, type CidadeDaBusca } from "../services/cidades";
import type { DecisaoDaPerna, EscolhaDaNoite } from "../types/viagem";
import {
  chaveDaNoite,
  diasDaViagem,
  formatarDirecao,
  formatarKm,
  lerNumero,
  noitesParaSalvar,
  pedidoDaViagem,
  type OpcoesViagemDeCarro,
} from "../utils/viagem";
import { formatarDistancia, formatarDuracao, formatarHora } from "../utils/formatar";
import { corDoDia } from "../utils/roteiro";

// Uma parte da viagem: a cidade e quantos dias ficar nela ("Joinville, 2 dias"). O código IBGE
// vem quando a cidade foi escolhida na busca (a viagem de carro precisa do município certo).
interface Etapa {
  cidade: string;
  dias: number;
  codigoIbge?: number;
}

const MAX_ETAPAS = 6;
const MAX_DIAS_GERADOS = 14;

function GerarRoteiro() {
  const { usuario } = useAuth();
  const navigate = useNavigate();

  const [etapas, setEtapas] = useState<Etapa[]>([{ cidade: usuario?.cidadeBase ?? "", dias: 1 }]);
  const [horasDisponiveis, setHorasDisponiveis] = useState("6");
  const [inicio, setInicio] = useState("");
  const [interesses, setInteresses] = useState<string[]>(usuario?.interesses ?? []);
  const [localizacao, setLocalizacao] = useState<{ latitude: number; longitude: number } | null>(null);
  const [buscandoLocalizacao, setBuscandoLocalizacao] = useState(false);

  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespostaRecomendacao | null>(null);

  const [viagem, setViagem] = useState<OpcoesViagemDeCarro>({
    ativa: false,
    origem: usuario?.municipioBase ?? null,
    kmPorDia: "500",
    horasPorDia: "",
    comVolta: false,
    consumo: usuario?.consumoKmPorLitro != null ? String(usuario.consumoKmPorLitro).replace(".", ",") : "",
    preco: "",
  });
  // Trocas de pernoite e decisões de chegada feitas sobre o resultado (refazem a geração).
  const [escolhas, setEscolhas] = useState<EscolhaDaNoite[]>([]);
  const [decisoes, setDecisoes] = useState<DecisaoDaPerna[]>([]);
  // Hotel escolhido em cada noite de estrada ("perna-noite" → idOsm).
  const [hoteis, setHoteis] = useState<Map<string, string>>(new Map());
  // O servidor recalculou a viagem ao salvar e ela mudou (409): oferece gerar de novo.
  const [rotaMudou, setRotaMudou] = useState(false);

  const [salvando, setSalvando] = useState(false);
  const [escolhendoCidade, setEscolhendoCidade] = useState(false);
  const cidadesDisponiveis = useCidadesDisponiveis();

  const totalDias = etapas.reduce((soma, etapa) => soma + etapa.dias, 0);

  function alternarInteresse(categoria: string) {
    setInteresses((atual) =>
      atual.includes(categoria) ? atual.filter((c) => c !== categoria) : [...atual, categoria],
    );
  }

  function atualizarEtapa(indice: number, mudanca: Partial<Etapa>) {
    // Digitar outra cidade desfaz o município escolhido na busca.
    const semCodigo = mudanca.cidade !== undefined ? { codigoIbge: undefined } : {};

    setEtapas((atual) => atual.map((etapa, i) => (i === indice ? { ...etapa, ...semCodigo, ...mudanca } : etapa)));
  }

  /** A cidade escolhida na busca vai para a primeira etapa vazia; se não houver, vira uma nova etapa. */
  function aoEscolherCidade(nome: string, municipio?: CidadeDaBusca) {
    const codigoIbge = municipio?.codigoIbge ?? undefined;

    setEtapas((atual) => {
      const vazia = atual.findIndex((etapa) => !etapa.cidade.trim());

      if (vazia >= 0) {
        return atual.map((etapa, i) => (i === vazia ? { ...etapa, cidade: nome, codigoIbge } : etapa));
      }

      return atual.length >= MAX_ETAPAS ? atual : [...atual, { cidade: nome, dias: 1, codigoIbge }];
    });
    setEscolhendoCidade(false);
  }

  function aoUsarLocalizacao() {
    if (!navigator.geolocation) {
      setErro("Seu navegador não suporta geolocalização.");
      return;
    }

    setBuscandoLocalizacao(true);

    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        setLocalizacao({ latitude: posicao.coords.latitude, longitude: posicao.coords.longitude });
        setBuscandoLocalizacao(false);
      },
      () => {
        setErro("Não foi possível obter sua localização. Verifique a permissão do navegador.");
        setBuscandoLocalizacao(false);
      },
    );
  }

  async function aoGerar(evento: FormEvent) {
    evento.preventDefault();
    // Um pedido novo começa sem as trocas feitas no resultado anterior.
    setEscolhas([]);
    setDecisoes([]);
    setHoteis(new Map());
    await gerar([], []);
  }

  /** Troca a cidade de uma noite: as escolhas e os hotéis das noites seguintes da perna caem. */
  async function trocarCidade(perna: number, noite: number, codigoIbge: number) {
    const novas = [...escolhas.filter((e) => e.perna !== perna || e.noite < noite), { perna, noite, codigoIbge }];

    setEscolhas(novas);
    setHoteis(
      (atual) =>
        new Map(
          [...atual].filter(([chave]) => {
            const [p, n] = chave.split("-").map(Number);
            return p !== perna || n < noite;
          }),
        ),
    );
    await gerar(novas, decisoes);
  }

  async function decidir(perna: number, esticar: boolean) {
    const novas = [...decisoes.filter((d) => d.perna !== perna), { perna, esticar }];

    setDecisoes(novas);
    await gerar(escolhas, novas);
  }

  function escolherHotel(perna: number, noite: number, idOsm: string) {
    setHoteis((atual) => {
      const novo = new Map(atual);

      if (idOsm) novo.set(chaveDaNoite(perna, noite), idOsm);
      else novo.delete(chaveDaNoite(perna, noite));

      return novo;
    });
  }

  async function gerar(escolhasAtuais: EscolhaDaNoite[], decisoesAtuais: DecisaoDaPerna[]) {
    setErro(null);
    setRotaMudou(false);

    const preenchidas = etapas.map((etapa) => ({ ...etapa, cidade: etapa.cidade.trim() }));

    if (preenchidas.some((etapa) => !etapa.cidade)) {
      setErro(preenchidas.length === 1 ? "Informe a cidade do roteiro." : "Informe a cidade de cada etapa da viagem.");
      return;
    }

    if (totalDias > MAX_DIAS_GERADOS) {
      setErro(`O roteiro gerado tem no máximo ${MAX_DIAS_GERADOS} dias.`);
      return;
    }

    if (viagem.ativa) {
      const km = lerNumero(viagem.kmPorDia);

      if (!viagem.origem) {
        setErro("Informe de onde você sai.");
        return;
      }

      if (km === null || km < 150 || km > 1000) {
        setErro("O alvo por dia vai de 150 a 1.000 km.");
        return;
      }
    }

    try {
      setGerando(true);

      const resposta = await api.post<RespostaRecomendacao>("/roteiros/gerar", {
        etapas: preenchidas.map(({ cidade, dias, codigoIbge }) => ({ cidade, dias, ...(codigoIbge ? { codigoIbge } : {}) })),
        viagemDeCarro: pedidoDaViagem(viagem, escolhasAtuais, decisoesAtuais),
        horasDisponiveis: Number(horasDisponiveis),
        interesses,
        ...(inicio ? { dataHoraInicio: new Date(inicio).toISOString() } : {}),
        ...(localizacao ?? {}),
      });

      setResultado(resposta.data);

      if (resposta.data.pontos.length === 0 && !resposta.data.viagemDeCarro?.pernas.length) {
        setErro(
          resposta.data.avisos[0] ??
            "Nenhum ponto publicado e aberto foi encontrado para essa cidade nesse horário.",
        );
      }
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível gerar um roteiro agora. Tente novamente."));
    } finally {
      setGerando(false);
    }
  }

  async function aoSalvarComoRoteiro() {
    const planejada = resultado?.viagemDeCarro ?? null;

    if (!resultado || (resultado.pontos.length === 0 && !planejada?.pernas.length)) return;

    const cidades = planejada ? planejada.etapas.map((e) => e.cidade) : [...new Set(resultado.dias.map((d) => d.cidade))];
    const totalDeDias = Math.max(1, ...diasDaViagem(resultado).map((d) => d.dia));
    const diaInicial = inicio ? inicio.slice(0, 10) : null;
    const nome = planejada
      ? `Viagem de carro: ${planejada.origem.cidade} → ${cidades.join(" → ")}`
      : cidades.length === 1
        ? `Roteiro em ${cidades[0]}`
        : `Roteiro: ${cidades.join(" → ")}`;

    try {
      setSalvando(true);

      // O roteiro e todas as paradas são gravados juntos: ou fica completo, ou nada é criado.
      const roteiro = await api.post<Roteiro>("/roteiros", {
        nome,
        ...(cidades.length === 1 ? { cidade: cidades[0] } : {}),
        ...(diaInicial
          ? {
              dataInicio: diaInicial,
              dataFim: new Date(Date.parse(diaInicial) + (totalDeDias - 1) * 86_400_000).toISOString().slice(0, 10),
            }
          : {}),
        pontos: resultado.pontos.map((ponto) => ({ idPonto: ponto.id, dia: ponto.dia })),
        ...(planejada
          ? {
              viagemDeCarro: {
                origem: planejada.origem.codigoIbge,
                etapas: planejada.etapas.map(({ codigoIbge, dias }) => ({ codigoIbge, dias })),
                horasDisponiveis: Number(horasDisponiveis),
                kmPorDia: planejada.kmPorDia,
                ...(planejada.horasPorDia !== null ? { horasPorDia: planejada.horasPorDia } : {}),
                comVolta: planejada.comVolta,
                ...(planejada.consumoKmPorLitro !== null ? { consumoKmPorLitro: planejada.consumoKmPorLitro } : {}),
                ...(planejada.precoLitroCentavos !== null ? { precoLitroCentavos: planejada.precoLitroCentavos } : {}),
                escolhas,
                decisoes,
                noites: noitesParaSalvar(resultado, hoteis),
              },
            }
          : {}),
      });

      navigate(`/roteiros/${roteiro.data.id}`);
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível salvar o roteiro sugerido."));
      setRotaMudou((err as { response?: { status?: number } }).response?.status === 409);
    } finally {
      setSalvando(false);
    }
  }

  const pontos = resultado?.pontos ?? [];
  const planejada = resultado?.viagemDeCarro ?? null;
  const diasDoResultado = resultado ? diasDaViagem(resultado) : [];
  const avisos = [...(resultado?.avisos ?? []), ...(planejada?.avisos ?? [])];
  const temResultado = !!resultado && (pontos.length > 0 || (planejada?.pernas.length ?? 0) > 0);
  const nomeDoPernoite = (c: { cidade: string; uf: string | null }) => (c.uf ? `${c.cidade}/${c.uf}` : c.cidade);
  const estradas = (planejada?.pernas ?? []).flatMap((perna) =>
    perna.trechos.map((t) => ({ dia: t.dia, tracado: t.tracado, pernoite: t.pernoite ? nomeDoPernoite(t.pernoite) : null })),
  );
  const paradasNoMapa: ParadaNoMapa[] = pontos.map((ponto) => ({
    idPonto: ponto.id,
    nome: ponto.nome,
    categoria: ponto.categoria,
    dia: ponto.dia,
    numero: pontos.filter((p) => p.dia === ponto.dia).indexOf(ponto) + 1,
    latitude: ponto.latitude,
    longitude: ponto.longitude,
  }));

  return (
    <div className="container container--narrow page">
      <Link to="/roteiros" className="back-link">
        <Icone nome="voltar" />
        Voltar para meus roteiros
      </Link>

      <div className="page-head">
        <div className="page-head__text">
          <h1>Gerar roteiro sugerido</h1>
          <p className="page-head__sub">
            Nosso motor sugere pontos com base nos seus interesses, no tempo disponível, nos horários de
            funcionamento e na distância entre os locais. A viagem pode passar por várias cidades.
          </p>
        </div>
      </div>

      <form onSubmit={aoGerar} className="card form-card form">
        <fieldset className="field">
          <legend className="field__legenda">Etapas da viagem</legend>

          <ol className="etapas">
            {etapas.map((etapa, indice) => (
              <li key={indice} className="etapa">
                <label className="field">
                  <span>{indice === 0 ? "Cidade *" : `Depois, cidade ${indice + 1}`}</span>
                  <input
                    type="text"
                    value={etapa.cidade}
                    onChange={(e) => atualizarEtapa(indice, { cidade: e.target.value })}
                    maxLength={120}
                    list="cidades-do-roteiro"
                  />
                </label>

                <label className="field etapa__dias">
                  <span>{indice === 0 ? "Dias" : `Dias na cidade ${indice + 1}`}</span>
                  <input
                    type="number"
                    min={1}
                    max={MAX_DIAS_GERADOS}
                    value={etapa.dias}
                    onChange={(e) => atualizarEtapa(indice, { dias: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </label>

                {etapas.length > 1 && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    onClick={() => setEtapas((atual) => atual.filter((_, i) => i !== indice))}
                    title="Tirar esta cidade"
                    aria-label={`Tirar a cidade ${indice + 1}`}
                  >
                    <Icone nome="lixeira" />
                  </button>
                )}
              </li>
            ))}
          </ol>

          <SugestoesDeCidade id="cidades-do-roteiro" />

          <div className="cluster">
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={() => setEtapas((atual) => [...atual, { cidade: "", dias: 1 }])}
              disabled={etapas.length >= MAX_ETAPAS}
            >
              <Icone nome="mais" />
              Adicionar outra cidade
            </button>
            <button
              type="button"
              className="btn btn--outline btn--sm"
              onClick={() => setEscolhendoCidade((aberto) => !aberto)}
              aria-expanded={escolhendoCidade}
            >
              <Icone nome="globo" />
              Buscar outra cidade do Brasil
            </button>
            <span className="field__hint">
              {totalDias} {totalDias === 1 ? "dia" : "dias"} no total
              {cidadesDisponiveis.length > 0 &&
                ` · com pontos cadastrados: ${cidadesDisponiveis.map((c) => c.cidade).join(", ")}`}
              .
            </span>
          </div>
        </fieldset>

        {escolhendoCidade && (
          <EscolherCidade
            aoEscolher={aoEscolherCidade}
            aoFechar={() => setEscolhendoCidade(false)}
            rotuloDeEscolha="Usar no roteiro"
          />
        )}

        <CaixaViagemDeCarro valor={viagem} aoMudar={setViagem} />

        <div className="form-grid">
          <label className="field">
            <span>Tempo disponível por dia (horas)</span>
            <input
              type="number"
              min={1}
              max={24}
              step={0.5}
              value={horasDisponiveis}
              onChange={(e) => setHorasDisponiveis(e.target.value)}
            />
          </label>

          <label className="field">
            <span>
              Início do passeio <span className="field__optional">(opcional)</span>
            </span>
            <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            <span className="field__hint">Sem data, começamos no próximo horário comercial.</span>
          </label>

          <div className="field">
            <span>
              Ponto de partida <span className="field__optional">(opcional)</span>
            </span>
            <div>
              <button
                type="button"
                className={localizacao ? "btn btn--primary" : "btn btn--outline"}
                onClick={aoUsarLocalizacao}
                disabled={buscandoLocalizacao}
              >
                <Icone nome={localizacao ? "check" : "localizar"} />
                {buscandoLocalizacao ? "Localizando..." : localizacao ? "Partindo de onde estou" : "Usar minha localização"}
              </button>
            </div>
          </div>
        </div>

        <fieldset className="field">
          <legend className="field__legenda">Interesses</legend>
          <div className="chips">
            {CATEGORIAS_PONTOS.map((categoria) => (
              <button
                key={categoria}
                type="button"
                className="chip"
                aria-pressed={interesses.includes(categoria)}
                onClick={() => alternarInteresse(categoria)}
              >
                <Icone nome={iconeDaCategoria(categoria)} />
                {categoria}
              </button>
            ))}
          </div>
        </fieldset>

        {erro && (
          <div className="alert alert--error" role="alert">
            <p>{erro}</p>
          </div>
        )}

        <div className="form-actions">
          <button type="submit" disabled={gerando} className="btn btn--primary btn--lg">
            <Icone nome="brilho" />
            {gerando ? (viagem.ativa ? "Calculando a rota…" : "Gerando...") : "Gerar roteiro"}
          </button>
        </div>
      </form>

      {resultado && temResultado && (
        <section className="section">
          <h2 className="section__title">Roteiro sugerido</h2>
          <p className="muted small">Começando às {formatarHora(resultado.inicio)}.</p>

          {resultado.fallbackUsado && (
            <div className="alert alert--warning" role="status" style={{ marginBottom: "1rem" }}>
              <Icone nome="alerta" />
              <p>
                O motor de recomendação não pôde considerar interesses e horários agora; esta é uma
                sugestão simplificada pelos pontos mais próximos.
              </p>
            </div>
          )}

          {avisos.length > 0 && (
            <div className="alert alert--info" role="status" style={{ marginBottom: "1rem" }}>
              <Icone nome="info" />
              <ul className="relatorio__lista">
                {avisos.map((aviso) => (
                  <li key={aviso}>{aviso}</li>
                ))}
              </ul>
            </div>
          )}

          {planejada && planejada.pernas.length > 0 && (
            <div className="viagem-carro__mapa">
              <MapaRoteiroCarregavel paradas={paradasNoMapa} estradas={estradas} altura={360} />
              <p className="muted small">Rotas: OSRM · dados © colaboradores do OpenStreetMap</p>
            </div>
          )}

          <div className="stack stack--lg">
            {diasDoResultado.map(({ dia: numero, tipo, trechos, diaGerado }) => {
              const doDia = pontos.filter((ponto) => ponto.dia === numero);
              const daEstrada = trechos.find((t) => t.trecho.ocupaODia);
              const chegada = trechos.find((t) => !t.trecho.ocupaODia && !t.trecho.noFimDoDia);
              const volta = trechos.find((t) => t.trecho.noFimDoDia);
              const decisoesDoDia = trechos.filter((t) => t.trecho.noite === null && t.perna.decisao);

              return (
                <div
                  key={numero}
                  className={tipo === "ESTRADA" ? "dia dia--estrada" : "dia"}
                  style={{ ["--cor-dia" as string]: corDoDia(numero) }}
                >
                  {tipo === "ESTRADA" && daEstrada ? (
                    <div className="dia__cabecalho">
                      <h3 className="dia__titulo">
                        Dia {numero} · Estrada · {daEstrada.trecho.de} → {daEstrada.trecho.para} ·{" "}
                        {formatarKm(daEstrada.trecho.metros)} · {formatarDirecao(daEstrada.trecho.segundos)}
                      </h3>
                      <p className="muted small">Tempo de direção, sem paradas.</p>
                    </div>
                  ) : (
                    diasDoResultado.length > 1 &&
                    diaGerado && (
                      <div className="dia__cabecalho">
                        <h3 className="dia__titulo">
                          Dia {numero}
                          <span className="dia__cidades"> · {diaGerado.cidade}</span>
                        </h3>
                      </div>
                    )
                  )}

                  {decisoesDoDia.map(({ perna }) => (
                    <DecisaoDeChegada
                      key={`decisao-${perna.perna}`}
                      perna={perna}
                      decidindo={gerando}
                      aoDecidir={(esticar) => decidir(perna.perna, esticar)}
                    />
                  ))}

                  {chegada && (
                    <TrechoNaEstrada
                      de={chegada.trecho.de}
                      para={chegada.trecho.para}
                      metros={chegada.trecho.metros}
                      segundos={chegada.trecho.segundos}
                      noDia="chegada"
                    />
                  )}

                  {!chegada && diaGerado?.viagem && (
                    <p className="dia__viagem">
                      <Icone nome="avancar" />
                      Viagem de {diaGerado.viagem.de} para {diaGerado.cidade}: ≈ {formatarDuracao(diaGerado.viagem.minutos)} ·{" "}
                      {formatarDistancia(diaGerado.viagem.metros)} pela estrada; o passeio começa às {formatarHora(diaGerado.inicio)}.
                    </p>
                  )}

                  {tipo === "ESTRADA" ? null : doDia.length === 0 ? (
                    <p className="dia__vazio muted">Dia de estrada: não sobra tempo para visitas depois da viagem.</p>
                  ) : (
                    <ol className="paradas">
                      {doDia.map((ponto, indice) => (
                        <li key={ponto.id} className="parada">
                          <span className="parada__num" style={{ background: corDoDia(numero) }}>
                            {indice + 1}
                          </span>

                          <div className="card parada__card">
                            <div className="stack stack--sm">
                              <h3>
                                <Link to={`/pontos/${ponto.id}`}>{ponto.nome}</Link>
                              </h3>
                              <div className="cluster">
                                <span className="badge badge--primary">{ponto.categoria}</span>
                                <span className="muted small">
                                  {ponto.cidade}
                                  {ponto.distanciaMetros !== null && ` · ${formatarDistancia(ponto.distanciaMetros)}`}
                                </span>
                              </div>

                              {!resultado.fallbackUsado && (
                                <p className="parada__horario">
                                  <Icone nome="relogio" />
                                  {formatarHora(ponto.chegadaEstimada)} – {formatarHora(ponto.saidaEstimada)}
                                  <span className="muted small">
                                    {" "}
                                    · visita de {formatarDuracao(ponto.duracaoVisitaMin)}
                                    {ponto.deslocamentoMin > 0 && `, ${formatarDuracao(ponto.deslocamentoMin)} de deslocamento`}
                                    {ponto.esperaMin > 0 && `, ${formatarDuracao(ponto.esperaMin)} de espera até abrir`}
                                  </span>
                                </p>
                              )}

                              {ponto.horarioFuncionamento && (
                                <p className="muted small">
                                  Funcionamento: {ponto.horarioFuncionamento}
                                  {ponto.horarioDoGoogle && " (segundo o Google Maps)"}
                                </p>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}

                  {daEstrada?.trecho.pernoite && daEstrada.trecho.noite !== null && (
                    <PernoiteNaEstrada
                      pernoite={daEstrada.trecho.pernoite}
                      alternativas={daEstrada.trecho.alternativas}
                      hotel={hoteis.get(chaveDaNoite(daEstrada.perna.perna, daEstrada.trecho.noite)) ?? ""}
                      aoEscolherHotel={(idOsm) => escolherHotel(daEstrada.perna.perna, daEstrada.trecho.noite!, idOsm)}
                      aoTrocarCidade={(codigoIbge) => trocarCidade(daEstrada.perna.perna, daEstrada.trecho.noite!, codigoIbge)}
                      trocando={gerando}
                    />
                  )}

                  {volta && (
                    <TrechoNaEstrada
                      de={volta.trecho.de}
                      para={volta.trecho.para}
                      metros={volta.trecho.metros}
                      segundos={volta.trecho.segundos}
                      noDia="volta"
                    />
                  )}
                </div>
              );
            })}
          </div>

          {rotaMudou && (
            <button type="button" className="btn btn--outline" onClick={() => gerar(escolhas, decisoes)} disabled={gerando}>
              Gerar de novo
            </button>
          )}

          <button
            type="button"
            onClick={aoSalvarComoRoteiro}
            disabled={salvando}
            className="btn btn--accent btn--lg btn--block"
            style={{ marginTop: "1.5rem" }}
          >
            {salvando ? "Salvando..." : "Salvar como meu roteiro"}
          </button>
        </section>
      )}
    </div>
  );
}

export default GerarRoteiro;
