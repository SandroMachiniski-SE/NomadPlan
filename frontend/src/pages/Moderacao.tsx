import { useCallback, useEffect, useState, type ReactNode } from "react";
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
import Icone from "../components/Icone";
import Estrelas from "../components/Estrelas";

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
      <div className="container page">
        <p className="loading">Carregando fila de moderação...</p>
      </div>
    );
  }

  const total = pontos.length + sugestoes.length + verificacoes.length + avaliacoes.length;

  return (
    <div className="container page">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Moderação</h1>
          <p className="page-head__sub">
            {total === 0
              ? "Tudo em dia — não há itens aguardando revisão."
              : `${total} ${total === 1 ? "item aguarda" : "itens aguardam"} a sua revisão.`}
          </p>
        </div>
      </div>

      {erro && (
        <div className="alert alert--error" role="alert">
          <Icone nome="alerta" />
          <p>{erro}</p>
        </div>
      )}

      <div className="stat-grid">
        <div className="stat">
          <div className="stat__value">{pontos.length}</div>
          <div className="stat__label">Pontos para publicar</div>
        </div>
        <div className="stat">
          <div className="stat__value">{sugestoes.length}</div>
          <div className="stat__label">Sugestões de edição</div>
        </div>
        <div className="stat">
          <div className="stat__value">{verificacoes.length}</div>
          <div className="stat__label">Selos solicitados</div>
        </div>
        <div className="stat">
          <div className="stat__value">{avaliacoes.length}</div>
          <div className="stat__label">Avaliações pendentes</div>
        </div>
      </div>

      <FilaModeracao titulo="Pontos aguardando publicação" quantidade={pontos.length} vazio="Nenhum ponto pendente.">
        {pontos.map((ponto) => (
          <article key={ponto.id} className="card card--pad fila-item">
            <div className="stack stack--sm">
              <h3>
                <Link to={`/pontos/${ponto.id}`}>{ponto.nome}</Link>
              </h3>
              <div className="cluster">
                <span className="badge badge--primary">{ponto.categoria}</span>
                <span className="muted small">
                  {ponto.cidade} · responsável: {ponto.responsavel?.nome ?? "—"}
                </span>
              </div>
            </div>

            <AcoesModeracao
              desabilitado={processandoId === `ponto-${ponto.id}`}
              aoAprovar={() => aprovarPonto(ponto.id)}
              aoRejeitar={() => rejeitarPonto(ponto.id)}
            />
          </article>
        ))}
      </FilaModeracao>

      <FilaModeracao titulo="Sugestões de edição" quantidade={sugestoes.length} vazio="Nenhuma sugestão pendente.">
        {sugestoes.map((sugestao) => (
          <article key={sugestao.id} className="card card--pad fila-item">
            <div className="stack stack--sm">
              <h3>
                {sugestao.ponto?.nome} <span className="muted small">({sugestao.ponto?.cidade})</span>
              </h3>
              <p className="muted small">
                Sugerido por {sugestao.autor?.nome}
                {sugestao.mensagem ? ` — "${sugestao.mensagem}"` : ""}
              </p>
              <ul className="fila-item__campos">
                {Object.entries(sugestao.camposPropostos).map(([campo, valor]) => (
                  <li key={campo}>
                    <strong>{campo}:</strong> {valor}
                  </li>
                ))}
              </ul>
            </div>

            <AcoesModeracao
              desabilitado={processandoId === `sugestao-${sugestao.id}`}
              aoAprovar={() => aprovarSugestao(sugestao.id)}
              aoRejeitar={() => rejeitarSugestao(sugestao.id)}
            />
          </article>
        ))}
      </FilaModeracao>

      <FilaModeracao
        titulo="Solicitações de selo verificado"
        quantidade={verificacoes.length}
        vazio="Nenhuma solicitação pendente."
      >
        {verificacoes.map((solicitacao) => (
          <article key={solicitacao.id} className="card card--pad fila-item">
            <div className="stack stack--sm">
              <h3>
                {solicitacao.ponto?.nome}{" "}
                <span className="muted small">({solicitacao.ponto?.cidade})</span>
              </h3>
              <p className="muted small">
                Solicitado por {solicitacao.solicitante?.nome}
                {solicitacao.comprovacao ? ` — comprovação: ${solicitacao.comprovacao}` : ""}
              </p>
            </div>

            <AcoesModeracao
              desabilitado={processandoId === `verificacao-${solicitacao.id}`}
              aoAprovar={() => aprovarVerificacao(solicitacao.id)}
              aoRejeitar={() => rejeitarVerificacao(solicitacao.id)}
            />
          </article>
        ))}
      </FilaModeracao>

      <FilaModeracao titulo="Avaliações pendentes" quantidade={avaliacoes.length} vazio="Nenhuma avaliação pendente.">
        {avaliacoes.map((avaliacao) => (
          <article key={avaliacao.id} className="card card--pad fila-item">
            <div className="stack stack--sm">
              <h3>
                {avaliacao.ponto?.nome} <span className="muted small">({avaliacao.ponto?.cidade})</span>
              </h3>
              <Estrelas nota={avaliacao.nota} />
              <p className="muted small">
                Por {avaliacao.autor?.nome}
                {avaliacao.comentario ? ` — "${avaliacao.comentario}"` : ""}
              </p>
            </div>

            <AcoesModeracao
              desabilitado={processandoId === `avaliacao-${avaliacao.id}`}
              aoAprovar={() => aprovarAvaliacao(avaliacao.id)}
              aoRejeitar={() => rejeitarAvaliacao(avaliacao.id)}
            />
          </article>
        ))}
      </FilaModeracao>
    </div>
  );
}

interface FilaModeracaoProps {
  titulo: string;
  quantidade: number;
  vazio: string;
  children: ReactNode;
}

function FilaModeracao({ titulo, quantidade, vazio, children }: FilaModeracaoProps) {
  return (
    <section className="section">
      <h2 className="section__title">
        {titulo} <span className="badge badge--primary">{quantidade}</span>
      </h2>

      {quantidade === 0 ? (
        <div className="empty empty--compacto">
          <p>{vazio}</p>
        </div>
      ) : (
        <div className="stack">{children}</div>
      )}
    </section>
  );
}

interface AcoesModeracaoProps {
  desabilitado: boolean;
  aoAprovar: () => void;
  aoRejeitar: () => void;
}

function AcoesModeracao({ desabilitado, aoAprovar, aoRejeitar }: AcoesModeracaoProps) {
  return (
    <div className="cluster">
      <button type="button" className="btn btn--success btn--sm" onClick={aoAprovar} disabled={desabilitado}>
        <Icone nome="check" />
        Aprovar
      </button>
      <button
        type="button"
        className="btn btn--danger-outline btn--sm"
        onClick={aoRejeitar}
        disabled={desabilitado}
      >
        Rejeitar
      </button>
    </div>
  );
}

export default Moderacao;
