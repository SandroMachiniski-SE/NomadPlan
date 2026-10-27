import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import type { Ponto, RespostaPontos } from "../types/ponto";
import { useSalvos } from "../context/useSalvos";
import PontoCard from "../components/PontoCard";
import Icone from "../components/Icone";

function Favoritos() {
  const { ids } = useSalvos();
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function carregar() {
      try {
        const resposta = await api.get<RespostaPontos>("/salvos");
        setPontos(resposta.data.dados);
      } catch (err) {
        console.error(err);
        setErro("Não foi possível carregar seus favoritos.");
      } finally {
        setCarregando(false);
      }
    }

    carregar();
  }, []);

  // Um ponto removido dos favoritos nesta tela some da lista na hora.
  const visiveis = pontos.filter((ponto) => ids.has(ponto.id));

  return (
    <div className="container page">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Favoritos</h1>
          <p className="page-head__sub">Os lugares que você salvou para visitar depois.</p>
        </div>
      </div>

      {carregando && <p className="loading">Carregando favoritos...</p>}

      {erro && (
        <div className="alert alert--error" role="alert">
          <Icone nome="alerta" />
          <p>{erro}</p>
        </div>
      )}

      {!carregando && !erro && visiveis.length === 0 && (
        <div className="empty">
          <div className="empty__icon">
            <Icone nome="coracao" />
          </div>
          <p className="empty__title">Você ainda não salvou nenhum lugar</p>
          <p>
            Toque no coração de um ponto turístico para guardá-lo aqui.{" "}
            <Link to="/">Explorar pontos</Link>
          </p>
        </div>
      )}

      {visiveis.length > 0 && (
        <div className="grid-cards">
          {visiveis.map((ponto) => (
            <PontoCard key={ponto.id} ponto={ponto} />
          ))}
        </div>
      )}
    </div>
  );
}

export default Favoritos;
