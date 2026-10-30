import { Link } from "react-router-dom";
import { urlDoArquivo } from "../services/api";
import type { Ponto } from "../types/ponto";
import { iconeDaCategoria } from "../constants/categorias";
import { formatarDistancia } from "../utils/formatar";
import BotaoSalvar from "./BotaoSalvar";
import Icone from "./Icone";

interface PontoCardProps {
  ponto: Ponto;
  compacto?: boolean;
}

const ROTULO_MOTIVO: Record<NonNullable<Ponto["motivoRecomendacao"]>, string> = {
  usuarios_semelhantes: "Quem tem gosto parecido salvou",
  interesses: "Combina com seus interesses",
};

function PontoCard({ ponto, compacto = false }: PontoCardProps) {
  const temNota = ponto.mediaAvaliacao != null && (ponto.totalAvaliacoes ?? 0) > 0;

  return (
    <div className="ponto-card-wrap">
      <Link
        to={`/pontos/${ponto.id}`}
        className={compacto ? "card card--interactive ponto-card ponto-card--compacto" : "card card--interactive ponto-card"}
      >
        <div className="ponto-card__capa" data-cat={ponto.categoria}>
          {ponto.imagemUrl ? (
            <img
              src={urlDoArquivo(ponto.imagemUrl)}
              alt=""
              title={ponto.imagemCredito ?? undefined}
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

          {temNota && (
            <p className="ponto-card__nota" aria-label={`Nota média ${ponto.mediaAvaliacao!.toFixed(1)} de 5`}>
              <Icone nome="estrela" className="icon--fill" />
              <strong>{ponto.mediaAvaliacao!.toFixed(1)}</strong>
              <span className="muted">({ponto.totalAvaliacoes})</span>
            </p>
          )}

          {ponto.motivoRecomendacao && (
            <p className="ponto-card__motivo">{ROTULO_MOTIVO[ponto.motivoRecomendacao]}</p>
          )}

          {!compacto && ponto.descricao && <p className="ponto-card__descricao">{ponto.descricao}</p>}

          {!compacto && (ponto.faixaPreco || ponto.endereco) && (
            <div className="ponto-card__rodape">
              {ponto.faixaPreco && <span className="badge badge--primary">{ponto.faixaPreco}</span>}
              {ponto.endereco && <span className="ponto-card__endereco">{ponto.endereco}</span>}
            </div>
          )}
        </div>
      </Link>

      <BotaoSalvar idPonto={ponto.id} />
    </div>
  );
}

export default PontoCard;
