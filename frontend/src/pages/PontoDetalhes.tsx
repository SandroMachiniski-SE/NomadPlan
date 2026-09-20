import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../services/api";
import type { Ponto, RespostaAvaliacoes } from "../types/ponto";
import type { RespostaRoteiros } from "../types/roteiro";
import { useAuth } from "../context/useAuth";
import { extrairMensagemErro } from "../utils/erro";
import MapaPontos from "../components/MapaPontos";
import Icone from "../components/Icone";
import Estrelas from "../components/Estrelas";
import { iconeDaCategoria } from "../constants/categorias";

const ROTULO_STATUS: Record<string, string> = {
  RASCUNHO: "Rascunho — ainda não publicado",
  PENDENTE_VERIFICACAO: "Em análise pela moderação",
  REJEITADO: "Rejeitado pela moderação",
};

function PontoDetalhes() {
  const { id } = useParams<{ id: string }>();
  const { usuario, autenticado } = useAuth();

  const [ponto, setPonto] = useState<Ponto | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [mostrarSugestao, setMostrarSugestao] = useState(false);
  const [campoSugestao, setCampoSugestao] = useState("horarioFuncionamento");
  const [valorSugestao, setValorSugestao] = useState("");
  const [mensagemSugestao, setMensagemSugestao] = useState("");
  const [enviandoSugestao, setEnviandoSugestao] = useState(false);
  const [sugestaoEnviada, setSugestaoEnviada] = useState(false);

  const [solicitandoSelo, setSolicitandoSelo] = useState(false);
  const [seloSolicitado, setSeloSolicitado] = useState(false);

  const [roteiros, setRoteiros] = useState<{ id: number; nome: string }[] | null>(null);
  const [roteiroSelecionado, setRoteiroSelecionado] = useState("");
  const [adicionandoRoteiro, setAdicionandoRoteiro] = useState(false);
  const [adicionadoRoteiro, setAdicionadoRoteiro] = useState(false);

  const [avaliacoes, setAvaliacoes] = useState<RespostaAvaliacoes | null>(null);
  const [notaAvaliacao, setNotaAvaliacao] = useState(5);
  const [comentarioAvaliacao, setComentarioAvaliacao] = useState("");
  const [enviandoAvaliacao, setEnviandoAvaliacao] = useState(false);
  const [erroAvaliacao, setErroAvaliacao] = useState<string | null>(null);
  const [avaliacaoEnviada, setAvaliacaoEnviada] = useState<string | null>(null);

  const buscarPonto = useCallback(async () => {
    if (!id) {
      setErro("Ponto turístico inválido.");
      setCarregando(false);
      return;
    }

    try {
      const resposta = await api.get<Ponto>(`/pontos/${id}`);
      setPonto(resposta.data);
    } catch (error) {
      console.error("Erro ao buscar detalhes:", error);
      setErro("Não foi possível carregar este ponto turístico.");
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial ao montar o componente
    buscarPonto();
  }, [buscarPonto]);

  useEffect(() => {
    if (!autenticado || !ponto || ponto.status !== "PUBLICADO") {
      return;
    }

    async function buscarRoteiros() {
      try {
        const resposta = await api.get<RespostaRoteiros>("/roteiros");
        setRoteiros(resposta.data.dados.map((r) => ({ id: r.id, nome: r.nome })));
      } catch (err) {
        console.error(err);
      }
    }

    buscarRoteiros();
  }, [autenticado, ponto]);

  const buscarAvaliacoes = useCallback(async () => {
    if (!id) return;

    try {
      const resposta = await api.get<RespostaAvaliacoes>(`/pontos/${id}/avaliacoes`);
      setAvaliacoes(resposta.data);
    } catch (err) {
      console.error(err);
    }
  }, [id]);

  useEffect(() => {
    if (ponto?.status === "PUBLICADO") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch disparado quando o ponto termina de carregar
      buscarAvaliacoes();
    }
  }, [ponto, buscarAvaliacoes]);

  async function aoEnviarAvaliacao(evento: FormEvent) {
    evento.preventDefault();
    setErroAvaliacao(null);

    try {
      setEnviandoAvaliacao(true);

      const resposta = await api.post<{ retidaParaModeracao: boolean }>(
        `/pontos/${id}/avaliacoes`,
        { nota: notaAvaliacao, comentario: comentarioAvaliacao.trim() || undefined },
      );

      setAvaliacaoEnviada(
        resposta.data.retidaParaModeracao
          ? "Sua avaliação foi recebida e está em análise antes de ser publicada."
          : "Sua avaliação foi publicada. Obrigado!",
      );
      setComentarioAvaliacao("");
      await buscarAvaliacoes();
    } catch (err) {
      console.error(err);
      setErroAvaliacao(extrairMensagemErro(err, "Não foi possível enviar sua avaliação."));
    } finally {
      setEnviandoAvaliacao(false);
    }
  }

  async function aoAdicionarAoRoteiro() {
    if (!roteiroSelecionado || !id) return;

    try {
      setAdicionandoRoteiro(true);
      await api.post(`/roteiros/${roteiroSelecionado}/itens`, { idPonto: Number(id) });
      setAdicionadoRoteiro(true);
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível adicionar este ponto ao roteiro."));
    } finally {
      setAdicionandoRoteiro(false);
    }
  }

  async function aoEnviarSugestao(evento: FormEvent) {
    evento.preventDefault();

    if (!valorSugestao.trim() || !id) {
      return;
    }

    try {
      setEnviandoSugestao(true);

      await api.post(`/pontos/${id}/sugestoes`, {
        camposPropostos: { [campoSugestao]: valorSugestao.trim() },
        mensagem: mensagemSugestao.trim() || undefined,
      });

      setSugestaoEnviada(true);
      setMostrarSugestao(false);
      setValorSugestao("");
      setMensagemSugestao("");
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível enviar sua sugestão."));
    } finally {
      setEnviandoSugestao(false);
    }
  }

  async function aoSolicitarSelo() {
    if (!id) return;

    const comprovacao = window.prompt(
      "Descreva ou cole um link que comprove a autenticidade deste ponto (opcional):",
    );

    try {
      setSolicitandoSelo(true);
      await api.post(`/pontos/${id}/solicitar-verificacao`, {
        comprovacao: comprovacao?.trim() || undefined,
      });
      setSeloSolicitado(true);
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível solicitar o selo de verificação."));
    } finally {
      setSolicitandoSelo(false);
    }
  }

  const ehResponsavel = Boolean(usuario && ponto && usuario.id === ponto.idResponsavel);

  return (
    <div className="container page">
      <Link to="/" className="back-link">
        <Icone nome="voltar" />
        Voltar para a busca
      </Link>

      {carregando && <p className="loading">Carregando detalhes...</p>}

      {erro && (
        <div className="alert alert--error" role="alert">
          <Icone nome="alerta" />
          <p>{erro}</p>
        </div>
      )}

      {ponto && (
        <article className="stack stack--lg">
          {ponto.status !== "PUBLICADO" && (
            <div className={ponto.status === "REJEITADO" ? "alert alert--error" : "alert alert--warning"}>
              <Icone nome="info" />
              <p>
                {ROTULO_STATUS[ponto.status] ?? ponto.status}
                {ponto.status === "REJEITADO" && ponto.motivoRejeicao ? `: ${ponto.motivoRejeicao}` : ""}
              </p>
            </div>
          )}

          <div className="ponto-layout">
            <div className="ponto-principal stack stack--lg">
              <div className="ponto-capa" data-cat={ponto.categoria}>
                {ponto.imagemUrl ? (
                  <img src={`${api.defaults.baseURL}${ponto.imagemUrl}`} alt={ponto.nome} />
                ) : (
                  <Icone nome={iconeDaCategoria(ponto.categoria)} className="ponto-capa__icone" />
                )}
              </div>

              <header className="stack stack--sm">
                <div className="cluster">
                  <span className="badge badge--primary">{ponto.categoria}</span>
                  {ponto.seloVerificado && (
                    <span className="badge badge--success">
                      <Icone nome="verificado" />
                      Local verificado
                    </span>
                  )}
                  {avaliacoes?.media != null && (
                    <span className="badge badge--accent">
                      <Icone nome="estrela" className="icon--fill" />
                      {avaliacoes.media.toFixed(1)}
                    </span>
                  )}
                </div>

                <h1>{ponto.nome}</h1>

                <p className="ponto-cidade">
                  <Icone nome="pin" />
                  {ponto.cidade}
                </p>
              </header>

              {ponto.descricao && <p className="ponto-descricao">{ponto.descricao}</p>}

              {ponto.latitude !== null && ponto.longitude !== null && (
                <section className="stack stack--sm" aria-label="Localização no mapa">
                  <div className="mapa-wrap">
                    <MapaPontos pontos={[ponto]} altura={300} />
                  </div>
                  <div>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${ponto.latitude},${ponto.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn--outline btn--sm"
                    >
                      <Icone nome="localizar" />
                      Como chegar
                    </a>
                  </div>
                </section>
              )}
            </div>

            <aside className="ponto-lateral stack">
              <section className="card card--pad">
                <h2 className="ponto-lateral__titulo">Informações</h2>

                <ul className="meta-list">
                  <li className="meta-item">
                    <Icone nome="pin" />
                    <div>
                      <span className="meta-item__label">Endereço</span>
                      <span className="meta-item__value">{ponto.endereco ?? "Não informado"}</span>
                    </div>
                  </li>

                  <li className="meta-item">
                    <Icone nome="relogio" />
                    <div>
                      <span className="meta-item__label">Horário de funcionamento</span>
                      <span className="meta-item__value">
                        {ponto.horarioFuncionamento ?? "Não informado"}
                      </span>
                    </div>
                  </li>

                  <li className="meta-item">
                    <Icone nome="dinheiro" />
                    <div>
                      <span className="meta-item__label">Faixa de preço</span>
                      <span className="meta-item__value">{ponto.faixaPreco ?? "Não informado"}</span>
                    </div>
                  </li>

                  <li className="meta-item">
                    <Icone nome="acessibilidade" />
                    <div>
                      <span className="meta-item__label">Acessibilidade</span>
                      <span className="meta-item__value">{ponto.acessibilidade ?? "Não informado"}</span>
                    </div>
                  </li>

                  {ponto.siteOficial && (
                    <li className="meta-item">
                      <Icone nome="globo" />
                      <div>
                        <span className="meta-item__label">Site oficial</span>
                        <span className="meta-item__value">
                          <a href={ponto.siteOficial} target="_blank" rel="noreferrer">
                            Acessar site
                          </a>
                        </span>
                      </div>
                    </li>
                  )}

                  {ponto.telefoneContato && (
                    <li className="meta-item">
                      <Icone nome="telefone" />
                      <div>
                        <span className="meta-item__label">Telefone</span>
                        <span className="meta-item__value">{ponto.telefoneContato}</span>
                      </div>
                    </li>
                  )}
                </ul>
              </section>

              {autenticado && ponto.status === "PUBLICADO" && (
                <section className="card card--pad stack stack--sm">
                  <h2 className="ponto-lateral__titulo">Adicionar a um roteiro</h2>

                  {adicionadoRoteiro ? (
                    <div className="alert alert--success" role="status">
                      <Icone nome="check" />
                      <p>Ponto adicionado ao roteiro.</p>
                    </div>
                  ) : roteiros && roteiros.length > 0 ? (
                    <div className="stack stack--sm">
                      <select
                        value={roteiroSelecionado}
                        onChange={(e) => setRoteiroSelecionado(e.target.value)}
                        aria-label="Roteiro"
                      >
                        <option value="">Selecione um roteiro</option>
                        {roteiros.map((roteiro) => (
                          <option key={roteiro.id} value={roteiro.id}>
                            {roteiro.nome}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn--primary btn--block"
                        onClick={aoAdicionarAoRoteiro}
                        disabled={!roteiroSelecionado || adicionandoRoteiro}
                      >
                        <Icone nome="mais" />
                        {adicionandoRoteiro ? "Adicionando..." : "Adicionar ao roteiro"}
                      </button>
                    </div>
                  ) : roteiros && roteiros.length === 0 ? (
                    <p className="muted">
                      Você ainda não tem roteiros. <Link to="/roteiros/novo">Criar um roteiro</Link>
                    </p>
                  ) : null}
                </section>
              )}

              {ehResponsavel && ponto.status === "PUBLICADO" && !ponto.seloVerificado && (
                <button
                  type="button"
                  className="btn btn--outline btn--block"
                  onClick={aoSolicitarSelo}
                  disabled={solicitandoSelo || seloSolicitado}
                >
                  <Icone nome="verificado" />
                  {seloSolicitado ? "Solicitação enviada" : "Solicitar selo de verificação"}
                </button>
              )}

              {autenticado && !ehResponsavel && ponto.status === "PUBLICADO" && (
                <section className="card card--pad stack stack--sm">
                  <h2 className="ponto-lateral__titulo">Dados desatualizados?</h2>

                  {sugestaoEnviada ? (
                    <div className="alert alert--success" role="status">
                      <Icone nome="check" />
                      <p>Sugestão enviada. Obrigado por ajudar a manter os dados atualizados!</p>
                    </div>
                  ) : mostrarSugestao ? (
                    <form onSubmit={aoEnviarSugestao} className="form">
                      <label className="field">
                        <span>Campo</span>
                        <select value={campoSugestao} onChange={(e) => setCampoSugestao(e.target.value)}>
                          <option value="horarioFuncionamento">Horário de funcionamento</option>
                          <option value="telefoneContato">Telefone</option>
                          <option value="siteOficial">Site oficial</option>
                          <option value="faixaPreco">Faixa de preço</option>
                          <option value="acessibilidade">Acessibilidade</option>
                          <option value="descricao">Descrição</option>
                        </select>
                      </label>

                      <label className="field">
                        <span>Novo valor</span>
                        <input
                          type="text"
                          value={valorSugestao}
                          onChange={(e) => setValorSugestao(e.target.value)}
                          maxLength={2000}
                        />
                      </label>

                      <label className="field">
                        <span>
                          Mensagem para a moderação <span className="field__optional">(opcional)</span>
                        </span>
                        <input
                          type="text"
                          value={mensagemSugestao}
                          onChange={(e) => setMensagemSugestao(e.target.value)}
                          maxLength={500}
                        />
                      </label>

                      <div className="form-actions">
                        <button type="submit" className="btn btn--primary" disabled={enviandoSugestao}>
                          {enviandoSugestao ? "Enviando..." : "Enviar sugestão"}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => setMostrarSugestao(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <p className="muted small">
                        Encontrou alguma informação errada? Sugira uma correção para a moderação.
                      </p>
                      <button
                        type="button"
                        className="btn btn--outline btn--block"
                        onClick={() => setMostrarSugestao(true)}
                      >
                        <Icone nome="editar" />
                        Sugerir edição
                      </button>
                    </>
                  )}
                </section>
              )}
            </aside>
          </div>

          {ponto.status === "PUBLICADO" && (
            <section className="avaliacoes" aria-labelledby="titulo-avaliacoes">
              <div className="avaliacoes__topo">
                <h2 id="titulo-avaliacoes">Avaliações</h2>

                {avaliacoes && avaliacoes.total > 0 && avaliacoes.media !== null && (
                  <div className="avaliacoes__resumo">
                    <span className="avaliacoes__nota">{avaliacoes.media.toFixed(1)}</span>
                    <div>
                      <Estrelas nota={avaliacoes.media} tamanho="grande" />
                      <p className="muted small">
                        {avaliacoes.total} {avaliacoes.total === 1 ? "avaliação" : "avaliações"}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {avaliacoes && avaliacoes.total === 0 && (
                <div className="empty empty--compacto">
                  <p>Ainda não há avaliações para este ponto.</p>
                </div>
              )}

              {avaliacoes && avaliacoes.dados.length > 0 && (
                <div className="grid-cards avaliacoes__lista">
                  {avaliacoes.dados.map((avaliacao) => (
                    <div key={avaliacao.id} className="card card--pad avaliacao">
                      <div className="avaliacao__autor">
                        <span className="user-chip__avatar" aria-hidden="true">
                          {(avaliacao.autor?.nome ?? "?").trim().charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <strong>{avaliacao.autor?.nome}</strong>
                          <div>
                            <Estrelas nota={avaliacao.nota} />
                          </div>
                        </div>
                      </div>
                      {avaliacao.comentario && <p className="muted">{avaliacao.comentario}</p>}
                    </div>
                  ))}
                </div>
              )}

              {autenticado && (
                <div className="avaliacoes__form card form-card">
                  <h3>Deixe sua avaliação</h3>

                  {avaliacaoEnviada ? (
                    <div className="alert alert--success" role="status">
                      <Icone nome="check" />
                      <p>{avaliacaoEnviada}</p>
                    </div>
                  ) : (
                    <form onSubmit={aoEnviarAvaliacao} className="form">
                      <fieldset className="field">
                        <legend className="field__legenda">Sua nota</legend>
                        <div className="seletor-nota" role="radiogroup" aria-label="Sua nota">
                          {[1, 2, 3, 4, 5].map((valor) => (
                            <button
                              key={valor}
                              type="button"
                              role="radio"
                              aria-checked={notaAvaliacao === valor}
                              aria-label={`${valor} ${valor === 1 ? "estrela" : "estrelas"}`}
                              className={valor <= notaAvaliacao ? "seletor-nota__estrela ativa" : "seletor-nota__estrela"}
                              onClick={() => setNotaAvaliacao(valor)}
                            >
                              <Icone nome="estrela" className="icon--fill" />
                            </button>
                          ))}
                        </div>
                      </fieldset>

                      <label className="field">
                        <span>
                          Comentário <span className="field__optional">(opcional)</span>
                        </span>
                        <textarea
                          value={comentarioAvaliacao}
                          onChange={(e) => setComentarioAvaliacao(e.target.value)}
                          maxLength={1000}
                          rows={3}
                        />
                      </label>

                      {erroAvaliacao && (
                        <div className="alert alert--error" role="alert">
                          <p>{erroAvaliacao}</p>
                        </div>
                      )}

                      <div className="form-actions">
                        <button type="submit" className="btn btn--primary" disabled={enviandoAvaliacao}>
                          {enviandoAvaliacao ? "Enviando..." : "Enviar avaliação"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </section>
          )}
        </article>
      )}
    </div>
  );
}

export default PontoDetalhes;
