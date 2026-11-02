import type { PernaPlanejada } from "../../types/viagem";
import { formatarKm } from "../../utils/viagem";

interface DecisaoDeChegadaProps {
  perna: PernaPlanejada;
  aoDecidir: (esticar: boolean) => void;
  decidindo: boolean;
}

/** O fim da perna está perto: esticar e chegar hoje (o padrão) ou dormir antes. */
function DecisaoDeChegada({ perna, aoDecidir, decidindo }: DecisaoDeChegadaProps) {
  const decisao = perna.decisao!;
  const nome = `decisao-${perna.perna}`;

  return (
    <fieldset className="card decisao-chegada">
      <legend className="field__legenda">Chegada a {perna.para.cidade}/{perna.para.uf}</legend>

      <label className="checkbox">
        <input
          type="radio"
          name={nome}
          checked={decisao.esticar}
          disabled={decidindo}
          onChange={() => aoDecidir(true)}
        />
        <span>Esticar e chegar hoje ({formatarKm(decisao.metrosEsticando)})</span>
      </label>

      <label className="checkbox">
        <input
          type="radio"
          name={nome}
          checked={!decisao.esticar}
          disabled={decidindo}
          onChange={() => aoDecidir(false)}
        />
        <span>Dormir no caminho e chegar amanhã com ~{formatarKm(decisao.metrosNoDiaSeguinte)}</span>
      </label>
    </fieldset>
  );
}

export default DecisaoDeChegada;
