import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import type { Ordenacao, Ponto, RespostaPontos } from "../types/ponto";
import MapaCarregavel from "../components/MapaCarregavel";
import type { AreaDoMapa } from "../components/MapaPontos";
import EscolherCidade from "../components/EscolherCidade";
import PontoCard from "../components/PontoCard";
import Icone from "../components/Icone";
import SugestoesDeCidade from "../components/SugestoesDeCidade";
import { useAuth } from "../context/useAuth";
import { CATEGORIAS_PONTOS, iconeDaCategoria } from "../constants/categorias";
import { extrairMensagemErro } from "../utils/erro";

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
  const [notaMinima, setNotaMinima] = useState("");
  const [abertoAgora, setAbertoAgora] = useState(false);
  const [ordenar, setOrdenar] = useState<Ordenacao | "">("");
  const [localizacao, setLocalizacao] = useState<{ lat: number; lng: number } | null>(null);
  const [buscandoLocalizacao, setBuscandoLocalizacao] = useState(false);

  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [buscou, setBuscou] = useState(false);
  const [desatualizado, setDesatualizado] = useState(false);
  const [visualizacao, setVisualizacao] = useState<"lista" | "mapa">("lista");
  const [escolhendoCidade, setEscolhendoCidade] = useState(false);
  // Busca pelo texto (cidade, nome...) ou pela região enquadrada no mapa.
  const [buscaPelaArea, setBuscaPelaArea] = useState(false);
  const [ultimaAreaBuscada, setUltimaAreaBuscada] = useState<AreaDoMapa | null>(null);

  async function buscarPontos(event?: FormEvent, categoriaEscolhida?: string, cidadeEscolhida?: string) {
    event?.preventDefault();

    const categoriaFiltro = categoriaEscolhida ?? categoria;
    const cidadeFiltro = cidadeEscolhida ?? cidade;

    setCarregando(true);
    setErro(null);
    setDesatualizado(false);
    setBuscou(true);
    setBuscaPelaArea(false);

    try {
      const params: Record<string, string> = {};
      if (cidadeFiltro.trim()) params.cidade = cidadeFiltro.trim();
      if (categoriaFiltro.trim()) params.categoria = categoriaFiltro.trim();
      if (busca.trim()) params.busca = busca.trim();
      if (acessibilidade.trim()) params.acessibilidade = acessibilidade.trim();
      if (faixaPreco.trim()) params.faixaPreco = faixaPreco.trim();
      if (notaMinima) params.notaMinima = notaMinima;
      if (abertoAgora) params.abertoAgora = "true";
      if (ordenar && (ordenar !== "distancia" || localizacao)) params.ordenar = ordenar;

      if (localizacao) {
        params.lat = String(localizacao.lat);
        params.lng = String(localizacao.lng);
        params.raioKm = raioKm;
      }

      const resposta = await api.get<RespostaPontos>("/pontos", { params });
      setPontos(resposta.data.dados);
      setDesatualizado(Boolean(resposta.data.desatualizado));
    } catch (error) {
      console.error("Erro ao buscar pontos turísticos:", error);
      setErro(extrairMensagemErro(error, "Não foi possível carregar os pontos turísticos. Tente novamente."));
      setPontos([]);
    } finally {
      setCarregando(false);
    }
  }

  /** Busca o que está dentro da região enquadrada no mapa (os filtros valem; a cidade digitada não). */
  async function buscarNaArea(area: AreaDoMapa) {
    setCarregando(true);
    setErro(null);
    setDesatualizado(false);
    setBuscou(true);
    setBuscaPelaArea(true);
    setUltimaAreaBuscada(area);

    try {
      const params: Record<string, string> = {
        lat: String(area.latitude),
        lng: String(area.longitude),
        raioKm: String(Math.min(200, Math.max(0.3, Number(area.raioKm.toFixed(2))))),
        limite: "100",
      };
      if (categoria.trim()) params.categoria = categoria.trim();
      if (busca.trim()) params.busca = busca.trim();
      if (acessibilidade.trim()) params.acessibilidade = acessibilidade.trim();
      if (faixaPreco.trim()) params.faixaPreco = faixaPreco.trim();
      if (notaMinima) params.notaMinima = notaMinima;
      if (abertoAgora) params.abertoAgora = "true";

      const resposta = await api.get<RespostaPontos>("/pontos", { params });
      setPontos(resposta.data.dados);
      setDesatualizado(Boolean(resposta.data.desatualizado));
    } catch (error) {
      console.error("Erro ao buscar pontos na área do mapa:", error);
      setErro(extrairMensagemErro(error, "Não foi possível carregar os pontos desta área. Tente novamente."));
      setPontos([]);
    } finally {
      setCarregando(false);
    }
  }

  /** Abre o mapa livre para a pessoa navegar e escolher onde quer ir. */
  function explorarPeloMapa() {
    setBuscou(true);
    setVisualizacao("mapa");
    setBuscaPelaArea(true);
    setErro(null);
    setPontos([]);
    setUltimaAreaBuscada(null);
  }

  function abrirEscolhaDeCidade() {
    setEscolhendoCidade(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function aoEscolherCidade(nome: string) {
    setCidade(nome);
    setEscolhendoCidade(false);
    setVisualizacao("lista");
    void buscarPontos(undefined, undefined, nome);
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
                  list="cidades-da-busca"
                />
                <SugestoesDeCidade id="cidades-da-busca" />
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

                <label className="field">
                  <span>Nota mínima</span>
                  <select value={notaMinima} onChange={(event) => setNotaMinima(event.target.value)}>
                    <option value="">Qualquer nota</option>
                    <option value="3">3 estrelas ou mais</option>
                    <option value="4">4 estrelas ou mais</option>
                    <option value="4.5">4,5 estrelas ou mais</option>
                  </select>
                </label>

                <label className="field">
                  <span>Ordenar por</span>
                  <select
                    value={ordenar}
                    onChange={(event) => setOrdenar(event.target.value as Ordenacao | "")}
                  >
                    <option value="">Mais relevantes</option>
                    <option value="avaliacao">Melhor avaliados</option>
                    <option value="nome">Nome (A–Z)</option>
                    <option value="distancia" disabled={!localizacao}>
                      Mais próximos{localizacao ? "" : " (ative a localização)"}
                    </option>
                  </select>
                </label>

                <label className="checkbox busca__aberto">
                  <input
                    type="checkbox"
                    checked={abertoAgora}
                    onChange={(event) => setAbertoAgora(event.target.checked)}
                  />
                  <span>Aberto agora</span>
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

          <div className="hero__acoes">
            <button type="button" className="btn btn--outline" onClick={explorarPeloMapa}>
              <Icone nome="mapa" />
              Explorar pelo mapa
            </button>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => setEscolhendoCidade((aberto) => !aberto)}
              aria-expanded={escolhendoCidade}
            >
              <Icone nome="globo" />
              Buscar outra cidade do Brasil
            </button>
          </div>

          {escolhendoCidade && (
            <EscolherCidade
              textoInicial={cidade}
              aoEscolher={aoEscolherCidade}
              aoFechar={() => setEscolhendoCidade(false)}
            />
          )}
        </div>
      </section>

      <div className="container home">
        {recomendados.length > 0 && (
          <section className="section" aria-labelledby="titulo-recomendados">
            <div className="section__cabecalho">
              <h2 id="titulo-recomendados">Recomendados para você</h2>
              <p className="muted">
                Sugestões baseadas nos seus interesses e no que usuários de gosto parecido salvaram.
              </p>
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

              {!erro && (
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

            {desatualizado && !carregando && (
              <div className="alert alert--warning" role="status">
                <Icone nome="info" />
                <p>
                  O servidor demorou a responder, então estes resultados vêm de uma consulta recente e
                  podem estar levemente desatualizados.
                </p>
              </div>
            )}

            {!erro && !carregando && pontos.length === 0 && visualizacao === "lista" && (
              <div className="empty">
                <div className="empty__icon">
                  <Icone nome="busca" />
                </div>
                <p className="empty__title">Nenhum ponto turístico encontrado</p>
                <p>Tente ajustar os filtros ou buscar por outra cidade.</p>
                <button type="button" className="btn btn--primary" onClick={abrirEscolhaDeCidade}>
                  <Icone nome="globo" />
                  Buscar {cidade.trim() ? `“${cidade.trim()}”` : "uma cidade"} em todo o Brasil
                </button>
              </div>
            )}

            {!erro && visualizacao === "mapa" && (
              <>
                <div className="mapa-wrap">
                  <MapaCarregavel
                    pontos={pontos}
                    altura={520}
                    aoBuscarNestaArea={buscarNaArea}
                    ajustarAosPontos={!buscaPelaArea}
                    carregando={carregando}
                    vistaInicial={
                      localizacao
                        ? { centro: [localizacao.lat, localizacao.lng], zoom: 12 }
                        : { centro: [-14.2, -51.9], zoom: 4 }
                    }
                  />
                </div>

                {!carregando && pontos.length === 0 && (
                  <p className="muted mapa-dica">
                    {ultimaAreaBuscada
                      ? "Não há lugares cadastrados nesta área. "
                      : "Arraste e aproxime o mapa até a região que você quer conhecer e toque em “Buscar nesta área”. "}
                    Se for uma cidade que ainda não temos,{" "}
                    <button type="button" className="link-botao" onClick={abrirEscolhaDeCidade}>
                      busque pelo nome
                    </button>
                    .
                  </p>
                )}
              </>
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
