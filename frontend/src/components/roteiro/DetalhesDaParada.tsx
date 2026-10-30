import { useState, type FormEvent } from "react";
import api from "../../services/api";
import type { ItemRoteiro, PeriodoDoDia } from "../../types/roteiro";
import { extrairMensagemErro } from "../../utils/erro";
import { formatarMoeda, lerValorEmCentavos } from "../../utils/formatar";
import { nomeDoItem, ROTULO_PERIODO } from "../../utils/roteiro";
import Icone from "../Icone";

interface DetalhesDaParadaProps {
  idRoteiro: number;
  item: ItemRoteiro;
  /** Chamado depois de salvar, para recarregar o roteiro. */
  aoSalvar: () => void | Promise<void>;
  /** Leitores veem observação e custo, mas não editam. */
  somenteLeitura?: boolean;
}

// Observação, custo previsto e período de uma parada (e o título, se for atividade livre):
// mostra o que há e abre um formulário curto.
function DetalhesDaParada({ idRoteiro, item, aoSalvar, somenteLeitura = false }: DetalhesDaParadaProps) {
  const [editando, setEditando] = useState(false);
  const [observacao, setObservacao] = useState(item.observacao ?? "");
  const [custo, setCusto] = useState(
    item.custoCentavos != null ? (item.custoCentavos / 100).toFixed(2).replace(".", ",") : "",
  );
  const [periodo, setPeriodo] = useState<PeriodoDoDia | "">(item.periodo ?? "");
  const [titulo, setTitulo] = useState(item.titulo ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ehAtividade = item.ponto === null;

  function abrir() {
    setObservacao(item.observacao ?? "");
    setPeriodo(item.periodo ?? "");
    setTitulo(item.titulo ?? "");
    setCusto(item.custoCentavos != null ? (item.custoCentavos / 100).toFixed(2).replace(".", ",") : "");
    setErro(null);
    setEditando(true);
  }

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();

    const custoCentavos = lerValorEmCentavos(custo);

    if (Number.isNaN(custoCentavos) || (custoCentavos !== null && custoCentavos > 100_000_000)) {
      setErro("Informe um valor válido, como 25,90.");
      return;
    }

    if (ehAtividade && !titulo.trim()) {
      setErro("A atividade precisa de um título.");
      return;
    }

    try {
      setSalvando(true);
      setErro(null);

      await api.patch(`/roteiros/${idRoteiro}/itens/${item.id}`, {
        observacao: observacao.trim() || null,
        custoCentavos,
        ...(item.pernoite ? {} : { periodo: periodo || null }),
        ...(ehAtividade ? { titulo: titulo.trim() } : {}),
      });

      setEditando(false);
      await aoSalvar();
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível salvar os detalhes da parada."));
    } finally {
      setSalvando(false);
    }
  }

  if (editando) {
    return (
      <form onSubmit={aoEnviar} className="form detalhes-parada">
        <div className="form-grid">
          {ehAtividade && (
            <label className="field">
              <span>{item.pernoite ? "Onde vai dormir" : "O que fazer"}</span>
              <input type="text" maxLength={160} value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </label>
          )}

          {!item.pernoite && (
            <label className="field">
              <span>Período</span>
              <select
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value as PeriodoDoDia | "")}
                aria-label={`Período de ${nomeDoItem(item)}`}
              >
                <option value="">Sem período</option>
                {(Object.keys(ROTULO_PERIODO) as PeriodoDoDia[]).map((opcao) => (
                  <option key={opcao} value={opcao}>
                    {ROTULO_PERIODO[opcao]}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field">
            <span>
              Observação <span className="field__optional">(opcional)</span>
            </span>
            <input
              type="text"
              maxLength={500}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: reservar mesa, levar documento"
            />
          </label>

          <label className="field">
            <span>
              Custo previsto <span className="field__optional">(R$, opcional)</span>
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={custo}
              onChange={(e) => setCusto(e.target.value)}
              placeholder="0,00"
              aria-label={`Custo previsto de ${nomeDoItem(item)}`}
            />
          </label>
        </div>

        {erro && (
          <div className="alert alert--error" role="alert">
            <p>{erro}</p>
          </div>
        )}

        <div className="form-actions">
          <button type="submit" className="btn btn--primary btn--sm" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditando(false)}>
            Cancelar
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="detalhes-parada">
      {item.observacao && <p className="parada__obs">{item.observacao}</p>}

      <div className="cluster">
        {item.custoCentavos != null && (
          <span className="badge badge--accent" title="Custo previsto desta parada">
            {formatarMoeda(item.custoCentavos)}
          </span>
        )}

        {!somenteLeitura && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={abrir}>
            <Icone nome="editar" />
            {item.observacao || item.custoCentavos != null ? "Editar detalhes" : item.pernoite ? "Observação e custo" : "Período, observação e custo"}
          </button>
        )}
      </div>
    </div>
  );
}

export default DetalhesDaParada;
