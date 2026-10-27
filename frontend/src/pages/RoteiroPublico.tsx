import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../services/api";
import type { RoteiroPublico as RoteiroPublicoTipo } from "../types/roteiro";
import MapaRoteiroCarregavel from "../components/MapaRoteiroCarregavel";
import { agruparPorDia, contarDias, corDoDia, descreverTrecho, rotuloDoDia } from "../utils/roteiro";
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

  const totalDias = roteiro ? contarDias(roteiro.itens, roteiro.dataInicio, roteiro.dataFim) : 1;
  const dias = agruparPorDia(roteiro?.itens ?? [], totalDias).filter((grupo) => grupo.itens.length > 0);

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

          {dias.length > 0 && (
            <div className="mapa-wrap">
              <MapaRoteiroCarregavel
                comLinks={false}
                paradas={dias.flatMap((grupo) =>
                  grupo.itens.map((item, indice) => ({
                    idPonto: item.ponto.id,
                    nome: item.ponto.nome,
                    categoria: item.ponto.categoria,
                    dia: grupo.dia,
                    numero: indice + 1,
                    latitude: item.ponto.latitude,
                    longitude: item.ponto.longitude,
                  })),
                )}
              />
            </div>
          )}

          <section>
            <h2 className="section__title">Pontos do roteiro</h2>

            <div className="stack stack--lg">
              {dias.map((grupo) => (
                <div key={grupo.dia} className="dia" style={{ ["--cor-dia" as string]: corDoDia(grupo.dia) }}>
                  {(dias.length > 1 || grupo.dia > 1) && (
                    <div className="dia__cabecalho">
                      <h3 className="dia__titulo">{rotuloDoDia(grupo.dia, roteiro.dataInicio)}</h3>
                    </div>
                  )}

                  <ol className="paradas">
                    {grupo.itens.map((item, indice) => (
                      <li key={item.id} className="parada">
                        <span className="parada__num" style={{ background: corDoDia(grupo.dia) }}>
                          {indice + 1}
                        </span>

                        <div className="card parada__card">
                          {item.deslocamento && (
                            <p className="parada__trecho">
                              <Icone nome="avancar" />
                              {descreverTrecho(item.deslocamento)} desde a parada anterior
                            </p>
                          )}

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
                </div>
              ))}
            </div>
          </section>
        </article>
      )}
    </div>
  );
}

export default RoteiroPublico;
