import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import api from "../services/api";
import type { Ordenacao, Ponto, RespostaPontos } from "../types/ponto";
import {
  FILTROS_VAZIOS,
  enderecoDaBusca,
  guardarUltimaBusca,
  lerEnderecoDaBusca,
  parametrosDaBusca,
  zoomDaArea,
  type AreaBuscada,
  type FiltrosDaBusca,
} from "../utils/buscaNaUrl";
import MapaCarregavel from "../components/MapaCarregavel";
import type { AreaDoMapa } from "../components/MapaPontos";
import EscolherCidade from "../components/EscolherCidade";
import PontoCard from "../components/PontoCard";
import Icone from "../components/Icone";
import SugestoesDeCidade from "../components/SugestoesDeCidade";
import { useAuth } from "../context/useAuth";
import { CATEGORIAS_PONTOS, iconeDaCategoria } from "../constants/categorias";
import { extrairMensagemErro } from "../utils/erro";
import { useTelaLarga } from "../utils/useTelaLarga";

function Home() {
  const { autenticado, usuario } = useAuth();
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

    void buscarRecomendados();
  }, [autenticado]);

  // A busca fica no endereço da página: ao voltar dos detalhes de um lugar (ou recarregar), a tela
  // nasce com os mesmos filtros e a busca é refeita.
  const [enderecoDaPagina, setEnderecoDaPagina] = useSearchParams();
  const [buscaSalva] = useState(() => lerEnderecoDaBusca(enderecoDaPagina));
  const filtrosSalvos = buscaSalva?.filtros ?? FILTROS_VAZIOS;
  const refazBuscaSalva = buscaSalva !== null && (!buscaSalva.pelaArea || buscaSalva.area !== null);

  const [cidade, setCidade] = useState(filtrosSalvos.cidade);
  const [categoria, setCategoria] = useState(filtrosSalvos.categoria);
  const [busca, setBusca] = useState(filtrosSalvos.busca);
  const [acessibilidade, setAcessibilidade] = useState(filtrosSalvos.acessibilidade);
  const [faixaPreco, setFaixaPreco] = useState(filtrosSalvos.faixaPreco);
  const [raioKm, setRaioKm] = useState(filtrosSalvos.raioKm);
  const [notaMinima, setNotaMinima] = useState(filtrosSalvos.notaMinima);
  const [abertoAgora, setAbertoAgora] = useState(filtrosSalvos.abertoAgora);
  const [ordenar, setOrdenar] = useState<Ordenacao | "">(filtrosSalvos.ordenar);
  const [localizacao, setLocalizacao] = useState<{ lat: number; lng: number } | null>(filtrosSalvos.localizacao);
  const [buscandoLocalizacao, setBuscandoLocalizacao] = useState(false);

  const [pontos, setPontos] = useState<Ponto[]>([]);
  // A busca vem em páginas: o total de resultados e o pedido da última busca, para "Mostrar mais".
  const [total, setTotal] = useState(0);
  const [temMais, setTemMais] = useState(false);
  const [pedidoDaBusca, setPedidoDaBusca] = useState<Record<string, string> | null>(null);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [carregando, setCarregando] = useState(refazBuscaSalva);
  const [erro, setErro] = useState<string | null>(null);
  const [buscou, setBuscou] = useState(buscaSalva !== null);
  const [desatualizado, setDesatualizado] = useState(false);
  const [visualizacao, setVisualizacao] = useState<"lista" | "mapa">(buscaSalva?.mapa ? "mapa" : "lista");
  const [escolhendoCidade, setEscolhendoCidade] = useState(false);
  // Busca pelo texto (cidade, nome...) ou pela região enquadrada no mapa.
  const [buscaPelaArea, setBuscaPelaArea] = useState(buscaSalva?.pelaArea ?? false);
  const [ultimaAreaBuscada, setUltimaAreaBuscada] = useState<AreaDoMapa | null>(buscaSalva?.area ?? null);
  // Cada busca ganha um número e só a mais recente mexe na tela: a resposta de uma busca anterior
  // que chega atrasada (servidor lento, rede instável) é descartada em vez de tomar o lugar da nova.
  const numeroDaBuscaRef = useRef(0);
  const [destacandoMapa, setDestacandoMapa] = useState(false);
  // Em tela larga, a lista e o mapa ficam lado a lado e um realça o outro.
  const telaLarga = useTelaLarga();
  const [pontoDoCartao, setPontoDoCartao] = useState<number | null>(null);
  const [pontoDoPino, setPontoDoPino] = useState<number | null>(null);
  const resultadosRef = useRef<HTMLElement | null>(null);
  const mapaAberto = buscou && visualizacao === "mapa";
  // Sem resultados só divide quando a busca veio do mapa: ele precisa continuar na tela para a pessoa buscar de novo.
  const dividido = telaLarga && visualizacao === "lista" && !erro && (pontos.length > 0 || buscaPelaArea);

  function filtrosAtuais(): FiltrosDaBusca {
    return { cidade, categoria, busca, acessibilidade, faixaPreco, notaMinima, abertoAgora, ordenar, localizacao, raioKm };
  }

  /** Guarda a busca no endereço (sem criar um passo a mais no histórico) e para o "Voltar para a busca". */
  function guardarBusca(params: Record<string, string>, pelaArea: boolean, visao: "lista" | "mapa") {
    const endereco = enderecoDaBusca(params, { pelaArea, mapa: visao === "mapa" });

    setEnderecoDaPagina(endereco, { replace: true });
    guardarUltimaBusca(endereco);
  }

  function mostrarPrimeiraPagina(resposta: RespostaPontos, pedido: Record<string, string>) {
    setPontos(resposta.dados);
    setTotal(resposta.total);
    setTemMais(Boolean(resposta.temMais));
    setPedidoDaBusca(pedido);
    setDesatualizado(Boolean(resposta.desatualizado));
  }

  function limparResultados() {
    setPontos([]);
    setTotal(0);
    setTemMais(false);
    setPedidoDaBusca(null);
  }

  /** Busca a primeira página e mostra o resultado, se nenhuma busca mais nova tiver começado no meio. */
  async function carregarPrimeiraPagina(params: Record<string, string>, mensagemDeErro: string) {
    const numero = ++numeroDaBuscaRef.current;
    const atual = () => numero === numeroDaBuscaRef.current;

    try {
      const resposta = await api.get<RespostaPontos>("/pontos", { params });
      if (!atual()) return;
      mostrarPrimeiraPagina(resposta.data, params);
    } catch (error) {
      if (!atual()) return;
      console.error(mensagemDeErro, error);
      setErro(extrairMensagemErro(error, mensagemDeErro));
      limparResultados();
    } finally {
      if (atual()) setCarregando(false);
    }
  }

  async function buscarPontos(event?: FormEvent, mudancas: Partial<FiltrosDaBusca> = {}, visao = visualizacao) {
    event?.preventDefault();

    const params = parametrosDaBusca({ ...filtrosAtuais(), ...mudancas });

    setCarregando(true);
    setErro(null);
    setDesatualizado(false);
    setBuscou(true);
    setBuscaPelaArea(false);
    guardarBusca(params, false, visao);

    await carregarPrimeiraPagina(params, "Não foi possível carregar os pontos turísticos. Tente novamente.");
  }

  /** Busca o que está dentro da região enquadrada no mapa (os filtros valem; a cidade digitada não). */
  async function buscarNaArea(area: AreaBuscada, mudancas: Partial<FiltrosDaBusca> = {}, visao = visualizacao) {
    const params = parametrosDaBusca({ ...filtrosAtuais(), ...mudancas }, area);

    setCarregando(true);
    setErro(null);
    setDesatualizado(false);
    setBuscou(true);
    setBuscaPelaArea(true);
    setUltimaAreaBuscada(area);
    guardarBusca(params, true, visao);

    await carregarPrimeiraPagina(params, "Não foi possível carregar os pontos desta área. Tente novamente.");
  }

  // Ao voltar dos detalhes de um lugar (ou recarregar a página), refaz a busca guardada no endereço.
  // Os filtros, a aba e o "Buscando..." já nasceram com ela: aqui só vai o pedido ao servidor.
  useEffect(() => {
    if (!buscaSalva || !refazBuscaSalva) return;

    const area = buscaSalva.area ?? undefined;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca ao abrir a página: a tela só muda quando a resposta chega
    void carregarPrimeiraPagina(
      parametrosDaBusca(buscaSalva.filtros, area),
      area
        ? "Não foi possível carregar os pontos desta área. Tente novamente."
        : "Não foi possível carregar os pontos turísticos. Tente novamente.",
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao abrir a página: depois, quem busca é a pessoa
  }, []);

  /** Traz a página seguinte da mesma busca e junta aos resultados que já estão na tela. */
  async function mostrarMais() {
    if (!pedidoDaBusca) return;

    // A página seguinte é da busca que está na tela: se outra busca começar no meio, ela é descartada.
    const numero = numeroDaBuscaRef.current;

    setCarregandoMais(true);

    try {
      const resposta = await api.get<RespostaPontos>("/pontos", {
        params: { ...pedidoDaBusca, deslocamento: String(pontos.length) },
      });
      if (numero !== numeroDaBuscaRef.current) return;
      const vistos = new Set(pontos.map((p) => p.id));

      setPontos([...pontos, ...resposta.data.dados.filter((p) => !vistos.has(p.id))]);
      setTotal(resposta.data.total);
      setTemMais(Boolean(resposta.data.temMais));
    } catch (error) {
      if (numero !== numeroDaBuscaRef.current) return;
      console.error("Erro ao carregar mais resultados:", error);
      setErro(extrairMensagemErro(error, "Não foi possível carregar mais resultados. Tente novamente."));
    } finally {
      setCarregandoMais(false);
    }
  }

  /**
   * Abre o mapa livre para a pessoa navegar e escolher onde quer ir. O mapa nasce abaixo da
   * busca, então a página rola até ele e ele pulsa por um instante: sem isso, o clique parecia não fazer nada.
   */
  function explorarPeloMapa() {
    if (!mapaAberto) {
      // Uma busca que ainda estava a caminho não deve encher o mapa livre.
      numeroDaBuscaRef.current += 1;
      setCarregando(false);
      setBuscou(true);
      setVisualizacao("mapa");
      setBuscaPelaArea(true);
      setErro(null);
      limparResultados();
      setUltimaAreaBuscada(null);
      setEnderecoDaPagina(enderecoDaBusca({}, { pelaArea: true, mapa: true }), { replace: true });
    }

    setDestacandoMapa(true);
    window.setTimeout(() => {
      resultadosRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    window.setTimeout(() => setDestacandoMapa(false), 1500);
  }

  function abrirEscolhaDeCidade() {
    setEscolhendoCidade(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function aoEscolherCidade(nome: string) {
    setCidade(nome);
    setEscolhendoCidade(false);
    setVisualizacao("lista");
    void buscarPontos(undefined, { cidade: nome }, "lista");
  }

  function aoEscolherCategoria(nova: string) {
    const proxima = categoria === nova ? "" : nova;
    setCategoria(proxima);
    void buscarPontos(undefined, { categoria: proxima });
  }

  /** Troca entre lista e mapa e guarda a escolha junto com a busca no endereço. */
  function trocarVisualizacao(nova: "lista" | "mapa") {
    setVisualizacao(nova);

    if (!pedidoDaBusca && !buscaPelaArea) return;

    setEnderecoDaPagina(
      (atual) => {
        const endereco = new URLSearchParams(atual);

        if (nova === "mapa") endereco.set("ver", "mapa");
        else endereco.delete("ver");

        guardarUltimaBusca(endereco);
        return endereco;
      },
      { replace: true },
    );
  }

  // Ao reabrir uma busca feita pelo mapa, ele volta enquadrando a mesma região.
  const vistaDoMapa: { centro: [number, number]; zoom: number } = localizacao
    ? { centro: [localizacao.lat, localizacao.lng], zoom: 12 }
    : buscaPelaArea && ultimaAreaBuscada
      ? { centro: [ultimaAreaBuscada.latitude, ultimaAreaBuscada.longitude], zoom: zoomDaArea(ultimaAreaBuscada) }
      : { centro: [-14.2, -51.9], zoom: 4 };

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
              <label className="busca__campo busca__campo--com-acao">
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
                <button
                  type="button"
                  className="busca__mapa"
                  onClick={explorarPeloMapa}
                  aria-pressed={mapaAberto}
                  aria-label="Escolher o destino no mapa"
                  title="Escolher o destino no mapa"
                >
                  <Icone nome="mapa" />
                </button>
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
            <button type="button" className="btn btn--outline" onClick={explorarPeloMapa} aria-pressed={mapaAberto}>
              <Icone nome={mapaAberto ? "check" : "mapa"} />
              {mapaAberto ? "Mapa aberto" : "Explorar pelo mapa"}
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
        {recomendados.length > 0 && !buscou && (
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
          <section className="section resultados" aria-live="polite" ref={resultadosRef}>
            <div className="section__cabecalho section__cabecalho--linha">
              <h2>
                {carregando
                  ? "Buscando..."
                  : erro
                    ? "Resultados"
                    : buscaPelaArea && !ultimaAreaBuscada
                      ? "Escolha onde você quer ir"
                      : total > pontos.length
                        ? `Mostrando ${pontos.length} de ${total} resultados`
                        : `${pontos.length} ${pontos.length === 1 ? "resultado" : "resultados"}`}
              </h2>

              {!erro && (
                <div className="segmented" role="group" aria-label="Modo de visualização">
                  <button
                    type="button"
                    aria-pressed={visualizacao === "lista"}
                    onClick={() => trocarVisualizacao("lista")}
                  >
                    <Icone nome="lista" />
                    Lista
                  </button>
                  <button
                    type="button"
                    aria-pressed={visualizacao === "mapa"}
                    onClick={() => trocarVisualizacao("mapa")}
                  >
                    <Icone nome="mapa" />
                    Mapa
                  </button>
                </div>
              )}
            </div>

            {/* A relevância (ordem padrão da busca por texto) traz primeiro os lugares do gosto de quem está logado. */}
            {!carregando && !erro && !buscaPelaArea && !ordenar && !localizacao && pontos.length > 0 && (usuario?.interesses.length ?? 0) > 0 && (
              <p className="muted small">Primeiro os lugares do seu gosto: {usuario!.interesses.join(", ")}.</p>
            )}

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

            {!erro && !carregando && pontos.length === 0 && visualizacao === "lista" && !dividido && (
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
                <div className={destacandoMapa ? "mapa-wrap mapa-wrap--destaque" : "mapa-wrap"}>
                  <MapaCarregavel
                    pontos={pontos}
                    altura={520}
                    aoBuscarNestaArea={buscarNaArea}
                    autenticado={autenticado}
                    ajustarAosPontos={!buscaPelaArea}
                    carregando={carregando}
                    vistaInicial={vistaDoMapa}
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

            {dividido && (
              <div className="resultados-dividido">
                <div className={carregando ? "resultados-dividido__lista resultados-dividido__lista--carregando" : "resultados-dividido__lista"}>
                  {pontos.length === 0 && !carregando ? (
                    <p className="muted mapa-dica">
                      Não há lugares cadastrados nesta área. Mova o mapa e busque de novo, ou{" "}
                      <button type="button" className="link-botao" onClick={abrirEscolhaDeCidade}>
                        busque uma cidade pelo nome
                      </button>
                      .
                    </p>
                  ) : (
                    <div className="grid-cards">
                      {pontos.map((ponto) => (
                        <PontoCard
                          key={ponto.id}
                          ponto={ponto}
                          aoDestacar={setPontoDoCartao}
                          destacado={ponto.id === pontoDoPino}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="resultados-dividido__mapa mapa-wrap">
                  <MapaCarregavel
                    pontos={pontos}
                    altura="calc(100vh - var(--header-height) - 2rem)"
                    aoBuscarNestaArea={buscarNaArea}
                    autenticado={autenticado}
                    ajustarAosPontos={!buscaPelaArea}
                    carregando={carregando}
                    destacadoId={pontoDoCartao}
                    aoDestacarPonto={setPontoDoPino}
                    vistaInicial={vistaDoMapa}
                  />
                </div>
              </div>
            )}

            {!dividido && !erro && !carregando && pontos.length > 0 && visualizacao === "lista" && (
              <div className="grid-cards">
                {pontos.map((ponto) => (
                  <PontoCard key={ponto.id} ponto={ponto} />
                ))}
              </div>
            )}

            {temMais && !erro && !carregando && (
              <div className="resultados__mais">
                <button type="button" className="btn btn--outline" onClick={mostrarMais} disabled={carregandoMais}>
                  {carregandoMais ? "Carregando..." : `Mostrar mais (faltam ${total - pontos.length})`}
                </button>
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
