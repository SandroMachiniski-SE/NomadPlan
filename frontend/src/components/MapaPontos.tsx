import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

export interface MapaPontosProps {
  pontos: PontoNoMapa[];
  altura?: number;
}

const CENTRO_PADRAO: [number, number] = [-26.3045, -48.8487]; // Joinville

function MapaPontos({ pontos, altura = 420 }: MapaPontosProps) {
  const comCoordenadas = pontos.filter(
    (ponto): ponto is PontoNoMapa & { latitude: number; longitude: number } =>
      ponto.latitude !== null && ponto.longitude !== null,
  );

  const centro: [number, number] =
    comCoordenadas.length > 0 ? [comCoordenadas[0].latitude, comCoordenadas[0].longitude] : CENTRO_PADRAO;

  return (
    <div style={{ height: altura, overflow: "hidden" }}>
      <MapContainer center={centro} zoom={comCoordenadas.length === 1 ? 15 : 12} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {comCoordenadas.map((ponto) => (
          <Marker key={ponto.id} position={[ponto.latitude, ponto.longitude]} icon={iconeMarcador}>
            <Popup>
              <strong>{ponto.nome}</strong>
              <br />
              {ponto.categoria} • {ponto.cidade}
              <br />
              <Link to={`/pontos/${ponto.id}`}>Ver detalhes</Link>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

export default MapaPontos;
