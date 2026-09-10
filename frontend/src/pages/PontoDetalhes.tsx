import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../services/api";
import type { Ponto } from "../types/ponto";
import { useAuth } from "../context/useAuth";
import { extrairMensagemErro } from "../utils/erro";

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
        </article>
      )}
    </main>
  );
}

export default PontoDetalhes;
