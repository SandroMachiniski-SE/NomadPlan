import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../services/api";
import type { RoteiroPublico as RoteiroPublicoTipo } from "../types/roteiro";
import MapaRoteiroCarregavel from "../components/MapaRoteiroCarregavel";
import { agruparPorDia, cidadesDoDia, contarDias, corDoDia, descreverTrecho, nomeDoItem, ROTULO_PERIODO, rotuloDoDia } from "../utils/roteiro";
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
              {((roteiro.cidades?.length ?? 0) > 0 || roteiro.cidade) && (
                <span>
                  <Icone nome="pin" />
                  {roteiro.cidades?.length ? roteiro.cidades.join(" → ") : roteiro.cidade}
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
                  grupo.itens.flatMap((item, indice) =>
                    item.ponto
                      ? [
                          {
                            idPonto: item.ponto.id,
                            nome: item.ponto.nome,
                            categoria: item.ponto.categoria,
                            dia: grupo.dia,
                            numero: item.pernoite ? 999 : indice + 1,
                            pernoite: item.pernoite,
                            latitude: item.ponto.latitude,
                            longitude: item.ponto.longitude,
                          },
                        ]
                      : [],
                  ),
                )}
              />
            </div>
          )}

          <section>
            <h2 className="section__title">Dia a dia</h2>

            <div className="stack stack--lg">
              {dias.map((grupo) => (
                <div key={grupo.dia} className="dia" style={{ ["--cor-dia" as string]: corDoDia(grupo.dia) }}>
                  {(dias.length > 1 || grupo.dia > 1) && (
                    <div className="dia__cabecalho">
                      <h3 className="dia__titulo">
                        {rotuloDoDia(grupo.dia, roteiro.dataInicio)}
                        {cidadesDoDia(grupo.itens).length > 0 && (
                          <span className="dia__cidades"> · {cidadesDoDia(grupo.itens).join(", ")}</span>
                        )}
                      </h3>
                    </div>
                  )}

                  {roteiro.viagensEntreDias
                    ?.filter((v) => v.dia === grupo.dia)
                    .map((v) => (
                      <p key={v.dia} className="dia__viagem">
                        <Icone nome="avancar" />
                        Viagem de {v.de} para {v.para}: {descreverTrecho(v)} pela estrada (estimativa)
                      </p>
                    ))}

                  <ol className="paradas">
                    {grupo.itens.filter((item) => !item.pernoite).map((item, indice) => (
                      <li key={item.id} className={item.ponto ? "parada" : "parada parada--atividade"}>
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
                            <h3>{nomeDoItem(item)}</h3>
                            <div className="cluster">
                              {item.periodo && <span className="badge badge--accent">{ROTULO_PERIODO[item.periodo]}</span>}
                              {item.ponto ? (
                                <>
                                  <span className="badge badge--primary">{item.ponto.categoria}</span>
                                  <span className="muted small">{item.ponto.cidade}</span>
                                </>
                              ) : (
                                <span className="badge">Atividade livre</span>
                              )}
                            </div>
                          </div>

                          {item.observacao && <p className="parada__obs">{item.observacao}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>

                  {grupo.itens
                    .filter((item) => item.pernoite)
                    .map((item) => (
                      <div key={item.id} className="card pernoite">
                        <span className="pernoite__rotulo">Onde dormir</span>
                        <h3>{nomeDoItem(item)}</h3>
                        {item.ponto && <span className="muted small">{item.ponto.cidade}</span>}
                      </div>
                    ))}
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
