import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Icone from "../Icone";
import { consultarPreparoDaCidade, type PreparoDaCidade } from "../../services/cidades";
import type { PreparoDoDestinoPlanejado } from "../../types/viagem";

interface PreparoDoDestinoProps {
  cidade: string;
  uf: string;
  estadoInicial: PreparoDoDestinoPlanejado["estado"];
  /** Gera a viagem de novo (com as mesmas escolhas) quando a cidade fica pronta. */
  aoGerarDeNovo: () => void;
  /** Enquanto uma geração está em andamento, os botões ficam desligados. */
  desativado?: boolean;
}

const INTERVALO_DE_CONSULTA_MS = 3000;

/** Andamento do preparo de uma cidade de destino que ainda não tinha pontos. */
function PreparoDoDestino({ cidade, uf, estadoInicial, aoGerarDeNovo, desativado = false }: PreparoDoDestinoProps) {
  const [preparo, setPreparo] = useState<PreparoDaCidade | null>(
    estadoInicial === "ocupado" || estadoInicial === "poucos" ? null : { estado: estadoInicial },
  );
  // O servidor reiniciou no meio do preparo (o andamento fica só na memória dele): parar de consultar.
  const [perdido, setPerdido] = useState(false);

  useEffect(() => {
    if (estadoInicial !== "preparando") return;

    let ativo = true;
    let relogio: ReturnType<typeof setTimeout>;

    async function consultar() {
      try {
        const atual = await consultarPreparoDaCidade(cidade, uf);

        if (!ativo) return;
        setPreparo(atual);
        if (atual.estado === "preparando") relogio = setTimeout(consultar, INTERVALO_DE_CONSULTA_MS);
      } catch (err) {
        if (!ativo) return;
        if ((err as { response?: { status?: number } }).response?.status === 404) setPerdido(true);
        else relogio = setTimeout(consultar, INTERVALO_DE_CONSULTA_MS);
      }
    }

    relogio = setTimeout(consultar, INTERVALO_DE_CONSULTA_MS);

    return () => {
      ativo = false;
      clearTimeout(relogio);
    };
  }, [cidade, uf, estadoInicial]);

  return (
    <div className="card preparo-destino" role="status">
      {perdido ? (
        <>
          <p>Perdemos o andamento do preparo de {cidade}. Gere de novo para conferir como a cidade está.</p>
          <button type="button" className="btn btn--outline btn--sm" onClick={aoGerarDeNovo} disabled={desativado}>
            Gerar de novo
          </button>
        </>
      ) : estadoInicial === "poucos" ? (
        <p>
          O OpenStreetMap tem poucos lugares em {cidade}. <Link to="/">Cadastre os que você conhece</Link> pelo mapa
          da busca.
        </p>
      ) : preparo === null ? (
        <>
          <p>Outras cidades estão sendo preparadas agora; {cidade} fica para daqui a pouco.</p>
          <button type="button" className="btn btn--outline btn--sm" onClick={aoGerarDeNovo} disabled={desativado}>
            Tentar de novo
          </button>
        </>
      ) : preparo.estado === "preparando" ? (
        <p className="loading">
          Preparando {cidade}…{preparo.etapa ? ` (${preparo.etapa})` : ""}
        </p>
      ) : preparo.estado === "pronta" ? (
        <>
          <p>
            <Icone nome="check" /> {cidade} está pronta.
          </p>
          <button type="button" className="btn btn--primary btn--sm" onClick={aoGerarDeNovo} disabled={desativado}>
            Gerar de novo
          </button>
        </>
      ) : (
        <p className="field__erro">
          Não foi possível preparar {cidade}
          {preparo.erro ? `: ${preparo.erro}` : " agora."}
        </p>
      )}
    </div>
  );
}

export default PreparoDoDestino;
