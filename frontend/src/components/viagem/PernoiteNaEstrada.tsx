import { useState } from "react";
import Icone from "../Icone";
import type { CidadeDePernoite } from "../../types/viagem";

interface PernoiteNaEstradaProps {
  pernoite: CidadeDePernoite;
  alternativas: CidadeDePernoite[];
  /** idOsm do hotel escolhido; vazio = "Hotel a definir". */
  hotel: string;
  aoEscolherHotel: (idOsm: string) => void;
  aoTrocarCidade: (codigoIbge: number) => void;
  trocando: boolean;
}

const nomeDaCidade = (c: CidadeDePernoite) => (c.uf ? `${c.cidade}/${c.uf}` : c.cidade);

function resumoDaCidade(c: CidadeDePernoite): string {
  const partes = [`km ${Math.round(c.km)}`, `${Math.round(c.distanciaDoAlvoKm)} km do alvo`];

  if (c.totalHospedagens !== null) partes.push(`${c.totalHospedagens} ${c.totalHospedagens === 1 ? "hospedagem" : "hospedagens"}`);
  if (c.totalAtracoes !== null) partes.push(`${c.totalAtracoes} ${c.totalAtracoes === 1 ? "atração" : "atrações"}`);

  return partes.join(" · ");
}

/** Onde dormir no fim do dia de estrada: a cidade sugerida, o hotel e as alternativas. */
function PernoiteNaEstrada({ pernoite, alternativas, hotel, aoEscolherHotel, aoTrocarCidade, trocando }: PernoiteNaEstradaProps) {
  const [vendoAlternativas, setVendoAlternativas] = useState(false);

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
      </div>
    </div>
  );
}

export default PernoiteNaEstrada;
