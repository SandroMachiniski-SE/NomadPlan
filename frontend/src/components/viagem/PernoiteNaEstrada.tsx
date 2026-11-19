import { useState } from "react";
import Icone from "../Icone";
import type { CidadeDePernoite } from "../../types/viagem";
import { formatarKm } from "../../utils/viagem";

interface PernoiteNaEstradaProps {
  pernoite: CidadeDePernoite;
  alternativas: CidadeDePernoite[];
  /** idOsm do hotel escolhido; vazio = "Hotel a definir". */
  hotel: string;
  aoEscolherHotel: (idOsm: string) => void;
  aoTrocarCidade: (codigoIbge: number) => void;
  trocando: boolean;
  /** A pessoa descartou a sugestão: a estrada fica, e onde dormir é decidido no caminho. */
  descartada: boolean;
  aoDescartar: (descartar: boolean) => void;
}

const TIPOS_DE_HOSPEDAGEM: Record<string, string> = {
  hotel: "Hotel",
  motel: "Motel",
  guest_house: "Pousada",
  hostel: "Hostel",
  chalet: "Chalé",
  apartment: "Apartamento",
  camp_site: "Camping",
};

const nomeDaCidade = (c: CidadeDePernoite) => (c.uf ? `${c.cidade}/${c.uf}` : c.cidade);

const formatarPopulacao = (habitantes: number) =>
  habitantes >= 1000
    ? `${Math.round(habitantes / 1000).toLocaleString("pt-BR")} mil habitantes`
    : `${habitantes.toLocaleString("pt-BR")} habitantes`;

function resumoDaCidade(c: CidadeDePernoite): string {
  const partes = [`km ${Math.round(c.km)}`, `${Math.round(c.distanciaDoAlvoKm)} km do alvo`];

  if (c.totalHospedagens !== null) partes.push(`${c.totalHospedagens} ${c.totalHospedagens === 1 ? "hospedagem" : "hospedagens"}`);
  if (c.totalAtracoes !== null) partes.push(`${c.totalAtracoes} ${c.totalAtracoes === 1 ? "atração" : "atrações"}`);
  // Hotéis ainda não contados: o porte da cidade explica a sugestão.
  if (c.totalHospedagens === null && c.populacao !== null) partes.push(formatarPopulacao(c.populacao));

  return partes.join(" · ");
}

/** Onde dormir no fim do dia de estrada: a cidade sugerida, o hotel e as alternativas. */
function PernoiteNaEstrada({
  pernoite,
  alternativas,
  hotel,
  aoEscolherHotel,
  aoTrocarCidade,
  trocando,
  descartada,
  aoDescartar,
}: PernoiteNaEstradaProps) {
  const [vendoAlternativas, setVendoAlternativas] = useState(false);
  const proxima = pernoite.proximaOpcao;

  if (descartada) {
    return (
      <div className="card pernoite-estrada stack stack--sm">
        <h4 className="pernoite-estrada__titulo">
          <Icone nome="cama" />
          Pernoite a escolher no caminho
        </h4>
        <p className="muted small">
          Sugestão de pernoite descartada: a viagem e a estrada continuam as mesmas, e onde dormir fica para decidir
          na estrada.
        </p>
        <div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => aoDescartar(false)}>
            Rever a sugestão
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card pernoite-estrada">
      <div className="stack stack--sm">
        <h4 className="pernoite-estrada__titulo">
          <Icone nome="cama" />
          Pernoite em {nomeDaCidade(pernoite)}
        </h4>

        <p className="muted small">
          {pernoite.aDefinir
            ? "Sem hospedagem conhecida por perto: o pernoite fica a definir."
            : resumoDaCidade(pernoite)}
          {pernoite.atracoes.length > 0 && ` · tem: ${pernoite.atracoes.join(", ")}`}
        </p>

        {proxima && (
          <div className="alert alert--warning proposta-pernoite" role="status">
            <div className="stack stack--sm">
              <p>
                Nenhuma hospedagem conhecida perto do alvo deste dia. A próxima adiante fica em {proxima.cidade}/{proxima.uf}
                {proxima.destino ? " (o destino desta perna)" : ""}: seriam {formatarKm(proxima.kmDoDia * 1000)} neste dia,{" "}
                {formatarKm(proxima.excedenteKm * 1000)} além do alvo.
              </p>
              <p className="small">
                Só muda a viagem se você aceitar. Os dados de hospedagem podem estar incompletos e não são reserva.
              </p>
              <div className="cluster">
                <button
                  type="button"
                  className="btn btn--outline btn--sm"
                  disabled={trocando}
                  onClick={() => aoTrocarCidade(proxima.codigoIbge)}
                >
                  Aceitar seguir até {proxima.cidade}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" disabled={trocando} onClick={() => aoDescartar(true)}>
                  Recusar e escolher no caminho
                </button>
              </div>
            </div>
          </div>
        )}

        {pernoite.hospedagens.length > 0 && (
          <label className="field">
            <span>Hotel</span>
            <select
              value={hotel}
              onChange={(e) => aoEscolherHotel(e.target.value)}
              aria-label={`Hotel em ${pernoite.cidade}`}
            >
              <option value="">Hotel a definir</option>
              {pernoite.hospedagens.map((h) => (
                <option key={h.idOsm} value={h.idOsm}>
                  {h.nome}
                  {TIPOS_DE_HOSPEDAGEM[h.tipo] && h.tipo !== "hotel" ? ` (${TIPOS_DE_HOSPEDAGEM[h.tipo]})` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        {alternativas.length > 0 && (
          <div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setVendoAlternativas((aberto) => !aberto)}
              aria-expanded={vendoAlternativas}
              disabled={trocando}
            >
              <Icone nome="historico" />
              Trocar cidade
            </button>

            {vendoAlternativas && (
              <ul className="pernoite-estrada__alternativas">
                {alternativas.map((a) => (
                  <li key={a.codigoIbge ?? a.cidade}>
                    <button
                      type="button"
                      className="btn btn--outline btn--sm"
                      disabled={trocando || a.codigoIbge === null}
                      onClick={() => {
                        setVendoAlternativas(false);
                        if (a.codigoIbge !== null) aoTrocarCidade(a.codigoIbge);
                      }}
                    >
                      {nomeDaCidade(a)}
                    </button>
                    <span className="muted small"> {resumoDaCidade(a)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {!proxima && (
          <div>
            <button type="button" className="btn btn--ghost btn--sm" disabled={trocando} onClick={() => aoDescartar(true)}>
              Descartar sugestão de pernoite
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default PernoiteNaEstrada;
