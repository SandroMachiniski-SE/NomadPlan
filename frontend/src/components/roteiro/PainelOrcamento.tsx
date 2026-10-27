import { useState, type FormEvent } from "react";
import api from "../../services/api";
import type { ResumoOrcamentoRoteiro } from "../../types/roteiro";
import { extrairMensagemErro } from "../../utils/erro";
import { formatarMoeda, lerValorEmCentavos } from "../../utils/formatar";
import { rotuloDoDia } from "../../utils/roteiro";

interface PainelOrcamentoProps {
  idRoteiro: number;
  resumo: ResumoOrcamentoRoteiro;
  dataInicio: string | null;
  aoSalvar: () => void | Promise<void>;
}

// Orçamento simples: soma dos custos previstos por dia e no total, comparada ao teto
// de gastos que a pessoa definir.
function PainelOrcamento({ idRoteiro, resumo, dataInicio, aoSalvar }: PainelOrcamentoProps) {
  const [teto, setTeto] = useState(
    resumo.orcamentoCentavos != null ? (resumo.orcamentoCentavos / 100).toFixed(2).replace(".", ",") : "",
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const dias = Object.keys(resumo.porDia)
    .map(Number)
    .sort((a, b) => a - b);
  const estourou = resumo.restanteCentavos !== null && resumo.restanteCentavos < 0;
  const percentual =
    resumo.orcamentoCentavos && resumo.orcamentoCentavos > 0
      ? Math.min(100, Math.round((resumo.totalCentavos / resumo.orcamentoCentavos) * 100))
      : 0;

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();

    const centavos = lerValorEmCentavos(teto);

    if (Number.isNaN(centavos) || (centavos !== null && centavos > 100_000_000)) {
      setErro("Informe um valor válido, como 1500,00.");
      return;
    }

    try {
      setSalvando(true);
      setErro(null);

      await api.patch(`/roteiros/${idRoteiro}/anotacoes`, { orcamentoCentavos: centavos });
      await aoSalvar();
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível salvar o orçamento."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="card card--pad stack" aria-labelledby="titulo-orcamento">
      <h2 id="titulo-orcamento">Orçamento</h2>

      <div className="orcamento__total">
        <span className="muted">Previsto na viagem</span>
        <strong data-testid="orcamento-total">{formatarMoeda(resumo.totalCentavos)}</strong>
      </div>

      {resumo.orcamentoCentavos !== null && (
        <>
          <div
            className={estourou ? "barra barra--estourou" : "barra"}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentual}
            aria-label="Parte do orçamento já prevista"
          >
            <span style={{ width: `${percentual}%` }} />
          </div>

          <p className={estourou ? "orcamento__saldo orcamento__saldo--estourou" : "orcamento__saldo"}>
            {estourou
              ? `Acima do teto em ${formatarMoeda(-(resumo.restanteCentavos ?? 0))}`
              : `Ainda cabem ${formatarMoeda(resumo.restanteCentavos ?? 0)} de ${formatarMoeda(resumo.orcamentoCentavos)}`}
          </p>
        </>
      )}

      {dias.length > 0 && (
        <ul className="orcamento__dias">
          {dias.map((dia) => (
            <li key={dia}>
              <span>{rotuloDoDia(dia, dataInicio)}</span>
              <strong>{formatarMoeda(resumo.porDia[dia])}</strong>
            </li>
          ))}
        </ul>
      )}

      {resumo.paradasSemCusto > 0 && (
        <p className="muted small">
          {resumo.paradasSemCusto} {resumo.paradasSemCusto === 1 ? "parada ainda está" : "paradas ainda estão"} sem custo
          informado. Use &ldquo;Observação e custo&rdquo; em cada parada.
        </p>
      )}

      <form onSubmit={aoEnviar} className="form">
        <label className="field">
          <span>
            Teto de gastos <span className="field__optional">(R$, opcional)</span>
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={teto}
            onChange={(e) => setTeto(e.target.value)}
            placeholder="Ex.: 1500,00"
          />
        </label>

        {erro && (
          <div className="alert alert--error" role="alert">
            <p>{erro}</p>
          </div>
        )}

        <div>
          <button type="submit" className="btn btn--outline btn--sm" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar teto"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default PainelOrcamento;
