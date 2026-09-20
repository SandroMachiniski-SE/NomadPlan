import { useCallback, useEffect, useState, type FormEvent, type SyntheticEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import type { Roteiro } from "../types/roteiro";
import type { Ponto, RespostaPontos } from "../types/ponto";
import { extrairMensagemErro } from "../utils/erro";
import Icone from "../components/Icone";

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
  const [idPontoSelecionado, setIdPontoSelecionado] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviandoPonto, setEnviandoPonto] = useState(false);
  const [erroPonto, setErroPonto] = useState<string | null>(null);

  const [removendoId, setRemovendoId] = useState<number | null>(null);
  const [reordenando, setReordenando] = useState(false);

  const [editando, setEditando] = useState(false);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [descricaoEdicao, setDescricaoEdicao] = useState("");
  const [cidadeEdicao, setCidadeEdicao] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  const [excluindo, setExcluindo] = useState(false);
  const [compartilhando, setCompartilhando] = useState(false);

  const buscarRoteiro = useCallback(async () => {
    try {
      setCarregando(true);
      setErro(null);

      const resposta = await api.get<Roteiro>(`/roteiros/${id}`);
      setRoteiro(resposta.data);
      setNomeEdicao(resposta.data.nome);
      setDescricaoEdicao(resposta.data.descricao ?? "");
      setCidadeEdicao(resposta.data.cidade ?? "");
    } catch (err) {
      console.error(err);
      setErro("Não foi possível carregar este roteiro.");
    } finally {
      setCarregando(false);
    }
  }, [id]);

  const buscarPontos = useCallback(async () => {
    try {
      const resposta = await api.get<RespostaPontos>("/pontos");
      setPontosDisponiveis(resposta.data.dados);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial ao montar o componente, padrao recomendado pelo React
    buscarRoteiro();
    buscarPontos();
  }, [buscarRoteiro, buscarPontos]);

  async function aoAdicionarPonto(evento: SyntheticEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroPonto(null);

    if (!idPontoSelecionado) {
      setErroPonto("Selecione um ponto para adicionar.");
      return;
    }

    try {
      setEnviandoPonto(true);

      const payload: Record<string, unknown> = {
        idPonto: Number(idPontoSelecionado),
      };

      if (observacao.trim() !== "") {
        payload.observacao = observacao.trim();
      }

      await api.post(`/roteiros/${id}/itens`, payload);

      setIdPontoSelecionado("");
      setObservacao("");

      await buscarRoteiro();
    } catch (err) {
      console.error(err);

      const mensagem = extrairMensagemErro(
        err,
        "Não foi possível adicionar este ponto ao roteiro."
      );

      setErroPonto(mensagem);
    } finally {
      setEnviandoPonto(false);
    }
  }

  async function aoRemoverPonto(idPonto: number) {
    const confirmar = window.confirm("Deseja remover este ponto do roteiro?");

    if (!confirmar) {
      return;
    }

    try {
      setRemovendoId(idPonto);

      await api.delete(`/roteiros/${id}/itens/${idPonto}`);

      await buscarRoteiro();
    } catch (err) {
      console.error(err);
      alert("Não foi possível remover este ponto do roteiro.");
    } finally {
      setRemovendoId(null);
    }
  }

  const itensOrdenados = roteiro ? [...roteiro.itens].sort((a, b) => a.ordem - b.ordem) : [];

  async function aoMoverItem(indice: number, direcao: -1 | 1) {
    const destino = indice + direcao;

    if (destino < 0 || destino >= itensOrdenados.length) {
      return;
    }

    const novaOrdem = [...itensOrdenados];
    [novaOrdem[indice], novaOrdem[destino]] = [novaOrdem[destino], novaOrdem[indice]];

    try {
      setReordenando(true);

      await api.post(`/roteiros/${id}/itens/reordenar`, {
        idsItensEmOrdem: novaOrdem.map((item) => item.id),
      });

      await buscarRoteiro();
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível reordenar os pontos."));
    } finally {
      setReordenando(false);
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
                </div>

                <h1>{roteiro.nome}</h1>

                <div className="roteiro-meta">
                  {roteiro.cidade && (
                    <span>
                      <Icone nome="pin" />
                      {roteiro.cidade}
                    </span>
                  )}
                  {(roteiro.dataInicio || roteiro.dataFim) && (
                    <span>
                      <Icone nome="calendario" />
                      {formatarPeriodo(roteiro.dataInicio, roteiro.dataFim)}
                    </span>
                  )}
                  <span>
                    <Icone nome="lista" />
                    {itensOrdenados.length} {itensOrdenados.length === 1 ? "parada" : "paradas"}
                  </span>
                </div>

                {roteiro.descricao && <p className="muted">{roteiro.descricao}</p>}
              </div>

              <div className="cluster">
                <button type="button" className="btn btn--outline btn--sm" onClick={() => setEditando(true)}>
                  <Icone nome="editar" />
                  Editar
                </button>

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
              </div>

              {linkPublico && (
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

          <section aria-labelledby="titulo-paradas">
            <h2 id="titulo-paradas" className="section__title">
              Pontos do roteiro
            </h2>

            {itensOrdenados.length === 0 && (
              <div className="empty">
                <div className="empty__icon">
                  <Icone nome="pin" />
                </div>
                <p className="empty__title">Este roteiro ainda não tem pontos</p>
                <p>Use o formulário abaixo para adicionar a primeira parada.</p>
              </div>
            )}

            <ol className="paradas">
              {itensOrdenados.map((item, indice) => (
                <li key={item.id} className="parada">
                  <span className="parada__num">{indice + 1}</span>

                  <div className="card parada__card">
                    <div className="parada__topo">
                      <div className="stack stack--sm">
                        <h3>
                          <Link to={`/pontos/${item.ponto.id}`}>{item.ponto.nome}</Link>
                        </h3>
                        <div className="cluster">
                          <span className="badge badge--primary">{item.ponto.categoria}</span>
                          <span className="muted small">{item.ponto.cidade}</span>
                        </div>
                      </div>

                      <div className="cluster">
                        <button
                          type="button"
                          className="btn btn--ghost btn--icon"
                          onClick={() => aoMoverItem(indice, -1)}
                          disabled={indice === 0 || reordenando}
                          title="Mover para cima"
                          aria-label="Mover para cima"
                        >
                          <Icone nome="cima" />
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--icon"
                          onClick={() => aoMoverItem(indice, 1)}
                          disabled={indice === itensOrdenados.length - 1 || reordenando}
                          title="Mover para baixo"
                          aria-label="Mover para baixo"
                        >
                          <Icone nome="baixo" />
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger-outline btn--sm"
                          onClick={() => aoRemoverPonto(item.ponto.id)}
                          disabled={removendoId === item.ponto.id}
                        >
                          {removendoId === item.ponto.id ? "Removendo..." : "Remover"}
                        </button>
                      </div>
                    </div>

                    {item.observacao && <p className="parada__obs">{item.observacao}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="titulo-adicionar">
            <h2 id="titulo-adicionar" className="section__title">
              Adicionar ponto ao roteiro
            </h2>

            <form onSubmit={aoAdicionarPonto} className="card form-card form">
              <div className="form-grid">
                <label className="field">
                  <span>Ponto turístico *</span>
                  <select
                    value={idPontoSelecionado}
                    onChange={(e) => setIdPontoSelecionado(e.target.value)}
                  >
                    <option value="">Selecione um ponto</option>
                    {pontosDisponiveis.map((ponto) => (
                      <option key={ponto.id} value={ponto.id}>
                        {ponto.nome} - {ponto.cidade}
                      </option>
                    ))}
                  </select>
                </label>

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
                  {enviandoPonto ? "Adicionando..." : "Adicionar ponto"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default RoteiroDetalhes;
