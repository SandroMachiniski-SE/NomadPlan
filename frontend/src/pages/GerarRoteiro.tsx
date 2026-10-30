import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../services/api";
import type { Roteiro, RespostaRecomendacao } from "../types/roteiro";
import { useAuth } from "../context/useAuth";
import { extrairMensagemErro } from "../utils/erro";
import { CATEGORIAS_PONTOS, iconeDaCategoria } from "../constants/categorias";
import Icone from "../components/Icone";
import { formatarDistancia, formatarDuracao, formatarHora } from "../utils/formatar";

function GerarRoteiro() {
  const { usuario } = useAuth();
  const navigate = useNavigate();

  const [cidade, setCidade] = useState(usuario?.cidadeBase ?? "");
  const [horasDisponiveis, setHorasDisponiveis] = useState("6");
  const [inicio, setInicio] = useState("");
  const [interesses, setInteresses] = useState<string[]>(usuario?.interesses ?? []);
  const [localizacao, setLocalizacao] = useState<{ latitude: number; longitude: number } | null>(null);
  const [buscandoLocalizacao, setBuscandoLocalizacao] = useState(false);

  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespostaRecomendacao | null>(null);

  const [salvando, setSalvando] = useState(false);

  function alternarInteresse(categoria: string) {
    setInteresses((atual) =>
      atual.includes(categoria) ? atual.filter((c) => c !== categoria) : [...atual, categoria],
    );
  }

  function aoUsarLocalizacao() {
    if (!navigator.geolocation) {
      setErro("Seu navegador não suporta geolocalização.");
      return;
    }

    setBuscandoLocalizacao(true);

    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        setLocalizacao({ latitude: posicao.coords.latitude, longitude: posicao.coords.longitude });
        setBuscandoLocalizacao(false);
      },
      () => {
        setErro("Não foi possível obter sua localização. Verifique a permissão do navegador.");
        setBuscandoLocalizacao(false);
      },
    );
  }

  async function aoGerar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setResultado(null);

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
        ...(inicio ? { dataHoraInicio: new Date(inicio).toISOString() } : {}),
        ...(localizacao ?? {}),
      });

      setResultado(resposta.data);

      if (resposta.data.pontos.length === 0) {
        setErro(
          resposta.data.avisos[0] ??
            "Nenhum ponto publicado e aberto foi encontrado para essa cidade nesse horário.",
        );
      }
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível gerar um roteiro agora. Tente novamente."));
    } finally {
      setGerando(false);
    }
  }

  async function aoSalvarComoRoteiro() {
    if (!resultado || resultado.pontos.length === 0) return;

    try {
      setSalvando(true);

      // O roteiro e todas as paradas são gravados juntos: ou fica completo, ou nada é criado.
      const roteiro = await api.post<Roteiro>("/roteiros", {
        nome: `Roteiro em ${cidade.trim()}`,
        cidade: cidade.trim(),
        pontos: resultado.pontos.map((ponto) => ({ idPonto: ponto.id })),
      });

      navigate(`/roteiros/${roteiro.data.id}`);
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível salvar o roteiro sugerido."));
    } finally {
      setSalvando(false);
    }
  }

  const pontos = resultado?.pontos ?? [];

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
            Nosso motor sugere pontos com base nos seus interesses, no tempo disponível, nos horários de
            funcionamento e na distância entre os locais.
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

          <label className="field">
            <span>
              Início do passeio <span className="field__optional">(opcional)</span>
            </span>
            <input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            <span className="field__hint">Sem data, começamos no próximo horário comercial.</span>
          </label>

          <div className="field">
            <span>
              Ponto de partida <span className="field__optional">(opcional)</span>
            </span>
            <div>
              <button
                type="button"
                className={localizacao ? "btn btn--primary" : "btn btn--outline"}
                onClick={aoUsarLocalizacao}
                disabled={buscandoLocalizacao}
              >
                <Icone nome={localizacao ? "check" : "localizar"} />
                {buscandoLocalizacao ? "Localizando..." : localizacao ? "Partindo de onde estou" : "Usar minha localização"}
              </button>
            </div>
          </div>
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

      {resultado && pontos.length > 0 && (
        <section className="section">
          <h2 className="section__title">Roteiro sugerido</h2>
          <p className="muted small">Começando às {formatarHora(resultado.inicio)}.</p>

          {resultado.fallbackUsado && (
            <div className="alert alert--warning" role="status" style={{ marginBottom: "1rem" }}>
              <Icone nome="alerta" />
              <p>
                O motor de recomendação não pôde considerar interesses e horários agora; esta é uma
                sugestão simplificada pelos pontos mais próximos.
              </p>
            </div>
          )}

          {resultado.avisos.length > 0 && (
            <div className="alert alert--info" role="status" style={{ marginBottom: "1rem" }}>
              <Icone nome="info" />
              <ul className="relatorio__lista">
                {resultado.avisos.map((aviso) => (
                  <li key={aviso}>{aviso}</li>
                ))}
              </ul>
            </div>
          )}

          <ol className="paradas">
            {pontos.map((ponto, indice) => (
              <li key={ponto.id} className="parada">
                <span className="parada__num">{indice + 1}</span>

                <div className="card parada__card">
                  <div className="stack stack--sm">
                    <h3>
                      <Link to={`/pontos/${ponto.id}`}>{ponto.nome}</Link>
                    </h3>
                    <div className="cluster">
                      <span className="badge badge--primary">{ponto.categoria}</span>
                      <span className="muted small">
                        {ponto.cidade}
                        {ponto.distanciaMetros !== null && ` · ${formatarDistancia(ponto.distanciaMetros)}`}
                      </span>
                    </div>

                    {!resultado.fallbackUsado && (
                      <p className="parada__horario">
                        <Icone nome="relogio" />
                        {formatarHora(ponto.chegadaEstimada)} – {formatarHora(ponto.saidaEstimada)}
                        <span className="muted small">
                          {" "}
                          · visita de {formatarDuracao(ponto.duracaoVisitaMin)}
                          {ponto.deslocamentoMin > 0 && `, ${formatarDuracao(ponto.deslocamentoMin)} de deslocamento`}
                          {ponto.esperaMin > 0 && `, ${formatarDuracao(ponto.esperaMin)} de espera até abrir`}
                        </span>
                      </p>
                    )}
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
