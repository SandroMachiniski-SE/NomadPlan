import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAuth } from "../context/useAuth";
import api from "../services/api";
import { extrairMensagemErro } from "../utils/erro";

const iconeMarcador = L.divIcon({
  className: "marcador-pin",
  html: '<svg viewBox="0 0 24 32" width="32" height="42" aria-hidden="true"><path d="M12 1C5.9 1 1 5.9 1 12c0 8.4 11 19 11 19s11-10.6 11-19C23 5.9 18.1 1 12 1z" fill="#c2512f" stroke="#ffffff" stroke-width="1.6"/><circle cx="12" cy="12" r="4.4" fill="#ffffff"/></svg>',
  iconSize: [32, 42],
  iconAnchor: [16, 42],
  popupAnchor: [0, -36],
});

export interface PontoNoMapa {
  id: number;
  nome: string;
  categoria: string;
  cidade: string;
  latitude: number | null;
  longitude: number | null;
}

/** Região que a pessoa enquadrou no mapa: centro e o raio até o canto da tela. */
export interface AreaDoMapa {
  latitude: number;
  longitude: number;
  raioKm: number;
}

export interface MapaPontosProps {
  pontos: PontoNoMapa[];
  altura?: number;
  /**
   * Liga o modo de exploração: o mapa fica livre para arrastar e aproximar, com o botão
   * "Buscar nesta área", e os marcadores ganham "Adicionar ao roteiro".
   */
  aoBuscarNestaArea?: (area: AreaDoMapa) => void;
  /** Enquadra o mapa nos pontos sempre que a lista mudar (desligue ao buscar pela área que a pessoa escolheu). */
  ajustarAosPontos?: boolean;
  /** Onde o mapa começa quando ainda não há pontos para enquadrar. */
  vistaInicial?: { centro: [number, number]; zoom: number };
  carregando?: boolean;
}

const CENTRO_PADRAO: [number, number] = [-26.3045, -48.8487]; // Joinville
export const RAIO_MAXIMO_BUSCA_KM = 200;
const RAIO_MINIMO_BUSCA_KM = 0.3;

type PontoComCoordenadas = PontoNoMapa & { latitude: number; longitude: number };

function areaVisivel(mapa: L.Map): AreaDoMapa {
  const centro = mapa.getCenter();
  const raioKm = mapa.distance(centro, mapa.getBounds().getNorthEast()) / 1000;

  return { latitude: centro.lat, longitude: centro.lng, raioKm };
}

const TAMANHO_DA_CELULA_PX = 84;
const ZOOM_SEM_AGRUPAR = 17;

const iconeDoGrupo = (quantidade: number) =>
  L.divIcon({
    className: "marcador-grupo",
    html: `<span>${quantidade}</span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  });

/**
 * Junta pinos que ficariam um por cima do outro. Agrupa por células de tela no zoom atual, então ao
 * aproximar o mapa os grupos se desfazem sozinhos.
 */
function PinosAgrupados({ pontos, explorando }: { pontos: PontoComCoordenadas[]; explorando: boolean }) {
  const mapa = useMap();
  const [zoom, setZoom] = useState(() => mapa.getZoom());

  useMapEvents({ zoomend: () => setZoom(mapa.getZoom()) });

  const grupos = useMemo(() => {
    const celulas = new Map<string, PontoComCoordenadas[]>();

    for (const ponto of pontos) {
      const pixel = mapa.project([ponto.latitude, ponto.longitude], zoom);
      const chave = `${Math.floor(pixel.x / TAMANHO_DA_CELULA_PX)}:${Math.floor(pixel.y / TAMANHO_DA_CELULA_PX)}`;

      celulas.set(chave, [...(celulas.get(chave) ?? []), ponto]);
    }

    return [...celulas.values()];
  }, [pontos, zoom, mapa]);

  return (
    <>
      {grupos.map((grupo) => {
        if (grupo.length === 1) {
          const ponto = grupo[0];

          return (
            <Marker key={ponto.id} position={[ponto.latitude, ponto.longitude]} icon={iconeMarcador}>
              <Popup>
                <BalaoDoPonto ponto={ponto} explorando={explorando} />
              </Popup>
            </Marker>
          );
        }

        const limites = L.latLngBounds(grupo.map((p) => [p.latitude, p.longitude] as [number, number]));
        const centro = limites.getCenter();
        // No zoom máximo, ou com pontos exatamente no mesmo lugar, aproximar não separa: mostra a lista.
        const naoSepara = zoom >= ZOOM_SEM_AGRUPAR || limites.getNorthEast().equals(limites.getSouthWest());
        const chave = grupo.map((p) => p.id).join(",");

        return (
          <Marker
            key={chave}
            position={centro}
            icon={iconeDoGrupo(grupo.length)}
            title={`${grupo.length} lugares: aproxime para ver`}
            eventHandlers={{
              click: () => {
                if (!naoSepara) mapa.fitBounds(limites, { padding: [60, 60], maxZoom: ZOOM_SEM_AGRUPAR });
              },
            }}
          >
            {naoSepara && (
              <Popup>
                <ul className="balao-grupo">
                  {grupo.map((ponto) => (
                    <li key={ponto.id}>
                      <Link to={`/pontos/${ponto.id}`}>{ponto.nome}</Link>
                      <span className="muted small"> · {ponto.categoria}</span>
                    </li>
                  ))}
                </ul>
              </Popup>
            )}
          </Marker>
        );
      })}
    </>
  );
}

/** Enquadra os pontos quando a lista muda, sem fazer o botão de busca achar que a pessoa mexeu no mapa. */
function AjusteAosPontos({
  pontos,
  ativo,
  ignorarMovimentoRef,
}: {
  pontos: PontoComCoordenadas[];
  ativo: boolean;
  ignorarMovimentoRef: { current: boolean };
}) {
  const mapa = useMap();
  const chave = pontos.map((p) => p.id).join(",");

  useEffect(() => {
    if (!ativo || pontos.length === 0) {
      return;
    }

    ignorarMovimentoRef.current = true;

    if (pontos.length === 1) {
      mapa.setView([pontos[0].latitude, pontos[0].longitude], 15, { animate: false });
    } else {
      mapa.fitBounds(L.latLngBounds(pontos.map((p) => [p.latitude, p.longitude] as [number, number])), {
        padding: [40, 40],
        maxZoom: 16,
        animate: false,
      });
    }

    ignorarMovimentoRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, ativo, mapa]);

  return null;
}

function ControleDeBusca({
  aoBuscar,
  ignorarMovimentoRef,
  carregando,
  jaMostraPontos,
}: {
  aoBuscar: (area: AreaDoMapa) => void;
  ignorarMovimentoRef: { current: boolean };
  carregando: boolean;
  /** O mapa já está enquadrado numa busca: o botão só vale depois que a pessoa mexer no mapa. */
  jaMostraPontos: boolean;
}) {
  const mapa = useMap();
  const [movido, setMovido] = useState(!jaMostraPontos);
  const [area, setArea] = useState<AreaDoMapa>(() => areaVisivel(mapa));

  useMapEvents({
    moveend: () => {
      setArea(areaVisivel(mapa));

      if (!ignorarMovimentoRef.current) {
        setMovido(true);
      }
    },
  });

  const aproximar = area.raioKm > RAIO_MAXIMO_BUSCA_KM;

  return (
    <div className="mapa-busca-area">
      <button
        type="button"
        className="btn btn--primary"
        disabled={carregando || aproximar || !movido}
        onClick={() => {
          setMovido(false);
          aoBuscar({ ...area, raioKm: Math.max(RAIO_MINIMO_BUSCA_KM, area.raioKm) });
        }}
      >
        {carregando ? "Buscando..." : aproximar ? "Aproxime o mapa para buscar" : movido ? "Buscar nesta área" : "Mova o mapa para buscar outra área"}
      </button>
    </div>
  );
}

/** Conteúdo do balão do marcador: dados do ponto e, para quem está logado, adicionar a um roteiro. */
function BalaoDoPonto({ ponto, explorando }: { ponto: PontoNoMapa; explorando: boolean }) {
  const { autenticado } = useAuth();
  const [roteiros, setRoteiros] = useState<{ id: number; nome: string }[] | null>(null);
  const [roteiro, setRoteiro] = useState("");
  const [situacao, setSituacao] = useState<"livre" | "enviando" | "adicionado">("livre");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!explorando || !autenticado) {
      return;
    }

    let ativo = true;

    api
      .get<{ dados: { id: number; nome: string }[] }>("/roteiros")
      .then((resposta) => {
        if (ativo) setRoteiros(resposta.data.dados.map((r) => ({ id: r.id, nome: r.nome })));
      })
      .catch(() => {
        if (ativo) setRoteiros([]);
      });

    return () => {
      ativo = false;
    };
  }, [explorando, autenticado]);

  async function adicionar() {
    setSituacao("enviando");
    setErro(null);

    try {
      await api.post(`/roteiros/${roteiro}/itens`, { idPonto: ponto.id });
      setSituacao("adicionado");
    } catch (err) {
      setErro(extrairMensagemErro(err, "Não foi possível adicionar ao roteiro."));
      setSituacao("livre");
    }
  }

  return (
    <div className="balao-ponto">
      <strong>{ponto.nome}</strong>
      <br />
      {ponto.categoria} • {ponto.cidade}
      <br />
      <Link to={`/pontos/${ponto.id}`}>Ver detalhes</Link>

      {explorando && (
        <div className="balao-ponto__roteiro">
          {!autenticado ? (
            <Link to="/login">Entre para adicionar a um roteiro</Link>
          ) : situacao === "adicionado" ? (
            <span>Adicionado ao roteiro.</span>
          ) : roteiros && roteiros.length > 0 ? (
            <>
              <select value={roteiro} onChange={(evento) => setRoteiro(evento.target.value)} aria-label="Roteiro">
                <option value="">Escolha um roteiro</option>
                {roteiros.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nome}
                  </option>
                ))}
              </select>
              <button type="button" className="btn btn--accent" disabled={!roteiro || situacao === "enviando"} onClick={adicionar}>
                {situacao === "enviando" ? "Adicionando..." : "Adicionar ao roteiro"}
              </button>
              {erro && <span className="balao-ponto__erro">{erro}</span>}
            </>
          ) : roteiros ? (
            <Link to="/roteiros/novo">Criar um roteiro</Link>
          ) : null}
        </div>
      )}
    </div>
  );
}

function MapaPontos({
  pontos,
  altura = 420,
  aoBuscarNestaArea,
  ajustarAosPontos = true,
  vistaInicial,
  carregando = false,
}: MapaPontosProps) {
  const ignorarMovimentoRef = useRef(false);
  const explorando = aoBuscarNestaArea !== undefined;
  const comCoordenadas = pontos.filter(
    (ponto): ponto is PontoComCoordenadas => ponto.latitude !== null && ponto.longitude !== null,
  );

  const centro: [number, number] =
    comCoordenadas.length > 0 ? [comCoordenadas[0].latitude, comCoordenadas[0].longitude] : (vistaInicial?.centro ?? CENTRO_PADRAO);
  const zoom = comCoordenadas.length === 1 ? 15 : comCoordenadas.length > 0 ? 12 : (vistaInicial?.zoom ?? 12);

  return (
    <div style={{ height: altura, overflow: "hidden", position: "relative" }}>
      <MapContainer center={centro} zoom={zoom} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {explorando && <AjusteAosPontos pontos={comCoordenadas} ativo={ajustarAosPontos} ignorarMovimentoRef={ignorarMovimentoRef} />}

        {explorando && <ControleDeBusca
            aoBuscar={aoBuscarNestaArea}
            ignorarMovimentoRef={ignorarMovimentoRef}
            carregando={carregando}
            jaMostraPontos={comCoordenadas.length > 0}
          />}

        <PinosAgrupados pontos={comCoordenadas} explorando={explorando} />
      </MapContainer>
    </div>
  );
}

export default MapaPontos;
