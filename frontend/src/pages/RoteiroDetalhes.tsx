import { useCallback, useEffect, useRef, useState, type FormEvent, type SyntheticEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import type { ItemRoteiro, PeriodoDoDia, ResumoOtimizacao, Roteiro, VersaoRoteiro } from "../types/roteiro";
import type { Ponto, RespostaPontos } from "../types/ponto";
import { extrairMensagemErro } from "../utils/erro";
import Icone from "../components/Icone";
import MapaRoteiroCarregavel from "../components/MapaRoteiroCarregavel";
import DetalhesDaParada from "../components/roteiro/DetalhesDaParada";
import PainelOrcamento from "../components/roteiro/PainelOrcamento";
import ChecklistDoRoteiro from "../components/roteiro/ChecklistDoRoteiro";
import NotasDoRoteiro from "../components/roteiro/NotasDoRoteiro";
import Colaboradores from "../components/roteiro/Colaboradores";
import SugestoesDeCidade from "../components/SugestoesDeCidade";
import { useCidadesDisponiveis } from "../services/cidades";
import { formatarDistancia, formatarMoeda } from "../utils/formatar";
import {
  agruparPorDia,
  cidadesDoDia,
  contarDias,
  corDoDia,
  descreverTrecho,
  MAX_DIAS,
  nomeDoItem,
  ROTULO_PERIODO,
  rotuloDoDia,
  totalDoDia,
} from "../utils/roteiro";

type TipoDaNovaParada = "ponto" | "atividade" | "pernoite";

function semAcento(texto: string): string {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

const ROTULO_MOTIVO_VERSAO: Record<string, string> = {
  edicao: "Dados do roteiro editados",
  adicionar_ponto: "Parada adicionada",
  adicionar_atividade: "Atividade adicionada",
  remover_ponto: "Parada removida",
  remover_atividade: "Atividade removida",
  reordenar: "Paradas reordenadas",
  organizar: "Paradas reorganizadas ou movidas de dia",
  otimizar: "Ordem otimizada pelo trajeto",
  antes_de_restaurar: "Antes de restaurar uma versão",
};

function formatarPeriodo(inicio: string | null, fim: string | null): string {
  const formatar = (valor: string) =>
    new Date(valor).toLocaleDateString("pt-BR", { timeZone: "UTC" });

  if (inicio && fim) return `${formatar(inicio)} a ${formatar(fim)}`;
  if (inicio) return `a partir de ${formatar(inicio)}`;
  if (fim) return `até ${formatar(fim)}`;
  return "";
}

function RoteiroDetalhes() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [roteiro, setRoteiro] = useState<Roteiro | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [pontosDisponiveis, setPontosDisponiveis] = useState<Ponto[]>([]);
  const [tipoNovaParada, setTipoNovaParada] = useState<TipoDaNovaParada>("ponto");
  // Cidade de onde vêm as sugestões de pontos (um roteiro pode passar por várias).
  const [cidadeDaBusca, setCidadeDaBusca] = useState("");
  const cidadeDaBuscaDefinida = useRef(false);
  const [tituloAtividade, setTituloAtividade] = useState("");
  const [periodoNovo, setPeriodoNovo] = useState<PeriodoDoDia | "">("");
  const cidadesDisponiveis = useCidadesDisponiveis();
  const [idPontoSelecionado, setIdPontoSelecionado] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviandoPonto, setEnviandoPonto] = useState(false);
  const [erroPonto, setErroPonto] = useState<string | null>(null);

  const [removendoId, setRemovendoId] = useState<number | null>(null);
  const [reordenando, setReordenando] = useState(false);

  // Dias vazios que a pessoa criou com "Adicionar dia" ainda não existem no servidor (um
  // dia só passa a existir quando recebe uma parada), então ficam guardados aqui.
  const [diasMinimos, setDiasMinimos] = useState(1);
  const [diaDoNovoPonto, setDiaDoNovoPonto] = useState("");
  const [otimizando, setOtimizando] = useState<number | "todos" | null>(null);
  const [resultadoOtimizacao, setResultadoOtimizacao] = useState<{ dia: number | null; texto: string } | null>(null);
  const [diaNoMapa, setDiaNoMapa] = useState<number | null>(null);

  const [editando, setEditando] = useState(false);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [descricaoEdicao, setDescricaoEdicao] = useState("");
  const [cidadeEdicao, setCidadeEdicao] = useState("");
  const [inicioEdicao, setInicioEdicao] = useState("");
  const [fimEdicao, setFimEdicao] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const [excluindo, setExcluindo] = useState(false);
  const [compartilhando, setCompartilhando] = useState(false);

  const [versoes, setVersoes] = useState<VersaoRoteiro[] | null>(null);
  const [restaurandoId, setRestaurandoId] = useState<number | null>(null);

  const buscarRoteiro = useCallback(async () => {
    try {
      setErro(null);

      const resposta = await api.get<Roteiro>(`/roteiros/${id}`);
      setRoteiro(resposta.data);
      // O histórico mostrado deixa de valer quando o roteiro muda: recarrega ao pedir de novo.
      setVersoes(null);
      setNomeEdicao(resposta.data.nome);
      setDescricaoEdicao(resposta.data.descricao ?? "");
      setCidadeEdicao(resposta.data.cidade ?? "");
      setInicioEdicao(resposta.data.dataInicio ? resposta.data.dataInicio.slice(0, 10) : "");
      setFimEdicao(resposta.data.dataFim ? resposta.data.dataFim.slice(0, 10) : "");
    } catch (err) {
      console.error(err);
      setErro("Não foi possível carregar este roteiro.");
    } finally {
      setCarregando(false);
    }
  }, [id]);

  const roteiroCarregado = roteiro !== null;

  // A busca de pontos começa pela cidade da última parada (ou a do roteiro).
  useEffect(() => {
    if (!roteiro || cidadeDaBuscaDefinida.current) return;

    cidadeDaBuscaDefinida.current = true;
    const ultimaComCidade = [...roteiro.itens].reverse().find((item) => item.ponto);
    setCidadeDaBusca(ultimaComCidade?.ponto?.cidade ?? roteiro.cidade ?? "");
  }, [roteiro]);

  // Só busca quando o texto corresponde a uma cidade com pontos (sem acento e maiúsculas).
  const cidadeEscolhida =
    cidadesDisponiveis.find((c) => semAcento(c.cidade) === semAcento(cidadeDaBusca))?.cidade ?? null;
  const categoriaDaBusca = tipoNovaParada === "pernoite" ? "Hospedagem" : null;

  // Sugere os pontos da cidade escolhida (ou, sem cidade, os mais relevantes); para a pernoite, as hospedagens.
  useEffect(() => {
    if (!roteiroCarregado) return;

    async function buscarPontos() {
      try {
        const resposta = await api.get<RespostaPontos>("/pontos", {
          params: {
            limite: 100,
            ...(cidadeEscolhida ? { cidade: cidadeEscolhida } : {}),
            ...(categoriaDaBusca ? { categoria: categoriaDaBusca } : {}),
          },
        });
        setPontosDisponiveis(resposta.data.dados);
      } catch (err) {
        console.error(err);
      }
    }

    buscarPontos();
  }, [roteiroCarregado, cidadeEscolhida, categoriaDaBusca]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial ao montar o componente, padrao recomendado pelo React
    buscarRoteiro();
  }, [buscarRoteiro]);

  // Traz, a cada 15 s, o que os outros participantes alteraram (e quem entrou no roteiro). Só
  // pergunta com a aba visível, só troca o conteúdo se algo mudou e não mexe nos formulários
  // que estão sendo preenchidos. Roda também para o dono sem convidados: ele não tem como
  // saber de antemão quando alguém aceita um convite.
  const roteiroCarregadoParaAtualizar = roteiro !== null;

  useEffect(() => {
    if (!roteiroCarregadoParaAtualizar) return;

    const temporizador = window.setInterval(async () => {
      if (document.visibilityState !== "visible") return;

      try {
        const resposta = await api.get<Roteiro>(`/roteiros/${id}`);

        setRoteiro((atual) => (atual && JSON.stringify(atual) === JSON.stringify(resposta.data) ? atual : resposta.data));
      } catch {
        // Falha momentânea de rede (ou acesso removido): a próxima rodada tenta de novo.
      }
    }, 15_000);

    return () => window.clearInterval(temporizador);
  }, [roteiroCarregadoParaAtualizar, id]);

  const carregarVersoes = useCallback(async () => {
    try {
      const resposta = await api.get<{ dados: VersaoRoteiro[] }>(`/roteiros/${id}/versoes`);
      setVersoes(resposta.data.dados);
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível carregar o histórico de versões."));
    }
  }, [id]);

  async function aoRestaurarVersao(versaoId: number) {
    const confirmar = window.confirm(
      "Restaurar esta versão? O estado atual será guardado no histórico antes da troca.",
    );

    if (!confirmar) return;

    try {
      setRestaurandoId(versaoId);

      await api.post(`/roteiros/${id}/versoes/${versaoId}/restaurar`);

      await buscarRoteiro();
      await carregarVersoes();
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível restaurar esta versão."));
    } finally {
      setRestaurandoId(null);
    }
  }

  // Ponto cadastrado, atividade livre ("Rolê pelo centro") ou onde dormir (hotel do banco ou texto).
  async function aoAdicionarParada(evento: SyntheticEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroPonto(null);

    const titulo = tituloAtividade.trim();

    if (tipoNovaParada === "ponto" && !idPontoSelecionado) {
      setErroPonto("Selecione um ponto para adicionar.");
      return;
    }

    if (tipoNovaParada === "atividade" && !titulo) {
      setErroPonto("Escreva o que vai ser feito, como “Rolê pelo centro histórico”.");
      return;
    }

    if (tipoNovaParada === "pernoite" && !idPontoSelecionado && !titulo) {
      setErroPonto("Escolha uma hospedagem da lista ou escreva onde vai dormir.");
      return;
    }

    try {
      setEnviandoPonto(true);

      const payload: Record<string, unknown> =
        idPontoSelecionado && tipoNovaParada !== "atividade" ? { idPonto: Number(idPontoSelecionado) } : { titulo };

      if (tipoNovaParada === "pernoite") payload.pernoite = true;
      if (periodoNovo && tipoNovaParada !== "pernoite") payload.periodo = periodoNovo;
      if (diaDoNovoPonto) payload.dia = Number(diaDoNovoPonto);
      if (observacao.trim() !== "") payload.observacao = observacao.trim();

      await api.post(`/roteiros/${id}/itens`, payload);

      setIdPontoSelecionado("");
      setTituloAtividade("");
      setPeriodoNovo("");
      setObservacao("");

      await buscarRoteiro();
    } catch (err) {
      console.error(err);
      setErroPonto(extrairMensagemErro(err, "Não foi possível adicionar ao roteiro."));
    } finally {
      setEnviandoPonto(false);
    }
  }

  async function aoRemoverParada(item: ItemRoteiro) {
    const confirmar = window.confirm(`Remover “${nomeDoItem(item)}” do roteiro?`);

    if (!confirmar) {
      return;
    }

    try {
      setRemovendoId(item.id);

      await api.delete(`/roteiros/${id}/paradas/${item.id}`);

      await buscarRoteiro();
    } catch (err) {
      console.error(err);
      alert("Não foi possível remover do roteiro.");
    } finally {
      setRemovendoId(null);
    }
  }

  const meuPapel = roteiro?.meuPapel ?? "DONO";
  const ehDono = meuPapel === "DONO";
  const podeEditar = meuPapel !== "LEITOR";

  const itens: ItemRoteiro[] = roteiro?.itens ?? [];
  const totalDias = roteiro ? contarDias(roteiro.itens, roteiro.dataInicio, roteiro.dataFim, diasMinimos) : 1;
  const dias = agruparPorDia(itens, totalDias);
  const itensEmOrdem = dias.flatMap((grupo) => grupo.itens);

  // Envia ao servidor a lista completa de paradas, na ordem e com os dias desejados.
  async function organizar(lista: { id: number; dia: number }[], mensagemDeErro: string) {
    try {
      setReordenando(true);
      setResultadoOtimizacao(null);

      await api.put(`/roteiros/${id}/itens/organizar`, { itens: lista });

      await buscarRoteiro();
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, mensagemDeErro));
    } finally {
      setReordenando(false);
    }
  }

  function aoMoverItem(dia: number, indiceNoDia: number, direcao: -1 | 1) {
    const doDia = dias[dia - 1].itens;
    const destino = indiceNoDia + direcao;

    if (destino < 0 || destino >= doDia.length) {
      return;
    }

    const trocado = [...doDia];
    [trocado[indiceNoDia], trocado[destino]] = [trocado[destino], trocado[indiceNoDia]];

    const lista = dias.flatMap((grupo) =>
      (grupo.dia === dia ? trocado : grupo.itens).map((item) => ({ id: item.id, dia: grupo.dia })),
    );

    organizar(lista, "Não foi possível reordenar os pontos.");
  }

  function aoMoverParaDia(item: ItemRoteiro, novoDia: number) {
    if (novoDia === item.dia) return;

    // Vai para o fim do dia escolhido.
    const lista = [
      ...itensEmOrdem.filter((outro) => outro.id !== item.id).map((outro) => ({ id: outro.id, dia: outro.dia })),
      { id: item.id, dia: novoDia },
    ];

    organizar(lista, "Não foi possível mover a parada de dia.");
  }

  async function aoOtimizar(dia: number | "todos") {
    try {
      setOtimizando(dia);
      setResultadoOtimizacao(null);

      const resposta = await api.post<ResumoOtimizacao>(
        `/roteiros/${id}/otimizar`,
        dia === "todos" ? {} : { dia },
      );

      const economia = resposta.data.dias.reduce((soma, d) => soma + (d.metrosAntes - d.metrosDepois), 0);

      setResultadoOtimizacao({
        dia: dia === "todos" ? null : dia,
        texto: resposta.data.alterado
          ? `Ordem otimizada: o percurso ficou ${formatarDistancia(economia)} mais curto.`
          : "As paradas já estão na ordem de menor percurso.",
      });

      await buscarRoteiro();
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível otimizar a ordem das paradas."));
    } finally {
      setOtimizando(null);
    }
  }

  async function aoSalvarEdicao(evento: FormEvent) {
    evento.preventDefault();

    try {
      setSalvandoEdicao(true);

      await api.put(`/roteiros/${id}`, {
        nome: nomeEdicao.trim(),
        descricao: descricaoEdicao.trim() || undefined,
        cidade: cidadeEdicao.trim() || undefined,
        dataInicio: inicioEdicao || undefined,
        dataFim: fimEdicao || undefined,
      });

      setEditando(false);
      await buscarRoteiro();
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível salvar as alterações do roteiro."));
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function aoExcluirRoteiro() {
    const confirmar = window.confirm(
      "Tem certeza que deseja excluir este roteiro? Essa ação não pode ser desfeita.",
    );

    if (!confirmar) return;

    try {
      setExcluindo(true);
      await api.delete(`/roteiros/${id}`);
      navigate("/roteiros", { replace: true });
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível excluir o roteiro."));
      setExcluindo(false);
    }
  }

  async function aoAlternarCompartilhamento() {
    if (!roteiro) return;

    try {
      setCompartilhando(true);

      const resposta = await api.patch<Pick<Roteiro, "publico" | "slugPublico">>(
        `/roteiros/${id}/compartilhar`,
        { publico: !roteiro.publico },
      );

      setRoteiro((atual) => (atual ? { ...atual, ...resposta.data } : atual));
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível alterar o compartilhamento do roteiro."));
    } finally {
      setCompartilhando(false);
    }
  }

  async function aoCopiarLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      alert("Link copiado!");
    } catch {
      // Clipboard indisponível (ex.: permissão negada) — o link já fica visível na tela.
    }
  }

  const linkPublico =
    roteiro?.publico && roteiro.slugPublico
      ? `${window.location.origin}/roteiros/publico/${roteiro.slugPublico}`
      : null;

  return (
    <div className="container page">
      <Link to="/roteiros" className="back-link">
        <Icone nome="voltar" />
        Voltar para meus roteiros
      </Link>

      {carregando && <p className="loading">Carregando roteiro...</p>}

      {erro && (
        <div className="alert alert--error" role="alert">
          <Icone nome="alerta" />
          <p>{erro}</p>
        </div>
      )}

      {!carregando && !erro && roteiro && (
        <div className="stack stack--lg">
          {editando ? (
            <form onSubmit={aoSalvarEdicao} className="card form-card form">
              <h2>Editar roteiro</h2>

              <div className="form-grid">
                <label className="field">
                  <span>Nome *</span>
                  <input
                    type="text"
                    maxLength={120}
                    value={nomeEdicao}
                    onChange={(e) => setNomeEdicao(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Cidade</span>
                  <input
                    type="text"
                    maxLength={120}
                    value={cidadeEdicao}
                    onChange={(e) => setCidadeEdicao(e.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Data de início</span>
                  <input type="date" value={inicioEdicao} onChange={(e) => setInicioEdicao(e.target.value)} />
                </label>

                <label className="field">
                  <span>Data de fim</span>
                  <input type="date" value={fimEdicao} onChange={(e) => setFimEdicao(e.target.value)} />
                </label>

                <label className="field field--full">
                  <span>Descrição</span>
                  <textarea
                    maxLength={1000}
                    rows={3}
                    value={descricaoEdicao}
                    onChange={(e) => setDescricaoEdicao(e.target.value)}
                  />
                </label>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn--primary" disabled={salvandoEdicao}>
                  {salvandoEdicao ? "Salvando..." : "Salvar alterações"}
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setEditando(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <header className="card card--pad roteiro-cabecalho">
              <div className="stack stack--sm">
                <div className="cluster">
                  {roteiro.publico ? (
                    <span className="badge badge--success">
                      <Icone nome="globo" />
                      Público
                    </span>
                  ) : (
                    <span className="badge">Privado</span>
                  )}
                  {!ehDono && (
                    <span className="badge badge--accent">
                      <Icone nome="compartilhar" />
                      De {roteiro.usuario?.nome} · você é {meuPapel === "EDITOR" ? "editor" : "leitor"}
                    </span>
                  )}
                  {ehDono && (roteiro.colaboradores?.length ?? 0) > 0 && (
                    <span className="badge badge--primary">
                      {(roteiro.colaboradores?.length ?? 0) + 1} participantes
                    </span>
                  )}
                </div>

                <h1>{roteiro.nome}</h1>

                <div className="roteiro-meta">
                  {(roteiro.cidades?.length ?? 0) > 0 ? (
                    <span>
                      <Icone nome="pin" />
                      {roteiro.cidades!.join(" → ")}
                    </span>
                  ) : (
                    roteiro.cidade && (
                      <span>
                        <Icone nome="pin" />
                        {roteiro.cidade}
                      </span>
                    )
                  )}
                  {(roteiro.dataInicio || roteiro.dataFim) && (
                    <span>
                      <Icone nome="calendario" />
                      {formatarPeriodo(roteiro.dataInicio, roteiro.dataFim)}
                    </span>
                  )}
                  <span>
                    <Icone nome="lista" />
                    {itens.length} {itens.length === 1 ? "parada" : "paradas"} · {totalDias}{" "}
                    {totalDias === 1 ? "dia" : "dias"}
                  </span>
                </div>

                {roteiro.descricao && <p className="muted">{roteiro.descricao}</p>}
              </div>

              <div className="cluster">
                {podeEditar && (
                  <button type="button" className="btn btn--outline btn--sm" onClick={() => setEditando(true)}>
                    <Icone nome="editar" />
                    Editar
                  </button>
                )}

                {ehDono && (
                  <>
                    <button
                      type="button"
                      className="btn btn--outline btn--sm"
                      onClick={aoAlternarCompartilhamento}
                      disabled={compartilhando}
                    >
                      <Icone nome="compartilhar" />
                      {roteiro.publico ? "Parar de compartilhar" : "Compartilhar"}
                    </button>

                    <button
                      type="button"
                      className="btn btn--danger-outline btn--sm"
                      onClick={aoExcluirRoteiro}
                      disabled={excluindo}
                    >
                      <Icone nome="lixeira" />
                      {excluindo ? "Excluindo..." : "Excluir"}
                    </button>
                  </>
                )}
              </div>

              {linkPublico && ehDono && (
                <div className="alert alert--info roteiro-link">
                  <Icone nome="link" />
                  <div>
                    <strong>Link público</strong>
                    <br />
                    <a href={linkPublico} target="_blank" rel="noreferrer">
                      {linkPublico}
                    </a>
                  </div>
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={() => aoCopiarLink(linkPublico)}
                  >
                    Copiar
                  </button>
                </div>
              )}
            </header>
          )}

          {itens.some((item) => item.ponto && item.ponto.latitude !== null) && (
            <section aria-labelledby="titulo-mapa">
              <div className="cluster spread">
                <h2 id="titulo-mapa" className="section__title">
                  Mapa do roteiro
                </h2>

                {totalDias > 1 && (
                  <div className="segmented" role="group" aria-label="Dia no mapa">
                    <button type="button" aria-pressed={diaNoMapa === null} onClick={() => setDiaNoMapa(null)}>
                      Todos
                    </button>
                    {dias.map((grupo) => (
                      <button
                        key={grupo.dia}
                        type="button"
                        aria-pressed={diaNoMapa === grupo.dia}
                        onClick={() => setDiaNoMapa(grupo.dia)}
                      >
                        Dia {grupo.dia}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mapa-wrap">
                <MapaRoteiroCarregavel
                  dia={diaNoMapa}
                  paradas={dias.flatMap((grupo) =>
                    // O número no mapa é o mesmo da lista; atividades sem lugar não aparecem.
                    grupo.itens.flatMap((item, indice) =>
                      item.ponto
                        ? [
                            {
                              idPonto: item.ponto.id,
                              nome: item.ponto.nome,
                              categoria: item.ponto.categoria,
                              dia: grupo.dia,
                              numero: item.pernoite ? 999 : indice + 1,
                              pernoite: item.pernoite,
                              latitude: item.ponto.latitude,
                              longitude: item.ponto.longitude,
                            },
                          ]
                        : [],
                    ),
                  )}
                />
              </div>
              <p className="muted small" style={{ marginTop: "0.5rem" }}>
                A linha liga as paradas de cada dia na ordem do roteiro. Tempos e distâncias são estimativas em linha reta.
              </p>
            </section>
          )}

          <section aria-labelledby="titulo-paradas">
            <div className="cluster spread">
              <h2 id="titulo-paradas" className="section__title">
                Dia a dia
              </h2>

              <div className="cluster">
                {podeEditar && itens.length > 2 && (
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={() => aoOtimizar("todos")}
                    disabled={otimizando !== null || reordenando}
                  >
                    <Icone nome="brilho" />
                    {otimizando === "todos" ? "Otimizando..." : "Otimizar todos os dias"}
                  </button>
                )}
                {podeEditar && (
                  <button
                    type="button"
                    className="btn btn--outline btn--sm"
                    onClick={() => setDiasMinimos(Math.min(MAX_DIAS, totalDias + 1))}
                    disabled={totalDias >= MAX_DIAS}
                  >
                    <Icone nome="mais" />
                    Adicionar dia
                  </button>
                )}
              </div>
            </div>

            {resultadoOtimizacao && resultadoOtimizacao.dia === null && (
              <div className="alert alert--info" role="status" style={{ marginTop: "0.75rem" }}>
                <Icone nome="info" />
                <p>{resultadoOtimizacao.texto}</p>
              </div>
            )}

            {itens.length === 0 && (
              <div className="empty">
                <div className="empty__icon">
                  <Icone nome="pin" />
                </div>
                <p className="empty__title">Este roteiro ainda não tem paradas</p>
                <p>Use o formulário abaixo para adicionar pontos, atividades e onde dormir.</p>
              </div>
            )}

            <div className="stack stack--lg">
              {dias.map((grupo) => {
                const total = totalDoDia(grupo.itens);
                const paradas = grupo.itens.filter((item) => !item.pernoite);
                const pernoite = grupo.itens.find((item) => item.pernoite);
                const cidades = cidadesDoDia(grupo.itens);
                const viagem = roteiro?.viagensEntreDias?.find((v) => v.dia === grupo.dia);

                return (
                  <div key={grupo.dia} className="dia" style={{ ["--cor-dia" as string]: corDoDia(grupo.dia) }}>
                    <div className="dia__cabecalho">
                      <h3 className="dia__titulo">
                        {rotuloDoDia(grupo.dia, roteiro?.dataInicio ?? null)}
                        {cidades.length > 0 && <span className="dia__cidades"> · {cidades.join(", ")}</span>}
                      </h3>

                      <span className="muted small">
                        {paradas.length} {paradas.length === 1 ? "parada" : "paradas"}
                        {total.metros > 0 && ` · ${descreverTrecho(total)} de deslocamento`}
                        {roteiro?.orcamento?.porDia[grupo.dia] !== undefined &&
                          ` · ${formatarMoeda(roteiro.orcamento.porDia[grupo.dia])} previstos`}
                      </span>

                      {podeEditar && grupo.itens.length > 2 && (
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => aoOtimizar(grupo.dia)}
                          disabled={otimizando !== null || reordenando}
                        >
                          <Icone nome="brilho" />
                          {otimizando === grupo.dia ? "Otimizando..." : "Otimizar ordem"}
                        </button>
                      )}
                    </div>

                    {resultadoOtimizacao?.dia === grupo.dia && (
                      <div className="alert alert--info" role="status">
                        <Icone nome="info" />
                        <p>{resultadoOtimizacao.texto}</p>
                      </div>
                    )}

                    {viagem && (
                      <p className="dia__viagem">
                        <Icone nome="avancar" />
                        Viagem de {viagem.de} para {viagem.para}: {descreverTrecho(viagem)} pela estrada (estimativa)
                      </p>
                    )}

                    {paradas.length === 0 ? (
                      <p className="dia__vazio muted">Nenhuma parada neste dia. Adicione abaixo ou mova uma de outro dia.</p>
                    ) : (
                      <ol className="paradas">
                        {paradas.map((item, indice) => (
                          <li key={item.id} className={item.ponto ? "parada" : "parada parada--atividade"}>
                            <span className="parada__num" style={{ background: corDoDia(grupo.dia) }}>
                              {indice + 1}
                            </span>

                            <div className="card parada__card">
                              {item.deslocamento && (
                                <p className="parada__trecho">
                                  <Icone nome="avancar" />
                                  {descreverTrecho(item.deslocamento)} desde a parada anterior
                                </p>
                              )}

                              <div className="parada__topo">
                                <div className="stack stack--sm">
                                  <h3>
                                    {item.ponto ? <Link to={`/pontos/${item.ponto.id}`}>{item.ponto.nome}</Link> : item.titulo}
                                  </h3>
                                  <div className="cluster">
                                    {item.periodo && <span className="badge badge--accent">{ROTULO_PERIODO[item.periodo]}</span>}
                                    {item.ponto ? (
                                      <>
                                        <span className="badge badge--primary">{item.ponto.categoria}</span>
                                        <span className="muted small">{item.ponto.cidade}</span>
                                      </>
                                    ) : (
                                      <span className="badge">Atividade livre</span>
                                    )}
                                  </div>
                                </div>

                                {podeEditar && (
                                <div className="cluster">
                                  <button
                                    type="button"
                                    className="btn btn--ghost btn--icon"
                                    onClick={() => aoMoverItem(grupo.dia, indice, -1)}
                                    disabled={indice === 0 || reordenando}
                                    title="Mover para cima"
                                    aria-label="Mover para cima"
                                  >
                                    <Icone nome="cima" />
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn--ghost btn--icon"
                                    onClick={() => aoMoverItem(grupo.dia, indice, 1)}
                                    disabled={indice === paradas.length - 1 || reordenando}
                                    title="Mover para baixo"
                                    aria-label="Mover para baixo"
                                  >
                                    <Icone nome="baixo" />
                                  </button>
                                  {totalDias > 1 && (
                                    <select
                                      className="parada__dia"
                                      value={grupo.dia}
                                      onChange={(e) => aoMoverParaDia(item, Number(e.target.value))}
                                      disabled={reordenando}
                                      aria-label={`Dia de ${nomeDoItem(item)}`}
                                    >
                                      {dias.map((opcao) => (
                                        <option key={opcao.dia} value={opcao.dia}>
                                          Dia {opcao.dia}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                  <button
                                    type="button"
                                    className="btn btn--danger-outline btn--sm"
                                    onClick={() => aoRemoverParada(item)}
                                    disabled={removendoId === item.id}
                                  >
                                    {removendoId === item.id ? "Removendo..." : "Remover"}
                                  </button>
                                </div>
                                )}
                              </div>

                              <DetalhesDaParada
                                idRoteiro={roteiro!.id}
                                item={item}
                                aoSalvar={buscarRoteiro}
                                somenteLeitura={!podeEditar}
                              />
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}

                    {pernoite && (
                      <div className="card pernoite">
                        <div className="parada__topo">
                          <div className="stack stack--sm">
                            <span className="pernoite__rotulo">Onde dormir</span>
                            <h3>
                              {pernoite.ponto ? (
                                <Link to={`/pontos/${pernoite.ponto.id}`}>{pernoite.ponto.nome}</Link>
                              ) : (
                                pernoite.titulo
                              )}
                            </h3>
                            {pernoite.ponto && <span className="muted small">{pernoite.ponto.cidade}</span>}
                          </div>
                          {podeEditar && (
                            <button
                              type="button"
                              className="btn btn--danger-outline btn--sm"
                              onClick={() => aoRemoverParada(pernoite)}
                              disabled={removendoId === pernoite.id}
                            >
                              {removendoId === pernoite.id ? "Removendo..." : "Remover"}
                            </button>
                          )}
                        </div>
                        <DetalhesDaParada
                          idRoteiro={roteiro!.id}
                          item={pernoite}
                          aoSalvar={buscarRoteiro}
                          somenteLeitura={!podeEditar}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {podeEditar && (
          <section aria-labelledby="titulo-adicionar">
            <h2 id="titulo-adicionar" className="section__title">
              Adicionar ao roteiro
            </h2>

            <form onSubmit={aoAdicionarParada} className="card form-card form">
              <div className="segmented" role="group" aria-label="O que adicionar">
                {(
                  [
                    ["ponto", "Ponto turístico"],
                    ["atividade", "Atividade livre"],
                    ["pernoite", "Onde dormir"],
                  ] as const
                ).map(([tipo, rotulo]) => (
                  <button
                    key={tipo}
                    type="button"
                    aria-pressed={tipoNovaParada === tipo}
                    onClick={() => {
                      setTipoNovaParada(tipo);
                      setIdPontoSelecionado("");
                      setErroPonto(null);
                    }}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>

              <div className="form-grid">
                {tipoNovaParada !== "atividade" && (
                  <label className="field">
                    <span>Cidade</span>
                    <input
                      type="text"
                      value={cidadeDaBusca}
                      onChange={(e) => {
                        setCidadeDaBusca(e.target.value);
                        setIdPontoSelecionado("");
                      }}
                      list="cidades-da-parada"
                      placeholder="Todas as cidades"
                    />
                    <SugestoesDeCidade id="cidades-da-parada" />
                    {cidadeDaBusca.trim() !== "" && !cidadeEscolhida && cidadesDisponiveis.length > 0 && (
                      <span className="field__hint">Ainda não há pontos nessa cidade. Escolha uma da lista.</span>
                    )}
                  </label>
                )}

                {tipoNovaParada !== "atividade" && (
                  <label className="field">
                    <span>{tipoNovaParada === "pernoite" ? "Hospedagem" : "Ponto turístico *"}</span>
                    <select
                      value={idPontoSelecionado}
                      onChange={(e) => setIdPontoSelecionado(e.target.value)}
                      aria-label={tipoNovaParada === "pernoite" ? "Hospedagem" : "Ponto turístico *"}
                    >
                      <option value="">
                        {tipoNovaParada === "pernoite" ? "Outro lugar (escrever abaixo)" : "Selecione um ponto"}
                      </option>
                      {pontosDisponiveis.map((ponto) => (
                        <option key={ponto.id} value={ponto.id}>
                          {ponto.nome} - {ponto.cidade}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {(tipoNovaParada === "atividade" || (tipoNovaParada === "pernoite" && !idPontoSelecionado)) && (
                  <label className="field">
                    <span>{tipoNovaParada === "atividade" ? "O que fazer *" : "Onde vai dormir"}</span>
                    <input
                      type="text"
                      maxLength={160}
                      value={tituloAtividade}
                      onChange={(e) => setTituloAtividade(e.target.value)}
                      placeholder={
                        tipoNovaParada === "atividade" ? "Ex.: Rolê pelo centro histórico, Dia livre" : "Ex.: Acampamento na serra"
                      }
                    />
                  </label>
                )}

                {tipoNovaParada !== "pernoite" && (
                  <label className="field">
                    <span>
                      Período <span className="field__optional">(opcional)</span>
                    </span>
                    <select value={periodoNovo} onChange={(e) => setPeriodoNovo(e.target.value as PeriodoDoDia | "")}>
                      <option value="">Sem período</option>
                      {(Object.keys(ROTULO_PERIODO) as PeriodoDoDia[]).map((periodo) => (
                        <option key={periodo} value={periodo}>
                          {ROTULO_PERIODO[periodo]}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {totalDias > 1 && (
                  <label className="field">
                    <span>Dia</span>
                    <select
                      value={diaDoNovoPonto}
                      onChange={(e) => setDiaDoNovoPonto(e.target.value)}
                      aria-label="Dia da nova parada"
                    >
                      <option value="">Dia {itens.reduce((maior, item) => Math.max(maior, item.dia), 1)} (o da última parada)</option>
                      {dias.map((grupo) => (
                        <option key={grupo.dia} value={grupo.dia}>
                          {rotuloDoDia(grupo.dia, roteiro?.dataInicio ?? null)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="field">
                  <span>
                    Observação <span className="field__optional">(opcional)</span>
                  </span>
                  <input
                    type="text"
                    maxLength={500}
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                  />
                </label>
              </div>

              {erroPonto && (
                <div className="alert alert--error" role="alert">
                  <p>{erroPonto}</p>
                </div>
              )}

              <div className="form-actions">
                <button type="submit" className="btn btn--primary" disabled={enviandoPonto}>
                  <Icone nome="mais" />
                  {enviandoPonto
                    ? "Adicionando..."
                    : tipoNovaParada === "ponto"
                      ? "Adicionar ponto"
                      : tipoNovaParada === "atividade"
                        ? "Adicionar atividade"
                        : "Definir onde dormir"}
                </button>
              </div>
            </form>
          </section>
          )}

          {roteiro && roteiro.orcamento && (
            <section aria-labelledby="titulo-planejamento">
              <h2 id="titulo-planejamento" className="section__title">
                Planejamento da viagem
              </h2>

              <div className="planejamento">
                <PainelOrcamento
                  key={`orc-${roteiro.orcamento.orcamentoCentavos ?? "sem"}`}
                  idRoteiro={roteiro.id}
                  resumo={roteiro.orcamento}
                  dataInicio={roteiro.dataInicio}
                  aoSalvar={buscarRoteiro}
                  somenteLeitura={!podeEditar}
                />
                <ChecklistDoRoteiro
                  idRoteiro={roteiro.id}
                  itens={roteiro.checklist ?? []}
                  aoMudar={buscarRoteiro}
                  somenteLeitura={!podeEditar}
                />
                <NotasDoRoteiro
                  idRoteiro={roteiro.id}
                  notas={roteiro.notas ?? null}
                  aoSalvar={buscarRoteiro}
                  somenteLeitura={!podeEditar}
                />
              </div>
            </section>
          )}

          {roteiro && (
            <Colaboradores
              roteiro={roteiro}
              aoMudar={buscarRoteiro}
              aoSair={() => navigate("/roteiros", { replace: true })}
            />
          )}

          <section aria-labelledby="titulo-historico">
            <h2 id="titulo-historico" className="section__title">
              Histórico de versões
            </h2>

            {versoes === null ? (
              <div>
                <button type="button" className="btn btn--outline" onClick={carregarVersoes}>
                  <Icone nome="historico" />
                  Ver histórico
                </button>
              </div>
            ) : versoes.length === 0 ? (
              <p className="muted">Nenhuma alteração registrada ainda.</p>
            ) : (
              <div className="card card--pad stack stack--sm">
                {versoes.map((versao) => (
                  <div key={versao.id} className="versao">
                    <div>
                      <p>
                        <strong>{ROTULO_MOTIVO_VERSAO[versao.motivo] ?? versao.motivo}</strong>
                      </p>
                      <p className="muted small">
                        {new Date(versao.dataCriacao).toLocaleString("pt-BR")}
                        {versao.autor ? ` · por ${versao.autor}` : ""} · {versao.dados.itens.length}{" "}
                        {versao.dados.itens.length === 1 ? "parada" : "paradas"} · &ldquo;{versao.dados.nome}&rdquo;
                      </p>
                    </div>
                    {podeEditar && (
                      <button
                        type="button"
                        className="btn btn--outline btn--sm"
                        onClick={() => aoRestaurarVersao(versao.id)}
                        disabled={restaurandoId === versao.id}
                      >
                        {restaurandoId === versao.id ? "Restaurando..." : "Restaurar"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default RoteiroDetalhes;
