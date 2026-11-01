import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import {
  buscarCidadesDoBrasil,
  consultarPreparoDaCidade,
  prepararCidade,
  type CidadeDaBusca,
  type PreparoDaCidade,
} from "../services/cidades";
import { extrairMensagemErro } from "../utils/erro";
import Icone from "./Icone";

interface EscolherCidadeProps {
  textoInicial?: string;
  /** Chamada quando a cidade escolhida já tem dados e pode ser buscada. */
  aoEscolher: (cidade: string) => void;
  aoFechar: () => void;
}

const INTERVALO_DE_CONSULTA_MS = 3000;

const rotuloDaCidade = (c: CidadeDaBusca) => (c.uf ? `${c.cidade}, ${c.uf}` : c.cidade);

/**
 * Busca qualquer município do Brasil. Os que já têm dados abrem direto; os outros são
 * preparados na hora (os lugares vêm do OpenStreetMap), com o andamento na tela.
 */
function EscolherCidade({ textoInicial = "", aoEscolher, aoFechar }: EscolherCidadeProps) {
  const { autenticado } = useAuth();
  const [texto, setTexto] = useState(textoInicial);
  const [buscando, setBuscando] = useState(false);
  const [cidades, setCidades] = useState<CidadeDaBusca[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [preparando, setPreparando] = useState<{ cidade: CidadeDaBusca; preparo: PreparoDaCidade } | null>(null);
  const aoEscolherRef = useRef(aoEscolher);

  useEffect(() => {
    aoEscolherRef.current = aoEscolher;
  }, [aoEscolher]);

  async function buscar(evento?: FormEvent) {
    evento?.preventDefault();

    if (texto.trim().length < 2) {
      setErro("Digite ao menos 2 letras do nome da cidade.");
      return;
    }

    setBuscando(true);
    setErro(null);
    setAviso(null);

    try {
      const resposta = await buscarCidadesDoBrasil(texto.trim());

      setCidades(resposta.dados);
      if (resposta.semServidorDeMapas) {
        setAviso("A busca de cidades novas está indisponível agora; mostrando só as cidades que já temos.");
      }
    } catch (err) {
      setCidades(null);
      setErro(extrairMensagemErro(err, "Não foi possível buscar cidades agora. Tente novamente."));
    } finally {
      setBuscando(false);
    }
  }

  // Busca sozinho quando o painel abre com o texto que a pessoa já digitou.
  useEffect(() => {
    if (textoInicial.trim().length < 2) {
      return;
    }

    const adiar = window.setTimeout(() => void buscar(), 0);

    return () => window.clearTimeout(adiar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Acompanha a preparação de uma cidade nova.
  useEffect(() => {
    if (!preparando || preparando.preparo.estado !== "preparando" || !preparando.cidade.uf) {
      return;
    }

    const { cidade } = preparando;
    const relogio = window.setInterval(async () => {
      try {
        const preparo = await consultarPreparoDaCidade(cidade.cidade, cidade.uf!);

        setPreparando({ cidade, preparo });

        if (preparo.estado === "pronta") {
          aoEscolherRef.current(cidade.cidade);
        }
      } catch (err) {
        setPreparando({ cidade, preparo: { estado: "erro", erro: extrairMensagemErro(err, "Perdemos o contato com o servidor.") } });
      }
    }, INTERVALO_DE_CONSULTA_MS);

    return () => window.clearInterval(relogio);
  }, [preparando]);

  async function escolher(cidade: CidadeDaBusca) {
    setErro(null);

    if (cidade.disponivel) {
      aoEscolher(cidade.cidade);
      return;
    }

    try {
      const preparo = await prepararCidade(cidade);

      setPreparando({ cidade, preparo });

      if (preparo.estado === "pronta") {
        aoEscolher(cidade.cidade);
      }
    } catch (err) {
      setErro(extrairMensagemErro(err, "Não foi possível preparar esta cidade agora."));
    }
  }

  return (
    <section className="escolher-cidade card card--pad" aria-label="Buscar qualquer cidade do Brasil">
      <div className="escolher-cidade__topo">
        <div>
          <h2>Qualquer cidade do Brasil</h2>
          <p className="muted">
            Digite o nome do município. Se ainda não temos os lugares dele, buscamos no OpenStreetMap para você.
          </p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={aoFechar} aria-label="Fechar busca de cidades">
          <Icone nome="fechar" />
        </button>
      </div>

      <form className="escolher-cidade__form" onSubmit={buscar} role="search">
        <input
          type="text"
          value={texto}
          onChange={(evento) => setTexto(evento.target.value)}
          placeholder="Ex.: Gramado, Paraty, Bonito"
          aria-label="Nome da cidade"
          maxLength={80}
        />
        <button type="submit" className="btn btn--primary" disabled={buscando}>
          {buscando ? "Buscando..." : "Buscar cidade"}
        </button>
      </form>

      {erro && (
        <div className="alert alert--error" role="alert">
          <Icone nome="alerta" />
          <p>{erro}</p>
        </div>
      )}

      {aviso && (
        <div className="alert alert--warning" role="status">
          <Icone nome="info" />
          <p>{aviso}</p>
        </div>
      )}

      {cidades && cidades.length === 0 && !buscando && (
        <p className="muted">Nenhum município encontrado com esse nome. Confira a grafia.</p>
      )}

      {cidades && cidades.length > 0 && (
        <ul className="escolher-cidade__lista">
          {cidades.map((cidade) => {
            const emPreparo = preparando && preparando.cidade.cidade === cidade.cidade && preparando.cidade.uf === cidade.uf;

            return (
              <li key={`${cidade.cidade}-${cidade.uf ?? ""}`}>
                <div>
                  <strong>{rotuloDaCidade(cidade)}</strong>
                  <span className="muted">
                    {cidade.disponivel
                      ? `${cidade.pontos} ${cidade.pontos === 1 ? "lugar" : "lugares"} disponíveis`
                      : "Ainda sem lugares no NomadPlan"}
                  </span>
                </div>

                {emPreparo && preparando.preparo.estado === "preparando" ? (
                  <span className="escolher-cidade__andamento" role="status">
                    {preparando.preparo.etapa ?? "Preparando..."}
                  </span>
                ) : emPreparo && preparando.preparo.estado === "erro" ? (
                  <span className="escolher-cidade__falha" role="alert">
                    {preparando.preparo.erro}
                  </span>
                ) : cidade.disponivel ? (
                  <button type="button" className="btn btn--primary" onClick={() => escolher(cidade)}>
                    Ver lugares
                  </button>
                ) : autenticado ? (
                  <button type="button" className="btn btn--accent" onClick={() => escolher(cidade)}>
                    Carregar esta cidade
                  </button>
                ) : (
                  <Link to="/login" className="btn btn--outline">
                    Entre para carregar
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default EscolherCidade;
