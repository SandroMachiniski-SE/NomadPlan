import { Link } from "react-router-dom";
import api from "../services/api";
import type { Ponto } from "../types/ponto";
import { iconeDaCategoria } from "../constants/categorias";
import Icone from "./Icone";

interface PontoCardProps {
  ponto: Ponto;
  compacto?: boolean;
}

function formatarDistancia(metros: number): string {
  if (metros < 1000) {
    return `${Math.round(metros)} m`;
  }

  return `${(metros / 1000).toFixed(1)} km`;
}

function PontoCard({ ponto, compacto = false }: PontoCardProps) {
  return (
    <Link
      to={`/pontos/${ponto.id}`}
      className={compacto ? "card card--interactive ponto-card ponto-card--compacto" : "card card--interactive ponto-card"}
    >
      <div className="ponto-card__capa" data-cat={ponto.categoria}>
        {ponto.imagemUrl ? (
          <img
            src={`${api.defaults.baseURL}${ponto.imagemUrl}`}
            alt=""
            loading="lazy"
            className="ponto-card__imagem"
          />
        ) : (
          <Icone nome={iconeDaCategoria(ponto.categoria)} className="ponto-card__icone" />
        )}

        <span className="ponto-card__categoria">{ponto.categoria}</span>

        {ponto.seloVerificado && (
          <span className="ponto-card__selo" title="Local verificado">
            <Icone nome="verificado" />
            Verificado
          </span>
        )}
      </div>

      <div className="ponto-card__corpo">
        <h3 className="ponto-card__titulo">{ponto.nome}</h3>

        <p className="ponto-card__local">
          <Icone nome="pin" />
          <span>
            {ponto.cidade}
            {ponto.distanciaMetros !== undefined && ` · a ${formatarDistancia(ponto.distanciaMetros)} de você`}
          </span>
        </p>

        {!compacto && ponto.descricao && <p className="ponto-card__descricao">{ponto.descricao}</p>}

        {!compacto && (ponto.faixaPreco || ponto.endereco) && (
          <div className="ponto-card__rodape">
            {ponto.faixaPreco && <span className="badge badge--primary">{ponto.faixaPreco}</span>}
            {ponto.endereco && <span className="ponto-card__endereco">{ponto.endereco}</span>}
          </div>
        )}
      </div>
    </Link>
  );
}

export default PontoCard;
