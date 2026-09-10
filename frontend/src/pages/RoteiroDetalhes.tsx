import { useCallback, useEffect, useState, type FormEvent, type SyntheticEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import type { Roteiro } from "../types/roteiro";
import type { Ponto, RespostaPontos } from "../types/ponto";
import { extrairMensagemErro } from "../utils/erro";
import "./RoteiroDetalhes.css";

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
      setErro("Nao foi possivel carregar este roteiro.");
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
        "Nao foi possivel adicionar este ponto ao roteiro."
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
      alert("Nao foi possivel remover este ponto do roteiro.");
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
      alert(extrairMensagemErro(err, "Nao foi possivel reordenar os pontos."));
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
      alert(extrairMensagemErro(err, "Nao foi possivel salvar as alteracoes do roteiro."));
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function aoExcluirRoteiro() {
    const confirmar = window.confirm(
      "Tem certeza que deseja excluir este roteiro? Essa acao nao pode ser desfeita.",
    );

    if (!confirmar) return;

    try {
      setExcluindo(true);
      await api.delete(`/roteiros/${id}`);
      navigate("/roteiros", { replace: true });
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Nao foi possivel excluir o roteiro."));
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
      alert(extrairMensagemErro(err, "Nao foi possivel alterar o compartilhamento do roteiro."));
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
    <div className="roteiro-detalhes">
      <Link to="/roteiros" className="roteiro-voltar">
        Voltar para meus roteiros
      </Link>

      {carregando && <p className="roteiro-status">Carregando roteiro...</p>}

      {erro && <div className="roteiro-alerta">{erro}</div>}

      {!carregando && !erro && roteiro && (
        <div className="roteiro-conteudo">
          {editando ? (
            <form onSubmit={aoSalvarEdicao} className="roteiro-form" style={{ maxWidth: 480 }}>
              <label className="roteiro-campo">
                <span>Nome *</span>
                <input
                  className="roteiro-input"
                  type="text"
                  maxLength={120}
                  value={nomeEdicao}
                  onChange={(e) => setNomeEdicao(e.target.value)}
                />
              </label>

              <label className="roteiro-campo">
                <span>Cidade</span>
                <input
                  className="roteiro-input"
                  type="text"
                  maxLength={120}
                  value={cidadeEdicao}
                  onChange={(e) => setCidadeEdicao(e.target.value)}
                />
              </label>

              <label className="roteiro-campo">
                <span>Descricao</span>
                <textarea
                  className="roteiro-input"
                  maxLength={1000}
                  rows={3}
                  value={descricaoEdicao}
                  onChange={(e) => setDescricaoEdicao(e.target.value)}
                />
              </label>

              <div className="roteiro-acoes">
                <button type="submit" className="roteiro-btn-primario" disabled={salvandoEdicao}>
                  {salvandoEdicao ? "Salvando..." : "Salvar"}
                </button>
                <button
                  type="button"
                  className="roteiro-btn-secundario"
                  onClick={() => setEditando(false)}
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div className="roteiro-cabecalho">
              <h1>{roteiro.nome}</h1>
              <p className="roteiro-cidade">{roteiro.cidade}</p>

              {roteiro.descricao && <p className="roteiro-descricao">{roteiro.descricao}</p>}

              <div className="roteiro-acoes">
                <button
                  type="button"
                  className="roteiro-btn-secundario"
                  onClick={() => setEditando(true)}
                >
                  Editar
                </button>

                <button
                  type="button"
                  className="roteiro-btn-secundario"
                  onClick={aoAlternarCompartilhamento}
                  disabled={compartilhando}
                >
                  {roteiro.publico ? "Parar de compartilhar" : "Compartilhar"}
                </button>

                <button
                  type="button"
                  className="roteiro-btn-remover"
                  onClick={aoExcluirRoteiro}
                  disabled={excluindo}
                >
                  {excluindo ? "Excluindo..." : "Excluir roteiro"}
                </button>
              </div>

              {linkPublico && (
                <div className="roteiro-compartilhar-link">
                  Link público:{" "}
                  <a href={linkPublico} target="_blank" rel="noreferrer">
                    {linkPublico}
                  </a>{" "}
                  <button
                    type="button"
                    className="roteiro-btn-icone"
                    onClick={() => aoCopiarLink(linkPublico)}
                  >
                    Copiar
                  </button>
                </div>
              )}
            </div>
          )}

          <h2 className="roteiro-secao-titulo">Pontos do roteiro</h2>

          {itensOrdenados.length === 0 && (
            <p className="roteiro-vazio">Este roteiro ainda nao tem pontos cadastrados.</p>
          )}

          <div className="roteiro-lista">
            {itensOrdenados.map((item, indice) => (
              <div key={item.id} className="roteiro-item">
                <p className="roteiro-item-parada">Parada {indice + 1}</p>
                <h3 className="roteiro-item-titulo">{item.ponto.nome}</h3>
                <p className="roteiro-item-categoria">{item.ponto.categoria}</p>

                {item.observacao && <p className="roteiro-item-obs">{item.observacao}</p>}

                <div className="roteiro-item-reordenar">
                  <button
                    type="button"
                    className="roteiro-btn-icone"
                    onClick={() => aoMoverItem(indice, -1)}
                    disabled={indice === 0 || reordenando}
                    title="Mover para cima"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="roteiro-btn-icone"
                    onClick={() => aoMoverItem(indice, 1)}
                    disabled={indice === itensOrdenados.length - 1 || reordenando}
                    title="Mover para baixo"
                  >
                    ↓
                  </button>
                </div>

                <button
                  type="button"
                  className="roteiro-btn-remover"
                  onClick={() => aoRemoverPonto(item.ponto.id)}
                  disabled={removendoId === item.ponto.id}
                >
                  {removendoId === item.ponto.id ? "Removendo..." : "Remover"}
                </button>
              </div>
            ))}
          </div>

          <h2 className="roteiro-secao-titulo">Adicionar ponto ao roteiro</h2>

          <form onSubmit={aoAdicionarPonto} className="roteiro-form">
            <label className="roteiro-campo">
              <span>Ponto turistico *</span>
              <select
                className="roteiro-select"
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

            <label className="roteiro-campo">
              <span>Observacao</span>
              <input
                className="roteiro-input"
                type="text"
                maxLength={500}
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </label>

            {erroPonto && <div className="roteiro-alerta">{erroPonto}</div>}

            <button type="submit" className="roteiro-btn-primario" disabled={enviandoPonto}>
              {enviandoPonto ? "Adicionando..." : "Adicionar ponto"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default RoteiroDetalhes;
