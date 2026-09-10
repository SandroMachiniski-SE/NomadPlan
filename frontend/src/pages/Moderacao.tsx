import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import type {
  Avaliacao,
  Ponto,
  RespostaPontos,
  SolicitacaoVerificacao,
  SugestaoEdicao,
} from "../types/ponto";
import { extrairMensagemErro } from "../utils/erro";

const estiloCartao = { border: "1px solid #ddd", borderRadius: 8, padding: "1.25rem" };
const estiloBotaoAprovar = {
  padding: "0.35rem 0.75rem",
  borderRadius: 6,
  border: "none",
  backgroundColor: "#166534",
  color: "#fff",
  cursor: "pointer",
};
const estiloBotaoRejeitar = {
  padding: "0.35rem 0.75rem",
  borderRadius: 6,
  border: "1px solid #991b1b",
  backgroundColor: "transparent",
  color: "#991b1b",
  cursor: "pointer",
};

function Moderacao() {
  const [pontos, setPontos] = useState<Ponto[]>([]);
  const [sugestoes, setSugestoes] = useState<SugestaoEdicao[]>([]);
  const [verificacoes, setVerificacoes] = useState<SolicitacaoVerificacao[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [processandoId, setProcessandoId] = useState<string | null>(null);

  const carregarTudo = useCallback(async () => {
    try {
      setCarregando(true);
      setErro(null);

      const [respostaPontos, respostaSugestoes, respostaVerificacoes, respostaAvaliacoes] =
        await Promise.all([
          api.get<RespostaPontos>("/pontos/moderacao"),
          api.get<{ total: number; dados: SugestaoEdicao[] }>("/sugestoes"),
          api.get<{ total: number; dados: SolicitacaoVerificacao[] }>("/verificacoes"),
          api.get<{ total: number; dados: Avaliacao[] }>("/avaliacoes"),
        ]);

      setPontos(respostaPontos.data.dados);
      setSugestoes(respostaSugestoes.data.dados);
      setVerificacoes(respostaVerificacoes.data.dados);
      setAvaliacoes(respostaAvaliacoes.data.dados);
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível carregar a fila de moderação."));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial ao montar o componente
    carregarTudo();
  }, [carregarTudo]);

  async function aprovarPonto(id: number) {
    try {
      setProcessandoId(`ponto-${id}`);
      await api.post(`/pontos/${id}/aprovar`);
      await carregarTudo();
    } catch (err) {
      alert(extrairMensagemErro(err, "Não foi possível aprovar este ponto."));
    } finally {
      setProcessandoId(null);
    }
  }

  async function rejeitarPonto(id: number) {
    const motivo = window.prompt("Motivo da rejeição:");
    if (!motivo) return;

    try {
      setProcessandoId(`ponto-${id}`);
      await api.post(`/pontos/${id}/rejeitar`, { motivo });
      await carregarTudo();
    } catch (err) {
      alert(extrairMensagemErro(err, "Não foi possível rejeitar este ponto."));
    } finally {
      setProcessandoId(null);
    }
  }

  async function aprovarSugestao(id: number) {
    try {
      setProcessandoId(`sugestao-${id}`);
      await api.post(`/sugestoes/${id}/aprovar`);
      await carregarTudo();
    } catch (err) {
      alert(extrairMensagemErro(err, "Não foi possível aprovar esta sugestão."));
    } finally {
      setProcessandoId(null);
    }
  }

  async function rejeitarSugestao(id: number) {
    const motivo = window.prompt("Motivo da rejeição:");
    if (!motivo) return;

    try {
      setProcessandoId(`sugestao-${id}`);
      await api.post(`/sugestoes/${id}/rejeitar`, { motivo });
      await carregarTudo();
    } catch (err) {
      alert(extrairMensagemErro(err, "Não foi possível rejeitar esta sugestão."));
    } finally {
      setProcessandoId(null);
    }
  }

  async function aprovarVerificacao(id: number) {
    try {
      setProcessandoId(`verificacao-${id}`);
      await api.post(`/verificacoes/${id}/aprovar`);
      await carregarTudo();
    } catch (err) {
      alert(extrairMensagemErro(err, "Não foi possível aprovar esta solicitação."));
    } finally {
      setProcessandoId(null);
    }
  }

  async function rejeitarVerificacao(id: number) {
    const motivo = window.prompt("Motivo da rejeição:");
    if (!motivo) return;

    try {
      setProcessandoId(`verificacao-${id}`);
      await api.post(`/verificacoes/${id}/rejeitar`, { motivo });
      await carregarTudo();
    } catch (err) {
      alert(extrairMensagemErro(err, "Não foi possível rejeitar esta solicitação."));
    } finally {
      setProcessandoId(null);
    }
  }

  async function aprovarAvaliacao(id: number) {
    try {
      setProcessandoId(`avaliacao-${id}`);
      await api.post(`/avaliacoes/${id}/aprovar`);
      await carregarTudo();
    } catch (err) {
      alert(extrairMensagemErro(err, "Não foi possível aprovar esta avaliação."));
    } finally {
      setProcessandoId(null);
    }
  }

  async function rejeitarAvaliacao(id: number) {
    const motivo = window.prompt("Motivo da rejeição:");
    if (!motivo) return;

    try {
      setProcessandoId(`avaliacao-${id}`);
      await api.post(`/avaliacoes/${id}/rejeitar`, { motivo });
      await carregarTudo();
    } catch (err) {
      alert(extrairMensagemErro(err, "Não foi possível rejeitar esta avaliação."));
    } finally {
      setProcessandoId(null);
    }
  }

  if (carregando) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem" }}>
        <p>Carregando fila de moderação...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Moderação</h1>

      {erro && (
        <div style={{ border: "1px solid #f87171", backgroundColor: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "1rem" }}>
          {erro}
        </div>
      )}

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Pontos aguardando publicação ({pontos.length})</h2>

        {pontos.length === 0 && <p style={{ color: "#666" }}>Nenhum ponto pendente.</p>}

        <div style={{ display: "grid", gap: "1rem" }}>
          {pontos.map((ponto) => (
            <div key={ponto.id} style={estiloCartao}>
              <Link to={`/pontos/${ponto.id}`} style={{ fontWeight: "bold", color: "inherit" }}>
                {ponto.nome}
              </Link>
              <p style={{ color: "#666", margin: "0.25rem 0 0.75rem" }}>
                {ponto.categoria} • {ponto.cidade} • responsável: {ponto.responsavel?.nome ?? "—"}
              </p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => aprovarPonto(ponto.id)}
                  disabled={processandoId === `ponto-${ponto.id}`}
                  style={estiloBotaoAprovar}
                >
                  Aprovar
                </button>
                <button
                  type="button"
                  onClick={() => rejeitarPonto(ponto.id)}
                  disabled={processandoId === `ponto-${ponto.id}`}
                  style={estiloBotaoRejeitar}
                >
                  Rejeitar
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Sugestões de edição ({sugestoes.length})</h2>

        {sugestoes.length === 0 && <p style={{ color: "#666" }}>Nenhuma sugestão pendente.</p>}

        <div style={{ display: "grid", gap: "1rem" }}>
          {sugestoes.map((sugestao) => (
            <div key={sugestao.id} style={estiloCartao}>
              <p style={{ margin: 0, fontWeight: "bold" }}>
                {sugestao.ponto?.nome} ({sugestao.ponto?.cidade})
              </p>
              <p style={{ color: "#666", margin: "0.25rem 0 0.75rem" }}>
                Sugerido por {sugestao.autor?.nome}
                {sugestao.mensagem ? ` — "${sugestao.mensagem}"` : ""}
              </p>
              <ul style={{ margin: "0 0 0.75rem" }}>
                {Object.entries(sugestao.camposPropostos).map(([campo, valor]) => (
                  <li key={campo}>
                    <strong>{campo}:</strong> {valor}
                  </li>
                ))}
              </ul>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => aprovarSugestao(sugestao.id)}
                  disabled={processandoId === `sugestao-${sugestao.id}`}
                  style={estiloBotaoAprovar}
                >
                  Aprovar
                </button>
                <button
                  type="button"
                  onClick={() => rejeitarSugestao(sugestao.id)}
                  disabled={processandoId === `sugestao-${sugestao.id}`}
                  style={estiloBotaoRejeitar}
                >
                  Rejeitar
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Solicitações de selo verificado ({verificacoes.length})</h2>

        {verificacoes.length === 0 && <p style={{ color: "#666" }}>Nenhuma solicitação pendente.</p>}

        <div style={{ display: "grid", gap: "1rem" }}>
          {verificacoes.map((solicitacao) => (
            <div key={solicitacao.id} style={estiloCartao}>
              <p style={{ margin: 0, fontWeight: "bold" }}>
                {solicitacao.ponto?.nome} ({solicitacao.ponto?.cidade})
              </p>
              <p style={{ color: "#666", margin: "0.25rem 0 0.75rem" }}>
                Solicitado por {solicitacao.solicitante?.nome}
                {solicitacao.comprovacao ? ` — comprovação: ${solicitacao.comprovacao}` : ""}
              </p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => aprovarVerificacao(solicitacao.id)}
                  disabled={processandoId === `verificacao-${solicitacao.id}`}
                  style={estiloBotaoAprovar}
                >
                  Aprovar
                </button>
                <button
                  type="button"
                  onClick={() => rejeitarVerificacao(solicitacao.id)}
                  disabled={processandoId === `verificacao-${solicitacao.id}`}
                  style={estiloBotaoRejeitar}
                >
                  Rejeitar
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Avaliações pendentes ({avaliacoes.length})</h2>

        {avaliacoes.length === 0 && <p style={{ color: "#666" }}>Nenhuma avaliação pendente.</p>}

        <div style={{ display: "grid", gap: "1rem" }}>
          {avaliacoes.map((avaliacao) => (
            <div key={avaliacao.id} style={estiloCartao}>
              <p style={{ margin: 0, fontWeight: "bold" }}>
                {avaliacao.ponto?.nome} ({avaliacao.ponto?.cidade}) — {"★".repeat(avaliacao.nota)}
              </p>
              <p style={{ color: "#666", margin: "0.25rem 0 0.75rem" }}>
                Por {avaliacao.autor?.nome}
                {avaliacao.comentario ? ` — "${avaliacao.comentario}"` : ""}
              </p>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => aprovarAvaliacao(avaliacao.id)}
                  disabled={processandoId === `avaliacao-${avaliacao.id}`}
                  style={estiloBotaoAprovar}
                >
                  Aprovar
                </button>
                <button
                  type="button"
                  onClick={() => rejeitarAvaliacao(avaliacao.id)}
                  disabled={processandoId === `avaliacao-${avaliacao.id}`}
                  style={estiloBotaoRejeitar}
                >
                  Rejeitar
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default Moderacao;
