import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import type { PontoRecomendado, Roteiro, RespostaRecomendacao } from "../types/roteiro";
import { useAuth } from "../context/useAuth";
import { extrairMensagemErro } from "../utils/erro";
import { CATEGORIAS_PONTOS, iconeDaCategoria } from "../constants/categorias";
import Icone from "../components/Icone";

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
    <div className="container container--narrow page">
      <Link to="/roteiros" className="back-link">
        <Icone nome="voltar" />
        Voltar para meus roteiros
      </Link>

      <div className="page-head">
        <div className="page-head__text">
          <h1>Gerar roteiro sugerido</h1>
          <p className="page-head__sub">
            Nosso motor sugere pontos com base nos seus interesses, no tempo disponível e na
            proximidade entre os locais.
          </p>
        </div>
      </div>

      <form onSubmit={aoGerar} className="card form-card form">
        <div className="form-grid">
          <label className="field">
            <span>Cidade *</span>
            <input
              type="text"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              maxLength={120}
            />
          </label>

          <label className="field">
            <span>Tempo disponível (horas)</span>
            <input
              type="number"
              min={1}
              max={24}
              step={0.5}
              value={horasDisponiveis}
              onChange={(e) => setHorasDisponiveis(e.target.value)}
            />
          </label>
        </div>

        <fieldset className="field">
          <legend className="field__legenda">Interesses</legend>
          <div className="chips">
            {CATEGORIAS_PONTOS.map((categoria) => (
              <button
                key={categoria}
                type="button"
                className="chip"
                aria-pressed={interesses.includes(categoria)}
                onClick={() => alternarInteresse(categoria)}
              >
                <Icone nome={iconeDaCategoria(categoria)} />
                {categoria}
              </button>
            ))}
          </div>
        </fieldset>

        {erro && (
          <div className="alert alert--error" role="alert">
            <p>{erro}</p>
          </div>
        )}

        <div className="form-actions">
          <button type="submit" disabled={gerando} className="btn btn--primary btn--lg">
            <Icone nome="brilho" />
            {gerando ? "Gerando..." : "Gerar roteiro"}
          </button>
        </div>
      </form>

      {sugestao && sugestao.length > 0 && (
        <section className="section">
          <h2 className="section__title">Roteiro sugerido</h2>

          {fallbackUsado && (
            <div className="alert alert--warning" role="status" style={{ marginBottom: "1rem" }}>
              <Icone nome="alerta" />
              <p>
                O motor de recomendação não pôde considerar interesses e horários agora; esta é uma
                sugestão simplificada pelos pontos mais próximos.
              </p>
            </div>
          )}

          <ol className="paradas">
            {sugestao.map((ponto, indice) => (
              <li key={ponto.id} className="parada">
                <span className="parada__num">{indice + 1}</span>

                <div className="card parada__card">
                  <div className="stack stack--sm">
                    <h3>{ponto.nome}</h3>
                    <div className="cluster">
                      <span className="badge badge--primary">{ponto.categoria}</span>
                      <span className="muted small">
                        {ponto.cidade}
                        {ponto.distanciaMetros !== null && ` · ${formatarDistancia(ponto.distanciaMetros)}`}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={aoSalvarComoRoteiro}
            disabled={salvando}
            className="btn btn--accent btn--lg btn--block"
            style={{ marginTop: "1.5rem" }}
          >
            {salvando ? "Salvando..." : "Salvar como meu roteiro"}
          </button>
        </section>
      )}
    </div>
  );
}

export default GerarRoteiro;
