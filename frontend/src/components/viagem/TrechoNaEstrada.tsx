import Icone from "../Icone";
import { formatarDirecao, formatarKm } from "../../utils/viagem";

interface TrechoNaEstradaProps {
  de: string;
  para: string;
  metros: number;
  segundos: number;
  /** Trecho curto dentro de um dia na cidade: chegada no começo do dia ou volta no fim. */
  noDia?: "chegada" | "volta";
}

/** Faixa de um trecho dirigido: "🚗 Joinville/SC → Campinas/SP · 502 km · ~6h10". */
function TrechoNaEstrada({ de, para, metros, segundos, noDia }: TrechoNaEstradaProps) {
  const texto =
    noDia === "chegada" ? `Chegada de ${de}` : noDia === "volta" ? `Volta para ${para}` : `${de} → ${para}`;

  return (
    <p className="dia__viagem dia__viagem--estrada">
      <Icone nome="avancar" />
      <span aria-hidden="true">🚗</span> {texto} · {formatarKm(metros)} · {formatarDirecao(segundos)}
      <span className="muted small"> (tempo de direção, sem paradas)</span>
    </p>
  );
}

export default TrechoNaEstrada;
