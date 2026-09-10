import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import type { Ponto, RespostaPontos } from "../types/ponto";
import MapaPontos from "../components/MapaPontos";
import { useAuth } from "../context/useAuth";

const estiloCampo = { padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" };

function formatarDistancia(metros: number): string {
  if (metros < 1000) {
    return `${Math.round(metros)} m`;
  }

  return `${(metros / 1000).toFixed(1)} km`;
}

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

  async function buscarPontos(event?: FormEvent) {
    event?.preventDefault();

    setCarregando(true);
    setErro(null);
    setBuscou(true);

    try {
      const params: Record<string, string> = {};
      if (cidade.trim()) params.cidade = cidade.trim();
      if (categoria.trim()) params.categoria = categoria.trim();
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
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>NomadPlan</h1>
      <p>Descubra pontos turísticos e monte seu roteiro personalizado.</p>

      {recomendados.length > 0 && (
        <div style={{ marginBottom: "2rem" }}>
          <h2>Recomendados para você</h2>
          <div style={{ display: "flex", gap: "1rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
            {recomendados.map((ponto) => (
              <Link
                key={ponto.id}
                to={`/pontos/${ponto.id}`}
                style={{
                  flex: "0 0 220px",
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  padding: "1rem",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <h3 style={{ margin: "0 0 0.25rem" }}>{ponto.nome}</h3>
                <p style={{ margin: 0, color: "#555", fontSize: "0.9rem" }}>
                  {ponto.categoria} • {ponto.cidade}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={buscarPontos}
        style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}
      >
        <input
          type="text"
          value={cidade}
          onChange={(event) => setCidade(event.target.value)}
          placeholder="Cidade"
          style={{ ...estiloCampo, flex: "1 1 160px" }}
        />
        <input
          type="text"
          value={categoria}
          onChange={(event) => setCategoria(event.target.value)}
          placeholder="Categoria"
          style={{ ...estiloCampo, flex: "1 1 140px" }}
        />
        <input
          type="text"
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder="Buscar por nome ou descrição"
          style={{ ...estiloCampo, flex: "2 1 220px" }}
        />
        <input
          type="text"
          value={acessibilidade}
          onChange={(event) => setAcessibilidade(event.target.value)}
          placeholder="Acessibilidade"
          style={{ ...estiloCampo, flex: "1 1 160px" }}
        />
        <input
          type="text"
          value={faixaPreco}
          onChange={(event) => setFaixaPreco(event.target.value)}
          placeholder="Faixa de preço"
          style={{ ...estiloCampo, flex: "1 1 140px" }}
        />

        <button
          type="button"
          onClick={aoUsarLocalizacao}
          disabled={buscandoLocalizacao}
          style={{ ...estiloCampo, backgroundColor: localizacao ? "#dcfce7" : "#fff", cursor: "pointer" }}
        >
          {buscandoLocalizacao ? "Localizando..." : localizacao ? "✔ Perto de mim" : "Perto de mim"}
        </button>

        {localizacao && (
          <select
            value={raioKm}
            onChange={(event) => setRaioKm(event.target.value)}
            style={estiloCampo}
          >
            <option value="5">até 5 km</option>
            <option value="10">até 10 km</option>
            <option value="25">até 25 km</option>
            <option value="50">até 50 km</option>
          </select>
        )}

        <button type="submit" disabled={carregando} style={{ ...estiloCampo, backgroundColor: "#2563eb", color: "#fff", border: "none", fontWeight: "bold" }}>
          {carregando ? "Buscando..." : "Buscar"}
        </button>
      </form>

      {buscou && !carregando && !erro && (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button
            type="button"
            onClick={() => setVisualizacao("lista")}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: 6,
              border: "1px solid #2563eb",
              backgroundColor: visualizacao === "lista" ? "#2563eb" : "transparent",
              color: visualizacao === "lista" ? "#fff" : "#2563eb",
              cursor: "pointer",
            }}
          >
            Lista
          </button>
          <button
            type="button"
            onClick={() => setVisualizacao("mapa")}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: 6,
              border: "1px solid #2563eb",
              backgroundColor: visualizacao === "mapa" ? "#2563eb" : "transparent",
              color: visualizacao === "mapa" ? "#fff" : "#2563eb",
              cursor: "pointer",
            }}
          >
            Mapa
          </button>
        </div>
      )}

      {erro && <p style={{ color: "red" }}>{erro}</p>}

      {!erro && buscou && !carregando && pontos.length === 0 && (
        <p>Nenhum ponto turístico encontrado.</p>
      )}

      {!erro && !carregando && pontos.length > 0 && visualizacao === "mapa" && (
        <MapaPontos pontos={pontos} />
      )}

      {!erro && !carregando && pontos.length > 0 && visualizacao === "lista" && (
        <div style={{ display: "grid", gap: "1rem" }}>
          {pontos.map((ponto) => (
            <Link
              key={ponto.id}
              to={`/pontos/${ponto.id}`}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: "1rem",
                textDecoration: "none",
                color: "inherit",
                display: "block",
              }}
            >
              <h2 style={{ margin: "0 0 0.25rem" }}>
                {ponto.nome} {ponto.seloVerificado && <span title="Verificado">✔</span>}
              </h2>
              <p style={{ margin: "0 0 0.5rem", color: "#555" }}>
                {ponto.categoria} • {ponto.cidade}
                {ponto.distanciaMetros !== undefined && ` • ${formatarDistancia(ponto.distanciaMetros)} de você`}
              </p>
              <p style={{ margin: "0 0 0.5rem" }}>{ponto.descricao}</p>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "#777" }}>
                {ponto.endereco} — {ponto.faixaPreco}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default Home;
