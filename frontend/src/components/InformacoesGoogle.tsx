import { useEffect, useState } from "react";
import api from "../services/api";
import type { InformacoesGoogle as Informacoes, Ponto } from "../types/ponto";
import Icone from "./Icone";

interface Props {
  ponto: Ponto;
  /** Repassa a foto do Google quando o ponto não tem foto própria. */
  aoReceberFoto?: (foto: NonNullable<Informacoes["foto"]>) => void;
}

/**
 * O que o Google Maps sabe do lugar, consultado agora pela API (nada disso é gravado no
 * NomadPlan). Só aparece quando o backend tem a chave do Google configurada.
 */
function InformacoesGoogle({ ponto, aoReceberFoto }: Props) {
  const [info, setInfo] = useState<Informacoes | null>(null);

  useEffect(() => {
    let ativo = true;

    api
      .get<Informacoes | { disponivel: false }>(`/pontos/${ponto.id}/google`)
      .then((resposta) => {
        if (!ativo || !resposta.data.disponivel) return;
        setInfo(resposta.data);
        if (resposta.data.foto) aoReceberFoto?.(resposta.data.foto);
      })
      .catch(() => {
        // Sem Google, a página segue só com os dados abertos.
      });

    return () => {
      ativo = false;
    };
  }, [ponto.id, aoReceberFoto]);

  if (!info) {
    return null;
  }

  const horario = !ponto.horarioFuncionamento ? info.horario : null;
  const telefone = !ponto.telefoneContato ? info.telefone : null;
  const site = !ponto.siteOficial ? info.site : null;
  const acessibilidade = !ponto.acessibilidade ? info.acessibilidade : null;

  return (
    <section className="card card--pad stack stack--sm" aria-labelledby="titulo-google">
      <h2 id="titulo-google" className="ponto-lateral__titulo">
        No Google Maps
      </h2>

      <ul className="meta-list">
        {info.nota !== null && (
          <li className="meta-item">
            <Icone nome="estrela" />
            <div>
              <span className="meta-item__label">Nota no Google</span>
              <span className="meta-item__value">
                {info.nota.toFixed(1).replace(".", ",")}
                {info.totalAvaliacoes !== null && ` (${info.totalAvaliacoes.toLocaleString("pt-BR")} avaliações)`}
              </span>
            </div>
          </li>
        )}

        {horario && (
          <li className="meta-item">
            <Icone nome="relogio" />
            <div>
              <span className="meta-item__label">Horário segundo o Google</span>
              <span className="meta-item__value">{horario}</span>
            </div>
          </li>
        )}

        {acessibilidade && (
          <li className="meta-item">
            <Icone nome="acessibilidade" />
            <div>
              <span className="meta-item__label">Acessibilidade</span>
              <span className="meta-item__value">{acessibilidade}</span>
            </div>
          </li>
        )}

        {telefone && (
          <li className="meta-item">
            <Icone nome="telefone" />
            <div>
              <span className="meta-item__label">Telefone</span>
              <span className="meta-item__value">{telefone}</span>
            </div>
          </li>
        )}

        {site && (
          <li className="meta-item">
            <Icone nome="globo" />
            <div>
              <span className="meta-item__label">Site</span>
              <span className="meta-item__value">
                <a href={site} target="_blank" rel="noreferrer">
                  Acessar site
                </a>
              </span>
            </div>
          </li>
        )}
      </ul>

      <p className="ponto-fonte muted small">
        Informações do{" "}
        {info.urlGoogleMaps ? (
          <a href={info.urlGoogleMaps} target="_blank" rel="noreferrer">
            Google Maps
          </a>
        ) : (
          "Google Maps"
        )}
        , consultadas agora.
      </p>
    </section>
  );
}

export default InformacoesGoogle;
