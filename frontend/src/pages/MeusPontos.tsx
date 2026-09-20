import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import type { Ponto, RespostaPontos } from "../types/ponto";
import { extrairMensagemErro } from "../utils/erro";
import { useAuth } from "../context/useAuth";
import Icone from "../components/Icone";

const PAPEIS_FERRAMENTAS = ["GESTOR", "MODERADOR", "ADMIN"];

const ROTULO_STATUS: Record<string, string> = {
  RASCUNHO: "Rascunho",
  PENDENTE_VERIFICACAO: "Em análise",
  PUBLICADO: "Publicado",
  REJEITADO: "Rejeitado",
};

const CLASSE_STATUS: Record<string, string> = {
  RASCUNHO: "badge",
  PENDENTE_VERIFICACAO: "badge badge--warning",
  PUBLICADO: "badge badge--success",
  REJEITADO: "badge badge--danger",
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
    <div className="container page">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Meus pontos turísticos</h1>
          <p className="page-head__sub">
            Cadastre e acompanhe o status de publicação dos seus pontos.
          </p>
        </div>

        <div className="page-head__actions">
          {usuario && PAPEIS_FERRAMENTAS.includes(usuario.tipoConta) && (
            <Link to="/pontos/ferramentas" className="btn btn--outline">
              <Icone nome="download" />
              Exportar / Importar
            </Link>
          )}
          <Link to="/pontos/novo" className="btn btn--primary">
            <Icone nome="mais" />
            Novo ponto
          </Link>
        </div>
      </div>

      {carregando && <p className="loading">Carregando...</p>}

      {erro && (
        <div className="alert alert--error" role="alert">
          <Icone nome="alerta" />
          <p>{erro}</p>
        </div>
      )}

      {!carregando && !erro && pontos.length === 0 && (
        <div className="empty">
          <div className="empty__icon">
            <Icone nome="pin" />
          </div>
          <p className="empty__title">Você ainda não cadastrou nenhum ponto turístico</p>
          <p>Cadastre o primeiro para que ele apareça na busca após a moderação.</p>
          <Link to="/pontos/novo" className="btn btn--primary">
            <Icone nome="mais" />
            Novo ponto
          </Link>
        </div>
      )}

      {!carregando && !erro && pontos.length > 0 && (
        <div className="stack">
          {pontos.map((ponto) => (
            <article key={ponto.id} className="card card--pad fila-item">
              <div className="stack stack--sm">
                <div className="cluster">
                  <span className={CLASSE_STATUS[ponto.status] ?? "badge"}>
                    {ROTULO_STATUS[ponto.status] ?? ponto.status}
                  </span>
                  <span className="badge badge--primary">{ponto.categoria}</span>
                </div>

                <h2 className="card__title">{ponto.nome}</h2>
                <p className="muted small">
                  <Icone nome="pin" /> {ponto.cidade}
                </p>

                {ponto.status === "REJEITADO" && ponto.motivoRejeicao && (
                  <div className="alert alert--error">
                    <p>Motivo da rejeição: {ponto.motivoRejeicao}</p>
                  </div>
                )}
              </div>

              <div className="cluster">
                {(ponto.status === "RASCUNHO" || ponto.status === "REJEITADO") && (
                  <>
                    <Link to={`/pontos/${ponto.id}/editar`} className="btn btn--outline btn--sm">
                      <Icone nome="editar" />
                      Editar
                    </Link>

                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={() => aoPublicar(ponto.id)}
                      disabled={publicandoId === ponto.id}
                    >
                      {publicandoId === ponto.id ? "Enviando..." : "Enviar para publicação"}
                    </button>
                  </>
                )}

                {ponto.status === "PUBLICADO" && (
                  <Link to={`/pontos/${ponto.id}`} className="btn btn--outline btn--sm">
                    Ver página pública
                    <Icone nome="avancar" />
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export default MeusPontos;
