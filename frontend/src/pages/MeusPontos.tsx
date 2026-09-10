import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import type { Ponto, RespostaPontos } from "../types/ponto";
import { extrairMensagemErro } from "../utils/erro";
import { useAuth } from "../context/useAuth";

const PAPEIS_FERRAMENTAS = ["GESTOR", "MODERADOR", "ADMIN"];

const ROTULO_STATUS: Record<string, string> = {
  RASCUNHO: "Rascunho",
  PENDENTE_VERIFICACAO: "Em análise",
  PUBLICADO: "Publicado",
  REJEITADO: "Rejeitado",
};

const COR_STATUS: Record<string, string> = {
  RASCUNHO: "#6b7280",
  PENDENTE_VERIFICACAO: "#b45309",
  PUBLICADO: "#166534",
  REJEITADO: "#991b1b",
};

function MeusPontos() {
  const { usuario } = useAuth();
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [publicandoId, setPublicandoId] = useState<number | null>(null);

  const buscarPontos = useCallback(async () => {
    try {
      setCarregando(true);
      setErro(null);

      const resposta = await api.get<RespostaPontos>("/pontos/meus");
      setPontos(resposta.data.dados);
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível carregar seus pontos turísticos."));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial ao montar o componente
    buscarPontos();
  }, [buscarPontos]);

  async function aoPublicar(id: number) {
    try {
      setPublicandoId(id);
      await api.post(`/pontos/${id}/publicar`);
      await buscarPontos();
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível enviar este ponto para publicação."));
    } finally {
      setPublicandoId(null);
    }
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Meus pontos turísticos</h1>

      <Link
        to="/pontos/novo"
        style={{
          display: "inline-block",
          marginBottom: "1rem",
          padding: "0.5rem 1rem",
          borderRadius: 6,
          backgroundColor: "#2563eb",
          color: "#fff",
          textDecoration: "none",
        }}
      >
        + Novo ponto
      </Link>

      {usuario && PAPEIS_FERRAMENTAS.includes(usuario.tipoConta) && (
        <Link
          to="/pontos/ferramentas"
          style={{
            display: "inline-block",
            marginBottom: "1rem",
            marginLeft: "0.75rem",
            padding: "0.5rem 1rem",
            borderRadius: 6,
            border: "1px solid #2563eb",
            color: "#2563eb",
            textDecoration: "none",
          }}
        >
          Exportar / Importar
        </Link>
      )}

      {carregando && <p>Carregando...</p>}

      {erro && (
        <div
          style={{
            border: "1px solid #f87171",
            backgroundColor: "#fee2e2",
            color: "#991b1b",
            borderRadius: 8,
            padding: "1rem",
          }}
        >
          {erro}
        </div>
      )}

      {!carregando && !erro && pontos.length === 0 && (
        <div style={{ border: "1px dashed #aaa", borderRadius: 8, padding: "2rem", textAlign: "center" }}>
          <p>Você ainda não cadastrou nenhum ponto turístico.</p>
        </div>
      )}

      {!carregando && !erro && pontos.length > 0 && (
        <div style={{ display: "grid", gap: "1rem" }}>
          {pontos.map((ponto) => (
            <div key={ponto.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h2 style={{ margin: 0 }}>{ponto.nome}</h2>
                  <p style={{ color: "#666", margin: "0.25rem 0 0" }}>
                    {ponto.categoria} • {ponto.cidade}
                  </p>
                </div>

                <span
                  style={{
                    color: "#fff",
                    backgroundColor: COR_STATUS[ponto.status] ?? "#6b7280",
                    borderRadius: 999,
                    padding: "0.25rem 0.75rem",
                    fontSize: "0.85rem",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ROTULO_STATUS[ponto.status] ?? ponto.status}
                </span>
              </div>

              {ponto.status === "REJEITADO" && ponto.motivoRejeicao && (
                <p style={{ color: "#991b1b", marginTop: "0.75rem" }}>
                  Motivo da rejeição: {ponto.motivoRejeicao}
                </p>
              )}

              <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
                {(ponto.status === "RASCUNHO" || ponto.status === "REJEITADO") && (
                  <>
                    <Link to={`/pontos/${ponto.id}/editar`} style={{ color: "#2563eb" }}>
                      Editar
                    </Link>

                    <button
                      type="button"
                      onClick={() => aoPublicar(ponto.id)}
                      disabled={publicandoId === ponto.id}
                      style={{
                        padding: "0.35rem 0.75rem",
                        borderRadius: 6,
                        border: "1px solid #2563eb",
                        backgroundColor: "transparent",
                        color: "#2563eb",
                        cursor: publicandoId === ponto.id ? "not-allowed" : "pointer",
                      }}
                    >
                      {publicandoId === ponto.id ? "Enviando..." : "Enviar para publicação"}
                    </button>
                  </>
                )}

                {ponto.status === "PUBLICADO" && (
                  <Link to={`/pontos/${ponto.id}`} style={{ color: "#2563eb" }}>
                    Ver página pública
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default MeusPontos;
