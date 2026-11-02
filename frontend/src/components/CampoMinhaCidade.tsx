import { useState, type KeyboardEvent } from "react";
import { buscarCidadesDoBrasil, cidadePerto, type MunicipioEscolhido } from "../services/cidades";
import { extrairMensagemErro } from "../utils/erro";
import Icone from "./Icone";

interface CampoMinhaCidadeProps {
  valor: MunicipioEscolhido | null;
  aoMudar: (municipio: MunicipioEscolhido | null) => void;
  rotulo?: string;
  /** Texto de apoio abaixo do campo (ex.: a cidade digitada antes, sem município). */
  dica?: string | null;
}

const rotuloDoMunicipio = (m: MunicipioEscolhido) => `${m.cidade}, ${m.uf}`;

// Duas casas decimais (~1 km): basta para achar a cidade e não expõe o endereço.
const arredondar = (coordenada: number) => Math.round(coordenada * 100) / 100;

/**
 * Município onde a pessoa mora (ou de onde sai): busca pelo nome ou pelo GPS do navegador.
 * Só o município é guardado, nunca o ponto exato.
 */
function CampoMinhaCidade({ valor, aoMudar, rotulo = "Onde você mora (opcional)", dica }: CampoMinhaCidadeProps) {
  const [texto, setTexto] = useState("");
  const [opcoes, setOpcoes] = useState<MunicipioEscolhido[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [localizando, setLocalizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function escolher(municipio: MunicipioEscolhido | null) {
    aoMudar(municipio);
    setOpcoes(null);
    setErro(null);
    setTexto("");
  }

  async function buscar() {
    if (texto.trim().length < 2) {
      setErro("Digite ao menos 2 letras do nome da cidade.");
      return;
    }

    setBuscando(true);
    setErro(null);

    try {
      const { dados } = await buscarCidadesDoBrasil(texto.trim());
      const municipios = dados.flatMap((c) =>
        c.codigoIbge !== null && c.uf ? [{ codigoIbge: c.codigoIbge, cidade: c.cidade, uf: c.uf }] : [],
      );

      setOpcoes(municipios);
      if (municipios.length === 0) {
        setErro("Nenhum município encontrado com esse nome.");
      }
    } catch (err) {
      setErro(extrairMensagemErro(err, "Não foi possível buscar a cidade agora."));
    } finally {
      setBuscando(false);
    }
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "Enter") {
      // Enter busca a cidade em vez de enviar o formulário em volta.
      evento.preventDefault();
      void buscar();
    }
  }

  function usarLocalizacao() {
    if (!navigator.geolocation) {
      setErro("Seu navegador não suporta geolocalização.");
      return;
    }

    setLocalizando(true);
    setErro(null);

    navigator.geolocation.getCurrentPosition(
      async (posicao) => {
        try {
          const { codigoIbge, cidade, uf } = await cidadePerto(
            arredondar(posicao.coords.latitude),
            arredondar(posicao.coords.longitude),
          );

          escolher({ codigoIbge, cidade, uf });
        } catch (err) {
          setErro(extrairMensagemErro(err, "Não foi possível descobrir a sua cidade."));
        } finally {
          setLocalizando(false);
        }
      },
      () => {
        setErro("Não foi possível obter sua localização. Verifique a permissão do navegador.");
        setLocalizando(false);
      },
    );
  }

  return (
    <div className="campo-cidade">
      <label className="field">
        <span>{rotulo}</span>
        <input
          type="text"
          maxLength={80}
          value={valor ? rotuloDoMunicipio(valor) : texto}
          onChange={(e) => {
            if (valor) aoMudar(null);
            setTexto(e.target.value);
            setOpcoes(null);
          }}
          onKeyDown={aoTeclar}
          placeholder="Digite e busque, ou use a localização"
          autoComplete="address-level2"
        />
      </label>

      <div className="cluster">
        {!valor && (
          <button type="button" className="btn btn--outline btn--sm" onClick={buscar} disabled={buscando}>
            <Icone nome="busca" />
            {buscando ? "Buscando..." : "Buscar"}
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--sm" onClick={usarLocalizacao} disabled={localizando}>
          <Icone nome="localizar" />
          {localizando ? "Localizando..." : "Usar minha localização"}
        </button>
        {valor && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => escolher(null)}>
            Limpar
          </button>
        )}
      </div>

      {opcoes && opcoes.length > 0 && (
        <ul className="campo-cidade__opcoes" aria-label="Municípios encontrados">
          {opcoes.map((m) => (
            <li key={m.codigoIbge}>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => escolher(m)}>
                {rotuloDoMunicipio(m)}
              </button>
            </li>
          ))}
        </ul>
      )}

      {erro && (
        <p className="field__erro" role="alert">
          {erro}
        </p>
      )}
      {dica && <p className="field__hint">{dica}</p>}
      <p className="field__hint">Usamos só para saber a sua cidade; não guardamos o ponto exato.</p>
    </div>
  );
}

export default CampoMinhaCidade;
