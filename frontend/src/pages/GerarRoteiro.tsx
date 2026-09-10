import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import type { PontoRecomendado, Roteiro, RespostaRecomendacao } from "../types/roteiro";
import { useAuth } from "../context/useAuth";
import { extrairMensagemErro } from "../utils/erro";
import { CATEGORIAS_PONTOS } from "../constants/categorias";

const estiloCampo = { padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" };

function formatarDistancia(metros: number | null): string {
  if (metros === null) return "";
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(1)} km`;
}

function GerarRoteiro() {
  const { usuario } = useAuth();
  const navigate = useNavigate();

  const [cidade, setCidade] = useState(usuario?.cidadeBase ?? "");
  const [horasDisponiveis, setHorasDisponiveis] = useState("6");
  const [interesses, setInteresses] = useState<string[]>(usuario?.interesses ?? []);

  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sugestao, setSugestao] = useState<PontoRecomendado[] | null>(null);
  const [fallbackUsado, setFallbackUsado] = useState(false);

  const [salvando, setSalvando] = useState(false);

  function alternarInteresse(categoria: string) {
    setInteresses((atual) =>
      atual.includes(categoria) ? atual.filter((c) => c !== categoria) : [...atual, categoria],
    );
  }

  async function aoGerar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSugestao(null);

    if (!cidade.trim()) {
      setErro("Informe a cidade do roteiro.");
      return;
    }

    try {
      setGerando(true);

      const resposta = await api.post<RespostaRecomendacao>("/roteiros/gerar", {
        cidade: cidade.trim(),
        horasDisponiveis: Number(horasDisponiveis),
        interesses,
      });

      setSugestao(resposta.data.pontos);
      setFallbackUsado(resposta.data.fallbackUsado);

      if (resposta.data.pontos.length === 0) {
        setErro("Nenhum ponto publicado foi encontrado para essa cidade.");
      }
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível gerar um roteiro agora. Tente novamente."));
    } finally {
      setGerando(false);
    }
  }

  async function aoSalvarComoRoteiro() {
    if (!sugestao || sugestao.length === 0) return;

    try {
      setSalvando(true);

      const roteiro = await api.post<Roteiro>("/roteiros", {
        nome: `Roteiro em ${cidade.trim()}`,
        cidade: cidade.trim(),
      });

      for (const ponto of sugestao) {
        await api.post(`/roteiros/${roteiro.data.id}/itens`, { idPonto: ponto.id });
      }

      navigate(`/roteiros/${roteiro.data.id}`);
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível salvar o roteiro sugerido."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1rem" }}>
      <Link to="/roteiros" style={{ color: "#2563eb", textDecoration: "none" }}>
        Voltar para meus roteiros
      </Link>

      <h1 style={{ marginTop: "1rem" }}>Gerar roteiro sugerido</h1>
      <p style={{ color: "#666" }}>
        Nosso motor sugere pontos com base nos seus interesses, no tempo disponível e na
        proximidade entre os locais.
      </p>

      <form onSubmit={aoGerar} style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          Cidade *
          <input
            type="text"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            maxLength={120}
            style={estiloCampo}
          />
        </label>

        <label style={{ display: "grid", gap: "0.25rem" }}>
          Tempo disponível (horas)
          <input
            type="number"
            min={1}
            max={24}
            step={0.5}
            value={horasDisponiveis}
            onChange={(e) => setHorasDisponiveis(e.target.value)}
            style={estiloCampo}
          />
        </label>

        <div>
          <p style={{ margin: "0 0 0.5rem" }}>Interesses</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {CATEGORIAS_PONTOS.map((categoria) => (
              <label
                key={categoria}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  padding: "0.35rem 0.6rem",
                  cursor: "pointer",
                  backgroundColor: interesses.includes(categoria) ? "#dbeafe" : "#fff",
                }}
              >
                <input
                  type="checkbox"
                  checked={interesses.includes(categoria)}
                  onChange={() => alternarInteresse(categoria)}
                />
                {categoria}
              </label>
            ))}
          </div>
        </div>

        {erro && (
          <div
            style={{
              border: "1px solid #f87171",
              backgroundColor: "#fee2e2",
              color: "#991b1b",
              borderRadius: 8,
              padding: "1rem",
            }}
          >
            {erro}
          </div>
        )}

        <button
          type="submit"
          disabled={gerando}
          style={{
            padding: "0.75rem",
            borderRadius: 6,
            border: "none",
            backgroundColor: "#2563eb",
            color: "#fff",
            fontWeight: "bold",
            cursor: gerando ? "not-allowed" : "pointer",
          }}
        >
          {gerando ? "Gerando..." : "Gerar roteiro"}
        </button>
      </form>

      {sugestao && sugestao.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <h2>Roteiro sugerido</h2>

          {fallbackUsado && (
            <p style={{ color: "#92400e" }}>
              O motor de recomendação não pôde considerar interesses e horários agora; esta é
              uma sugestão simplificada pelos pontos mais próximos.
            </p>
          )}

          <div style={{ display: "grid", gap: "0.75rem" }}>
            {sugestao.map((ponto, indice) => (
              <div key={ponto.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem" }}>
                <p style={{ margin: 0, color: "#666", fontSize: "0.85rem" }}>Parada {indice + 1}</p>
                <h3 style={{ margin: "0.25rem 0" }}>{ponto.nome}</h3>
                <p style={{ margin: 0, color: "#555" }}>
                  {ponto.categoria} • {ponto.cidade}
                  {ponto.distanciaMetros !== null && ` • ${formatarDistancia(ponto.distanciaMetros)}`}
                </p>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={aoSalvarComoRoteiro}
            disabled={salvando}
            style={{
              marginTop: "1.5rem",
              padding: "0.75rem",
              width: "100%",
              borderRadius: 6,
              border: "none",
              backgroundColor: "#166534",
              color: "#fff",
              fontWeight: "bold",
              cursor: salvando ? "not-allowed" : "pointer",
            }}
          >
            {salvando ? "Salvando..." : "Salvar como meu roteiro"}
          </button>
        </div>
      )}
    </div>
  );
}

export default GerarRoteiro;
