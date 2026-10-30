import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import type { ConviteRecebido } from "../types/roteiro";
import { extrairMensagemErro } from "../utils/erro";
import Icone from "../components/Icone";

const DESCRICAO_PAPEL = {
  EDITOR: "para editar o roteiro junto",
  LEITOR: "para acompanhar o roteiro",
} as const;

// Convites para participar de roteiros de outras pessoas.
function Convites() {
  const navigate = useNavigate();

  const [convites, setConvites] = useState<ConviteRecebido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [respondendoId, setRespondendoId] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const resposta = await api.get<{ dados: ConviteRecebido[] }>("/convites");
      setConvites(resposta.data.dados);
    } catch (err) {
      console.error(err);
      setErro("Não foi possível carregar seus convites.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial ao montar a página
    carregar();
  }, [carregar]);

  async function responder(convite: ConviteRecebido, aceitar: boolean) {
    try {
      setRespondendoId(convite.id);
      setErro(null);

      await api.post(`/convites/${convite.id}/${aceitar ? "aceitar" : "recusar"}`);

      if (aceitar) {
        navigate(`/roteiros/${convite.roteiro.id}`);
        return;
      }

      await carregar();
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível responder ao convite."));
    } finally {
      setRespondendoId(null);
    }
  }

  return (
    <div className="container container--narrow page">
      <Link to="/roteiros" className="back-link">
        <Icone nome="voltar" />
        Voltar para meus roteiros
      </Link>

      <div className="page-head">
        <div className="page-head__text">
          <h1>Convites</h1>
          <p className="page-head__sub">Pessoas que chamaram você para planejar uma viagem em conjunto.</p>
        </div>
      </div>

      {carregando && <p className="loading">Carregando convites...</p>}

      {erro && (
        <div className="alert alert--error" role="alert">
          <Icone nome="alerta" />
          <p>{erro}</p>
        </div>
      )}

      {!carregando && convites.length === 0 && (
        <div className="empty">
          <div className="empty__icon">
            <Icone nome="compartilhar" />
          </div>
          <p className="empty__title">Nenhum convite pendente</p>
          <p>Quando alguém convidar você para um roteiro, ele aparece aqui.</p>
        </div>
      )}

      <div className="stack">
        {convites.map((convite) => (
          <article key={convite.id} className="card card--pad fila-item">
            <div className="stack stack--sm">
              <h2 className="card__title">{convite.roteiro.nome}</h2>
              <p className="muted">
                <strong>{convite.convidante.nome}</strong> convidou você {DESCRICAO_PAPEL[convite.papel]}.
                {convite.roteiro.cidade && ` Cidade: ${convite.roteiro.cidade}.`}
              </p>
            </div>

            <div className="cluster">
              <button
                type="button"
                className="btn btn--success btn--sm"
                onClick={() => responder(convite, true)}
                disabled={respondendoId === convite.id}
              >
                <Icone nome="check" />
                Aceitar
              </button>
              <button
                type="button"
                className="btn btn--danger-outline btn--sm"
                onClick={() => responder(convite, false)}
                disabled={respondendoId === convite.id}
              >
                Recusar
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export default Convites;
