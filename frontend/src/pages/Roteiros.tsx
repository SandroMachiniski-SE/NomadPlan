import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import type { Roteiro, RespostaRoteiros } from "../types/roteiro";
import Icone from "../components/Icone";

function Roteiros() {
  const [roteiros, setRoteiros] = useState<Roteiro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function buscarRoteiros() {
      try {
        setCarregando(true);
        setErro(null);

        const resposta = await api.get<RespostaRoteiros>("/roteiros");

        setRoteiros(resposta.data.dados);
      } catch (err) {
        console.error(err);
        setErro("Não foi possível carregar seus roteiros. Verifique se a API está rodando.");
      } finally {
        setCarregando(false);
      }
    }

    buscarRoteiros();
  }, []);

  return (
    <div className="container page">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Meus roteiros</h1>
          <p className="page-head__sub">
            Organize suas viagens em roteiros e compartilhe com quem for junto.
          </p>
        </div>

        <div className="page-head__actions">
          <Link to="/roteiros/gerar" className="btn btn--outline">
            <Icone nome="brilho" />
            Gerar roteiro sugerido
          </Link>
          <Link to="/roteiros/novo" className="btn btn--primary">
            <Icone nome="mais" />
            Novo roteiro
          </Link>
        </div>
      </div>

      {carregando && <p className="loading">Carregando roteiros...</p>}

      {erro && (
        <div className="alert alert--error" role="alert">
          <Icone nome="alerta" />
          <p>{erro}</p>
        </div>
      )}

      {!carregando && !erro && roteiros.length === 0 && (
        <div className="empty">
          <div className="empty__icon">
            <Icone nome="mapa" />
          </div>
          <p className="empty__title">Você ainda não tem roteiros</p>
          <p>Crie um roteiro do zero ou deixe o NomadPlan sugerir um para você.</p>
          <div className="cluster">
            <Link to="/roteiros/novo" className="btn btn--primary">
              <Icone nome="mais" />
              Novo roteiro
            </Link>
            <Link to="/roteiros/gerar" className="btn btn--outline">
              <Icone nome="brilho" />
              Gerar sugestão
            </Link>
          </div>
        </div>
      )}

      {!carregando && !erro && roteiros.length > 0 && (
        <div className="grid-cards">
          {roteiros.map((roteiro) => (
            <Link
              key={roteiro.id}
              to={`/roteiros/${roteiro.id}`}
              className="card card--interactive roteiro-card"
            >
              <span className="roteiro-card__icone">
                <Icone nome="mapa" />
              </span>
              <h2 className="card__title">{roteiro.nome}</h2>
              {roteiro.cidade && (
                <p className="roteiro-card__cidade">
                  <Icone nome="pin" />
                  {roteiro.cidade}
                </p>
              )}
              {roteiro.descricao && <p className="roteiro-card__descricao">{roteiro.descricao}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default Roteiros;
