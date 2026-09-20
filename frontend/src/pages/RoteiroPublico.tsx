import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../services/api";
import type { RoteiroPublico as RoteiroPublicoTipo } from "../types/roteiro";
import MapaCarregavel from "../components/MapaCarregavel";
import Icone from "../components/Icone";

function RoteiroPublico() {
  const { slug } = useParams<{ slug: string }>();

  const [roteiro, setRoteiro] = useState<RoteiroPublicoTipo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function buscar() {
      try {
        const resposta = await api.get<RoteiroPublicoTipo>(`/roteiros/publico/${slug}`);
        setRoteiro(resposta.data);
      } catch (err) {
        console.error(err);
        setErro("Este roteiro não existe ou não está mais público.");
      } finally {
        setCarregando(false);
      }
    }

    buscar();
  }, [slug]);

  const itensOrdenados = roteiro ? [...roteiro.itens].sort((a, b) => a.ordem - b.ordem) : [];

  return (
    <div className="container container--narrow page">
      {carregando && <p className="loading">Carregando roteiro...</p>}

      {erro && (
        <div className="stack">
          <div className="alert alert--error" role="alert">
            <Icone nome="alerta" />
            <p>{erro}</p>
          </div>
          <Link to="/" className="back-link">
            <Icone nome="voltar" />
            Ir para a página inicial
          </Link>
        </div>
      )}

      {roteiro && (
        <article className="stack stack--lg">
          <header className="card card--pad stack stack--sm">
            <span className="badge badge--accent">
              <Icone nome="compartilhar" />
              Roteiro compartilhado
            </span>

            <h1>{roteiro.nome}</h1>

            <div className="roteiro-meta">
              {roteiro.cidade && (
                <span>
                  <Icone nome="pin" />
                  {roteiro.cidade}
                </span>
              )}
              <span>
                <Icone nome="usuario" />
                por {roteiro.usuario.nome}
              </span>
            </div>

            {roteiro.descricao && <p className="muted">{roteiro.descricao}</p>}
          </header>

          {itensOrdenados.length > 0 && (
            <div className="mapa-wrap">
              <MapaCarregavel pontos={itensOrdenados.map((item) => item.ponto)} />
            </div>
          )}

          <section>
            <h2 className="section__title">Pontos do roteiro</h2>

            <ol className="paradas">
              {itensOrdenados.map((item, indice) => (
                <li key={item.id} className="parada">
                  <span className="parada__num">{indice + 1}</span>

                  <div className="card parada__card">
                    <div className="stack stack--sm">
                      <h3>{item.ponto.nome}</h3>
                      <div className="cluster">
                        <span className="badge badge--primary">{item.ponto.categoria}</span>
                        <span className="muted small">{item.ponto.cidade}</span>
                      </div>
                    </div>

                    {item.observacao && <p className="parada__obs">{item.observacao}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </article>
      )}
    </div>
  );
}

export default RoteiroPublico;
