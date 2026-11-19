import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api from "../services/api";
import { comNovasTentativas, ehFalhaTemporaria } from "../utils/falhaTemporaria";
import type { RoteiroPublico as RoteiroPublicoTipo } from "../types/roteiro";
import MapaRoteiroCarregavel from "../components/MapaRoteiroCarregavel";
import { agruparPorDia, cidadesDoDia, contarDias, corDoDia, descreverTrecho, nomeDoItem, ROTULO_PERIODO, rotuloDoDia } from "../utils/roteiro";
import Icone from "../components/Icone";
import TrechoNaEstrada from "../components/viagem/TrechoNaEstrada";
import { estradasNoMapa, ultimoDiaDeEstrada } from "../utils/viagem";

function RoteiroPublico() {
  const { slug } = useParams<{ slug: string }>();

  const [roteiro, setRoteiro] = useState<RoteiroPublicoTipo | null>(null);
  const [carregando, setCarregando] = useState(true);
  // "naoExiste": o servidor respondeu que não há esse roteiro. "indisponivel": o servidor falhou de
  // forma temporária (rede, 5xx, ocupado) e mesmo depois de novas tentativas não deu para saber.
  const [erro, setErro] = useState<"naoExiste" | "indisponivel" | null>(null);
  const ativa = useRef(true);

  // O estado inicial já é "carregando"; só o botão de tentar de novo precisa recolocá-lo.
  const buscar = useCallback(async () => {
    try {
      const resposta = await comNovasTentativas(
        () => api.get<RoteiroPublicoTipo>(`/roteiros/publico/${slug}`),
        [1000, 3000],
        () => ativa.current,
      );

      if (ativa.current) setRoteiro(resposta.data);
    } catch (err) {
      console.error(err);

      if (ativa.current) setErro(ehFalhaTemporaria(err) ? "indisponivel" : "naoExiste");
    } finally {
      if (ativa.current) setCarregando(false);
    }
  }, [slug]);

  function tentarDeNovo() {
    setCarregando(true);
    setErro(null);
    buscar();
  }

  useEffect(() => {
    ativa.current = true;
    buscar();

    return () => {
      ativa.current = false;
    };
  }, [buscar]);

  const totalDias = roteiro
    ? contarDias(roteiro.itens, roteiro.dataInicio, roteiro.dataFim, ultimoDiaDeEstrada(roteiro.trechosDeEstrada))
    : 1;
  // Dias sem paradas somem, a não ser os de estrada da viagem de carro.
  const dias = agruparPorDia(roteiro?.itens ?? [], totalDias).filter(
    (grupo) => grupo.itens.length > 0 || roteiro?.trechosDeEstrada?.some((t) => t.dia === grupo.dia),
  );

  return (
    <div className="container container--narrow page">
      {carregando && <p className="loading">Carregando roteiro...</p>}

      {erro && (
        <div className="stack">
          <div className="alert alert--error" role="alert">
            <Icone nome="alerta" />
            <p>
              {erro === "indisponivel"
                ? "Não foi possível carregar este roteiro agora: o servidor não respondeu. O roteiro pode existir; tente de novo em instantes."
                : "Este roteiro não existe ou não está mais público."}
            </p>
          </div>
          {erro === "indisponivel" && (
            <div>
              <button type="button" className="btn btn--outline" onClick={tentarDeNovo}>
                Tentar novamente
              </button>
            </div>
          )}
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
                estradas={estradasNoMapa(roteiro.trechosDeEstrada)}
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
                    .map((v) =>
                      v.estrada ? (
                        <TrechoNaEstrada
                          key={`${v.dia}-${v.noFimDoDia ? "fim" : "inicio"}`}
                          de={v.de}
                          para={v.para}
                          metros={v.metros}
                          segundos={v.minutos * 60}
                          noDia={v.noFimDoDia ? "volta" : undefined}
                        />
                      ) : (
                        <p key={v.dia} className="dia__viagem">
                          <Icone nome="avancar" />
                          Viagem de {v.de} para {v.para}: {descreverTrecho(v)} pela estrada (estimativa)
                        </p>
                      ),
                    )}

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
