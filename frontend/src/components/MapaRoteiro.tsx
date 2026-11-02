import { useEffect } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { corDoDia } from "../utils/roteiro";

export interface ParadaNoMapa {
  idPonto: number;
  nome: string;
  categoria: string;
  dia: number;
  /** Posição da parada dentro do seu dia (1, 2, 3...). */
  numero: number;
  latitude: number | null;
  longitude: number | null;
  /** Onde se dorme no fim do dia: marcador com uma cama, fechando o trajeto do dia. */
  pernoite?: boolean;
}

export interface MapaRoteiroProps {
  paradas: ParadaNoMapa[];
  altura?: number;
  /** Mostra só este dia; sem valor, todos os dias. */
  dia?: number | null;
  /** Se verdadeiro, o popup liga para a página do ponto (rotas públicas também têm). */
  comLinks?: boolean;
  /** Viagem de carro: a estrada de cada dia ([lat, lon]) e onde se dorme no fim dela. */
  estradas?: EstradaNoMapa[];
}

export interface EstradaNoMapa {
  dia: number;
  tracado: [number, number][];
  pernoite: string | null;
}

function iconeNumerado(rotulo: number | string, cor: string) {
  return L.divIcon({
    className: "marcador-numerado",
    html: `<span style="background:${cor}">${rotulo}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
  });
}

// Reenquadra o mapa quando as paradas mudam (ao trocar de dia, mover ou otimizar).
function Enquadrar({ pontos }: { pontos: [number, number][] }) {
  const mapa = useMap();
  const chave = pontos.map((p) => p.join(",")).join("|");

  useEffect(() => {
    if (pontos.length === 0) return;

    if (pontos.length === 1) {
      mapa.setView(pontos[0], 15);
      return;
    }

    mapa.fitBounds(L.latLngBounds(pontos), { padding: [30, 30], maxZoom: 16 });
    // A chave resume o conteúdo de `pontos`; o array em si é novo a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, mapa]);

  return null;
}

type Localizada = ParadaNoMapa & { latitude: number; longitude: number };

const CENTRO_PADRAO: [number, number] = [-26.3045, -48.8487];

function MapaRoteiro({ paradas, altura = 420, dia = null, comLinks = true, estradas = [] }: MapaRoteiroProps) {
  const visiveis = paradas.filter(
    (p): p is Localizada => p.latitude !== null && p.longitude !== null && (dia === null || p.dia === dia),
  );
  const estradasVisiveis = estradas.filter((e) => e.tracado.length > 1 && (dia === null || e.dia === dia));

  const dias = [...new Set(visiveis.map((p) => p.dia))].sort((a, b) => a - b);
  const todas: [number, number][] = [
    ...visiveis.map((p): [number, number] => [p.latitude, p.longitude]),
    // Começo e fim de cada estrada bastam para enquadrar a viagem.
    ...estradasVisiveis.flatMap((e) => [e.tracado[0], e.tracado[e.tracado.length - 1]]),
  ];

  return (
    <div style={{ height: altura, overflow: "hidden" }}>
      <MapContainer center={todas[0] ?? CENTRO_PADRAO} zoom={12} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Enquadrar pontos={todas} />

        {dias.map((d) => {
          const doDia = visiveis.filter((p) => p.dia === d).sort((a, b) => a.numero - b.numero);

          // Um dia com uma só parada não tem trajeto a desenhar.
          if (doDia.length < 2) return null;

          return (
            <Polyline
              key={`trajeto-${d}`}
              positions={doDia.map((p) => [p.latitude, p.longitude] as [number, number])}
              pathOptions={{ color: corDoDia(d), weight: 4, opacity: 0.8, dashArray: "8 8" }}
            />
          );
        })}

        {estradasVisiveis.map((e) => (
          <Polyline
            key={`estrada-${e.dia}-${e.tracado[0].join(",")}`}
            positions={e.tracado}
            pathOptions={{ color: corDoDia(e.dia), weight: 5, opacity: 0.85 }}
          />
        ))}

        {estradasVisiveis
          .filter((e) => e.pernoite)
          .map((e) => (
            <Marker key={`pernoite-${e.dia}`} position={e.tracado[e.tracado.length - 1]} icon={iconeNumerado("🛏", corDoDia(e.dia))}>
              <Popup>
                <strong>Pernoite em {e.pernoite}</strong>
                <br />
                Dia {e.dia} · fim do dia de estrada
              </Popup>
            </Marker>
          ))}

        {visiveis.map((p) => (
          <Marker
            key={`${p.dia}-${p.idPonto}`}
            position={[p.latitude, p.longitude]}
            icon={iconeNumerado(p.pernoite ? "🛏" : p.numero, corDoDia(p.dia))}
          >
            <Popup>
              <strong>
                {p.pernoite ? "Pernoite: " : `${p.numero}. `}
                {p.nome}
              </strong>
              <br />
              Dia {p.dia} · {p.categoria}
              {comLinks && (
                <>
                  <br />
                  <Link to={`/pontos/${p.idPonto}`}>Ver detalhes</Link>
                </>
              )}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

export default MapaRoteiro;
