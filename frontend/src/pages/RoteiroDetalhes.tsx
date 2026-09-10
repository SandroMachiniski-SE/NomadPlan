import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../services/api";
import type { Roteiro } from "../types/roteiro";
import type { Ponto, RespostaPontos } from "../types/ponto";
import { extrairMensagemErro } from "../utils/erro";
import "./RoteiroDetalhes.css";

function RoteiroDetalhes() {
  const { id } = useParams();

  const [roteiro, setRoteiro] = useState<Roteiro | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [pontosDisponiveis, setPontosDisponiveis] = useState<Ponto[]>([]);
  const [idPontoSelecionado, setIdPontoSelecionado] = useState("");
  const [ordem, setOrdem] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviandoPonto, setEnviandoPonto] = useState(false);
  const [erroPonto, setErroPonto] = useState<string | null>(null);

  const [removendoId, setRemovendoId] = useState<number | null>(null);

  const buscarRoteiro = useCallback(async () => {
    try {
      setCarregando(true);
      setErro(null);

      const resposta = await api.get<Roteiro>(`/roteiros/${id}`);
      setRoteiro(resposta.data);

      setOrdem(String(resposta.data.itens.length + 1));
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

      if (ordem.trim() !== "") {
        payload.ordem = Number(ordem);
      }

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

  const itensOrdenados = roteiro
    ? [...roteiro.itens].sort((a, b) => a.ordem - b.ordem)
    : [];

  return (
    <div className="roteiro-detalhes">
      <Link to="/roteiros" className="roteiro-voltar">
        Voltar para meus roteiros
      </Link>

      {carregando && <p className="roteiro-status">Carregando roteiro...</p>}

      {erro && <div className="roteiro-alerta">{erro}</div>}

      {!carregando && !erro && roteiro && (
        <div className="roteiro-conteudo">
          <div className="roteiro-cabecalho">
            <h1>{roteiro.nome}</h1>
            <p className="roteiro-cidade">{roteiro.cidade}</p>

            {roteiro.descricao && (
              <p className="roteiro-descricao">{roteiro.descricao}</p>
            )}
          </div>

          <h2 className="roteiro-secao-titulo">Pontos do roteiro</h2>

          {itensOrdenados.length === 0 && (
            <p className="roteiro-vazio">
              Este roteiro ainda nao tem pontos cadastrados.
            </p>
          )}

          <div className="roteiro-lista">
            {itensOrdenados.map((item) => (
              <div key={item.id} className="roteiro-item">
                <p className="roteiro-item-parada">Parada {item.ordem}</p>
                <h3 className="roteiro-item-titulo">{item.ponto.nome}</h3>
                <p className="roteiro-item-categoria">{item.ponto.categoria}</p>

                {item.observacao && (
                  <p className="roteiro-item-obs">{item.observacao}</p>
                )}

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
              <span>Ordem</span>
              <input
                className="roteiro-input"
                type="number"
                min={0}
                value={ordem}
                onChange={(e) => setOrdem(e.target.value)}
              />
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

            <button
              type="submit"
              className="roteiro-btn-primario"
              disabled={enviandoPonto}
            >
              {enviandoPonto ? "Adicionando..." : "Adicionar ponto"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

export default RoteiroDetalhes;
