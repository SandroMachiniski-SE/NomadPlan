import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../services/api";
import type { Ponto, RespostaAvaliacoes } from "../types/ponto";
import type { RespostaRoteiros } from "../types/roteiro";
import { useAuth } from "../context/useAuth";
import { extrairMensagemErro } from "../utils/erro";
import MapaPontos from "../components/MapaPontos";

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
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
      <Link to="/" style={{ display: "inline-block", marginBottom: "1.5rem" }}>
        ← Voltar para a busca
      </Link>

      {carregando && <p>Carregando detalhes...</p>}

      {erro && <p style={{ color: "red" }}>{erro}</p>}

      {ponto && (
        <article>
          {ponto.status !== "PUBLICADO" && (
            <p
              style={{
                display: "inline-block",
                backgroundColor: "#fef3c7",
                color: "#92400e",
                borderRadius: 6,
                padding: "0.35rem 0.75rem",
                marginBottom: "1rem",
              }}
            >
              {ROTULO_STATUS[ponto.status] ?? ponto.status}
              {ponto.status === "REJEITADO" && ponto.motivoRejeicao ? `: ${ponto.motivoRejeicao}` : ""}
            </p>
          )}

          {ponto.imagemUrl && (
            <img
              src={`${api.defaults.baseURL}${ponto.imagemUrl}`}
              alt={ponto.nome}
              style={{ width: "100%", borderRadius: 8, marginBottom: "1rem" }}
            />
          )}

          <h1>{ponto.nome}</h1>

          <p style={{ color: "#555" }}>
            {ponto.categoria} • {ponto.cidade}
          </p>

          <p>{ponto.descricao}</p>

          <div style={{ display: "grid", gap: "0.5rem" }}>
            <p>
              <strong>Endereço:</strong> {ponto.endereco}
            </p>

            <p>
              <strong>Horário de funcionamento:</strong> {ponto.horarioFuncionamento ?? "Não informado"}
            </p>

            <p>
              <strong>Faixa de preço:</strong> {ponto.faixaPreco}
            </p>

            <p>
              <strong>Acessibilidade:</strong> {ponto.acessibilidade}
            </p>

            {ponto.siteOficial && (
              <p>
                <strong>Site oficial:</strong>{" "}
                <a href={ponto.siteOficial} target="_blank" rel="noreferrer">
                  Acessar site
                </a>
              </p>
            )}

            {ponto.telefoneContato && (
              <p>
                <strong>Telefone:</strong> {ponto.telefoneContato}
              </p>
            )}

            {ponto.seloVerificado && <p style={{ color: "green" }}>✔ Local verificado</p>}
          </div>

          {ponto.latitude !== null && ponto.longitude !== null && (
            <div style={{ marginTop: "1.5rem" }}>
              <MapaPontos pontos={[ponto]} altura={280} />
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${ponto.latitude},${ponto.longitude}`}
                target="_blank"
                rel="noreferrer"
                style={{ display: "inline-block", marginTop: "0.5rem", color: "#2563eb" }}
              >
                Como chegar
              </a>
            </div>
          )}

          {autenticado && ponto.status === "PUBLICADO" && (
            <div style={{ marginTop: "1.5rem" }}>
              {adicionadoRoteiro ? (
                <p style={{ color: "#166534" }}>Ponto adicionado ao roteiro.</p>
              ) : roteiros && roteiros.length > 0 ? (
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <select
                    value={roteiroSelecionado}
                    onChange={(e) => setRoteiroSelecionado(e.target.value)}
                    style={{ padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
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
                    onClick={aoAdicionarAoRoteiro}
                    disabled={!roteiroSelecionado || adicionandoRoteiro}
                    style={{ padding: "0.5rem 1rem", borderRadius: 6, border: "none", backgroundColor: "#2563eb", color: "#fff" }}
                  >
                    {adicionandoRoteiro ? "Adicionando..." : "Adicionar ao roteiro"}
                  </button>
                </div>
              ) : roteiros && roteiros.length === 0 ? (
                <p>
                  Você ainda não tem roteiros.{" "}
                  <Link to="/roteiros/novo" style={{ color: "#2563eb" }}>
                    Criar um roteiro
                  </Link>
                </p>
              ) : null}
            </div>
          )}

          {ehResponsavel && ponto.status === "PUBLICADO" && !ponto.seloVerificado && (
            <button
              type="button"
              onClick={aoSolicitarSelo}
              disabled={solicitandoSelo || seloSolicitado}
              style={{
                marginTop: "1.5rem",
                padding: "0.5rem 1rem",
                borderRadius: 6,
                border: "1px solid #166534",
                background: "transparent",
                color: "#166534",
                cursor: solicitandoSelo || seloSolicitado ? "not-allowed" : "pointer",
              }}
            >
              {seloSolicitado ? "Solicitação enviada" : "Solicitar selo de verificação"}
            </button>
          )}

          {autenticado && !ehResponsavel && ponto.status === "PUBLICADO" && (
            <div style={{ marginTop: "1.5rem" }}>
              {sugestaoEnviada ? (
                <p style={{ color: "#166534" }}>
                  Sugestão enviada. Obrigado por ajudar a manter os dados atualizados!
                </p>
              ) : mostrarSugestao ? (
                <form onSubmit={aoEnviarSugestao} style={{ display: "grid", gap: "0.75rem", maxWidth: 420 }}>
                  <label style={{ display: "grid", gap: "0.25rem" }}>
                    Campo
                    <select
                      value={campoSugestao}
                      onChange={(e) => setCampoSugestao(e.target.value)}
                      style={{ padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
                    >
                      <option value="horarioFuncionamento">Horário de funcionamento</option>
                      <option value="telefoneContato">Telefone</option>
                      <option value="siteOficial">Site oficial</option>
                      <option value="faixaPreco">Faixa de preço</option>
                      <option value="acessibilidade">Acessibilidade</option>
                      <option value="descricao">Descrição</option>
                    </select>
                  </label>

                  <label style={{ display: "grid", gap: "0.25rem" }}>
                    Novo valor
                    <input
                      type="text"
                      value={valorSugestao}
                      onChange={(e) => setValorSugestao(e.target.value)}
                      maxLength={2000}
                      style={{ padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "0.25rem" }}>
                    Mensagem para a moderação (opcional)
                    <input
                      type="text"
                      value={mensagemSugestao}
                      onChange={(e) => setMensagemSugestao(e.target.value)}
                      maxLength={500}
                      style={{ padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
                    />
                  </label>

                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="submit"
                      disabled={enviandoSugestao}
                      style={{ padding: "0.5rem 1rem", borderRadius: 6, border: "none", backgroundColor: "#2563eb", color: "#fff" }}
                    >
                      {enviandoSugestao ? "Enviando..." : "Enviar sugestão"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMostrarSugestao(false)}
                      style={{ padding: "0.5rem 1rem", borderRadius: 6, border: "1px solid #ccc", background: "transparent" }}
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setMostrarSugestao(true)}
                  style={{ padding: "0.5rem 1rem", borderRadius: 6, border: "1px solid #2563eb", background: "transparent", color: "#2563eb" }}
                >
                  Sugerir edição
                </button>
              )}
            </div>
          )}

          {ponto.status === "PUBLICADO" && (
            <div style={{ marginTop: "2rem" }}>
              <h2>Avaliações {avaliacoes?.media && `— ${avaliacoes.media.toFixed(1)} ★`}</h2>

              {avaliacoes && avaliacoes.total === 0 && (
                <p style={{ color: "#666" }}>Ainda não há avaliações para este ponto.</p>
              )}

              <div style={{ display: "grid", gap: "0.75rem", marginBottom: "1.5rem" }}>
                {avaliacoes?.dados.map((avaliacao) => (
                  <div key={avaliacao.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "0.75rem 1rem" }}>
                    <p style={{ margin: 0, fontWeight: "bold" }}>
                      {"★".repeat(avaliacao.nota)}{"☆".repeat(5 - avaliacao.nota)} — {avaliacao.autor?.nome}
                    </p>
                    {avaliacao.comentario && <p style={{ margin: "0.35rem 0 0" }}>{avaliacao.comentario}</p>}
                  </div>
                ))}
              </div>

              {autenticado && (
                <>
                  {avaliacaoEnviada ? (
                    <p style={{ color: "#166534" }}>{avaliacaoEnviada}</p>
                  ) : (
                    <form onSubmit={aoEnviarAvaliacao} style={{ display: "grid", gap: "0.75rem", maxWidth: 420 }}>
                      <label style={{ display: "grid", gap: "0.25rem" }}>
                        Sua nota
                        <select
                          value={notaAvaliacao}
                          onChange={(e) => setNotaAvaliacao(Number(e.target.value))}
                          style={{ padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
                        >
                          {[5, 4, 3, 2, 1].map((n) => (
                            <option key={n} value={n}>
                              {"★".repeat(n)} ({n})
                            </option>
                          ))}
                        </select>
                      </label>

                      <label style={{ display: "grid", gap: "0.25rem" }}>
                        Comentário (opcional)
                        <textarea
                          value={comentarioAvaliacao}
                          onChange={(e) => setComentarioAvaliacao(e.target.value)}
                          maxLength={1000}
                          rows={3}
                          style={{ padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
                        />
                      </label>

                      {erroAvaliacao && (
                        <div style={{ border: "1px solid #f87171", backgroundColor: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "0.75rem" }}>
                          {erroAvaliacao}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={enviandoAvaliacao}
                        style={{ padding: "0.5rem 1rem", borderRadius: 6, border: "none", backgroundColor: "#2563eb", color: "#fff" }}
                      >
                        {enviandoAvaliacao ? "Enviando..." : "Enviar avaliação"}
                      </button>
                    </form>
                  )}
                </>
              )}
            </div>
          )}
        </article>
      )}
    </main>
  );
}

export default PontoDetalhes;
