import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import type { Ponto, RespostaPontos } from "../types/ponto";
import MapaCarregavel from "../components/MapaCarregavel";
import PontoCard from "../components/PontoCard";
import Icone from "../components/Icone";
import { useAuth } from "../context/useAuth";
import { CATEGORIAS_PONTOS, iconeDaCategoria } from "../constants/categorias";

function Home() {
  const { autenticado } = useAuth();
  const [recomendados, setRecomendados] = useState<Ponto[]>([]);

  useEffect(() => {
    if (!autenticado) {
      return;
    }

    async function buscarRecomendados() {
      try {
        const resposta = await api.get<RespostaPontos>("/pontos/recomendados");
        setRecomendados(resposta.data.dados);
      } catch (err) {
        console.error(err);
      }
    }

    buscarRecomendados();
  }, [autenticado]);

  const [cidade, setCidade] = useState("");
  const [categoria, setCategoria] = useState("");
  const [busca, setBusca] = useState("");
  const [acessibilidade, setAcessibilidade] = useState("");
  const [faixaPreco, setFaixaPreco] = useState("");
  const [raioKm, setRaioKm] = useState("10");
  const [localizacao, setLocalizacao] = useState<{ lat: number; lng: number } | null>(null);
  const [buscandoLocalizacao, setBuscandoLocalizacao] = useState(false);

  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [buscou, setBuscou] = useState(false);
  const [visualizacao, setVisualizacao] = useState<"lista" | "mapa">("lista");

  async function buscarPontos(event?: FormEvent, categoriaEscolhida?: string) {
    event?.preventDefault();

    const categoriaFiltro = categoriaEscolhida ?? categoria;

    setCarregando(true);
    setErro(null);
    setBuscou(true);

    try {
      const params: Record<string, string> = {};
      if (cidade.trim()) params.cidade = cidade.trim();
      if (categoriaFiltro.trim()) params.categoria = categoriaFiltro.trim();
      if (busca.trim()) params.busca = busca.trim();
      if (acessibilidade.trim()) params.acessibilidade = acessibilidade.trim();
      if (faixaPreco.trim()) params.faixaPreco = faixaPreco.trim();

      if (localizacao) {
        params.lat = String(localizacao.lat);
        params.lng = String(localizacao.lng);
        params.raioKm = raioKm;
      }

      const resposta = await api.get<RespostaPontos>("/pontos", { params });
      setPontos(resposta.data.dados);
    } catch (error) {
      console.error("Erro ao buscar pontos turísticos:", error);
      setErro("Não foi possível carregar os pontos turísticos. Tente novamente.");
      setPontos([]);
    } finally {
      setCarregando(false);
    }
  }

  function aoEscolherCategoria(nova: string) {
    const proxima = categoria === nova ? "" : nova;
    setCategoria(proxima);
    buscarPontos(undefined, proxima);
  }

  function aoUsarLocalizacao() {
    if (!navigator.geolocation) {
      alert("Seu navegador não suporta geolocalização.");
      return;
    }

    setBuscandoLocalizacao(true);

    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        setLocalizacao({ lat: posicao.coords.latitude, lng: posicao.coords.longitude });
        setBuscandoLocalizacao(false);
      },
      (erroGeo) => {
        console.error(erroGeo);
        alert("Não foi possível obter sua localização. Verifique a permissão do navegador.");
        setBuscandoLocalizacao(false);
      },
    );
  }

  return (
    <>
      <section className="hero">
        <div className="container hero__inner">
          <p className="hero__eyebrow">
            <Icone nome="bussola" />
            Explore. Organize. Thrive.
          </p>
          <h1 className="hero__titulo">
            Descubra destinos e monte o <span>roteiro perfeito</span>
          </h1>
          <p className="hero__texto">
            Pontos turísticos, restaurantes, hospedagens e eventos reunidos em um só lugar, com
            roteiros personalizados para o seu jeito de viajar.
          </p>

          <form className="busca" onSubmit={buscarPontos} role="search">
            <div className="busca__linha">
              <label className="busca__campo">
                <Icone nome="pin" />
                <input
                  type="text"
                  value={cidade}
                  onChange={(event) => setCidade(event.target.value)}
                  placeholder="Para onde você vai?"
                  aria-label="Cidade"
                />
              </label>

              <label className="busca__campo busca__campo--grande">
                <Icone nome="busca" />
                <input
                  type="text"
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Buscar por nome ou descrição"
                  aria-label="Buscar por nome ou descrição"
                />
              </label>

              <button type="submit" className="btn btn--accent btn--lg" disabled={carregando}>
                {carregando ? "Buscando..." : "Buscar"}
              </button>
            </div>

            <details className="busca__avancado">
              <summary>Mais filtros</summary>

              <div className="busca__filtros">
                <label className="field">
                  <span>Acessibilidade</span>
                  <input
                    type="text"
                    value={acessibilidade}
                    onChange={(event) => setAcessibilidade(event.target.value)}
                    placeholder="Ex.: rampa de acesso"
                  />
                </label>

                <label className="field">
                  <span>Faixa de preço</span>
                  <input
                    type="text"
                    value={faixaPreco}
                    onChange={(event) => setFaixaPreco(event.target.value)}
                    placeholder="Ex.: Gratuito, $$"
                  />
                </label>

                <div className="field">
                  <span>Localização</span>
                  <div className="cluster">
                    <button
                      type="button"
                      className={localizacao ? "btn btn--primary" : "btn btn--outline"}
                      onClick={aoUsarLocalizacao}
                      disabled={buscandoLocalizacao}
                    >
                      <Icone nome={localizacao ? "check" : "localizar"} />
                      {buscandoLocalizacao ? "Localizando..." : localizacao ? "Perto de mim" : "Usar minha localização"}
                    </button>

                    {localizacao && (
                      <select
                        value={raioKm}
                        onChange={(event) => setRaioKm(event.target.value)}
                        aria-label="Raio de busca"
                        className="busca__raio"
                      >
                        <option value="5">até 5 km</option>
                        <option value="10">até 10 km</option>
                        <option value="25">até 25 km</option>
                        <option value="50">até 50 km</option>
                      </select>
                    )}
                  </div>
                </div>
              </div>
            </details>
          </form>

          <div className="chips hero__chips" role="group" aria-label="Filtrar por categoria">
            {CATEGORIAS_PONTOS.map((nome) => (
              <button
                key={nome}
                type="button"
                className="chip chip--hero"
                aria-pressed={categoria === nome}
                onClick={() => aoEscolherCategoria(nome)}
              >
                <Icone nome={iconeDaCategoria(nome)} />
                {nome}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="container home">
        {recomendados.length > 0 && (
          <section className="section" aria-labelledby="titulo-recomendados">
            <div className="section__cabecalho">
              <h2 id="titulo-recomendados">Recomendados para você</h2>
              <p className="muted">Sugestões baseadas nos seus interesses.</p>
            </div>

            <div className="carrossel">
              {recomendados.map((ponto) => (
                <PontoCard key={ponto.id} ponto={ponto} compacto />
              ))}
            </div>
          </section>
        )}

        {buscou && (
          <section className="section" aria-live="polite">
            <div className="section__cabecalho section__cabecalho--linha">
              <h2>{carregando ? "Buscando..." : erro ? "Resultados" : `${pontos.length} ${pontos.length === 1 ? "resultado" : "resultados"}`}</h2>

              {!carregando && !erro && pontos.length > 0 && (
                <div className="segmented" role="group" aria-label="Modo de visualização">
                  <button
                    type="button"
                    aria-pressed={visualizacao === "lista"}
                    onClick={() => setVisualizacao("lista")}
                  >
                    <Icone nome="lista" />
                    Lista
                  </button>
                  <button
                    type="button"
                    aria-pressed={visualizacao === "mapa"}
                    onClick={() => setVisualizacao("mapa")}
                  >
                    <Icone nome="mapa" />
                    Mapa
                  </button>
                </div>
              )}
            </div>

            {carregando && <p className="loading">Buscando pontos turísticos...</p>}

            {erro && (
              <div className="alert alert--error" role="alert">
                <Icone nome="alerta" />
                <p>{erro}</p>
              </div>
            )}

            {!erro && !carregando && pontos.length === 0 && (
              <div className="empty">
                <div className="empty__icon">
                  <Icone nome="busca" />
                </div>
                <p className="empty__title">Nenhum ponto turístico encontrado</p>
                <p>Tente ajustar os filtros ou buscar por outra cidade.</p>
              </div>
            )}

            {!erro && !carregando && pontos.length > 0 && visualizacao === "mapa" && (
              <div className="mapa-wrap">
                <MapaCarregavel pontos={pontos} altura={520} />
              </div>
            )}

            {!erro && !carregando && pontos.length > 0 && visualizacao === "lista" && (
              <div className="grid-cards">
                {pontos.map((ponto) => (
                  <PontoCard key={ponto.id} ponto={ponto} />
                ))}
              </div>
            )}
          </section>
        )}

        {!buscou && (
          <section className="section" aria-labelledby="titulo-como-funciona">
            <div className="section__cabecalho text-center">
              <h2 id="titulo-como-funciona">Como o NomadPlan funciona</h2>
              <p className="muted">Do primeiro destino ao roteiro pronto para compartilhar.</p>
            </div>

            <div className="passos">
              <div className="passo card">
                <span className="passo__icone">
                  <Icone nome="busca" />
                </span>
                <h3>Explore</h3>
                <p className="muted">
                  Busque atrações, restaurantes e hospedagens por cidade, categoria, acessibilidade
                  ou proximidade.
                </p>
              </div>

              <div className="passo card">
                <span className="passo__icone passo__icone--coral">
                  <Icone nome="calendario" />
                </span>
                <h3>Organize</h3>
                <p className="muted">
                  Monte roteiros por dia, reordene as paradas ou gere uma sugestão automática com base
                  nos seus interesses.
                </p>
              </div>

              <div className="passo card">
                <span className="passo__icone">
                  <Icone nome="compartilhar" />
                </span>
                <h3>Compartilhe</h3>
                <p className="muted">
                  Publique um link do seu roteiro, avalie os lugares que visitou e ajude a manter
                  os dados atualizados.
                </p>
              </div>
            </div>

            {!autenticado && (
              <div className="cta-final">
                <div>
                  <h2>Pronto para planejar a próxima viagem?</h2>
                  <p>Crie sua conta gratuita e comece a montar seus roteiros.</p>
                </div>
                <Link to="/registrar" className="btn btn--accent btn--lg">
                  Criar conta grátis
                  <Icone nome="avancar" />
                </Link>
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}

export default Home;
