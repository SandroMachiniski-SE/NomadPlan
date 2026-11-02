import CampoMinhaCidade from "../CampoMinhaCidade";
import type { OpcoesViagemDeCarro } from "../../utils/viagem";

interface CaixaViagemDeCarroProps {
  valor: OpcoesViagemDeCarro;
  aoMudar: (opcoes: OpcoesViagemDeCarro) => void;
}

/** "Vou de carro saindo de casa": de onde sai e quanto dirigir por dia. */
function CaixaViagemDeCarro({ valor, aoMudar }: CaixaViagemDeCarroProps) {
  const mudar = (mudanca: Partial<OpcoesViagemDeCarro>) => aoMudar({ ...valor, ...mudanca });

  return (
    <fieldset className="field viagem-carro">
      <legend className="field__legenda">Viagem de carro</legend>

      <label className="checkbox">
        <input type="checkbox" checked={valor.ativa} onChange={(e) => mudar({ ativa: e.target.checked })} />
        <span>Vou de carro saindo de casa</span>
      </label>

      {valor.ativa && (
        <div className="stack">
          <CampoMinhaCidade rotulo="Saindo de" valor={valor.origem} aoMudar={(origem) => mudar({ origem })} />

          <div className="form-grid">
            <label className="field">
              <span>Alvo por dia (km)</span>
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={valor.kmPorDia}
                onChange={(e) => mudar({ kmPorDia: e.target.value })}
              />
              <span className="field__hint">O pernoite é procurado 50 km antes ou depois do alvo.</span>
            </label>

            <label className="field">
              <span>
                No máximo (horas ao volante) <span className="field__optional">(opcional)</span>
              </span>
              <input
                type="text"
                inputMode="decimal"
                maxLength={4}
                value={valor.horasPorDia}
                onChange={(e) => mudar({ horasPorDia: e.target.value })}
                placeholder="ex.: 7"
              />
              <span className="field__hint">O dia termina no limite que chegar primeiro.</span>
            </label>
          </div>
        </div>
      )}
    </fieldset>
  );
}

export default CaixaViagemDeCarro;
