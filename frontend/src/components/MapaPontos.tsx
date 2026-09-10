import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import { Link } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import type { Ponto } from "../types/ponto";

// Vite não resolve os ícones padrão do Leaflet a partir do pacote — configuramos
// explicitamente os arquivos importados como assets.
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

interface MapaPontosProps {
  pontos: Ponto[];
  altura?: number;
}

const CENTRO_PADRAO: [number, number] = [-26.3045, -48.8487]; // Joinville

function MapaPontos({ pontos, altura = 420 }: MapaPontosProps) {
  const comCoordenadas = pontos.filter(
    (ponto): ponto is Ponto & { latitude: number; longitude: number } =>
      ponto.latitude !== null && ponto.longitude !== null,
  );

  const centro: [number, number] =
    comCoordenadas.length > 0 ? [comCoordenadas[0].latitude, comCoordenadas[0].longitude] : CENTRO_PADRAO;

  return (
    <div style={{ height: altura, borderRadius: 8, overflow: "hidden" }}>
      <MapContainer center={centro} zoom={comCoordenadas.length === 1 ? 15 : 12} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {comCoordenadas.map((ponto) => (
          <Marker key={ponto.id} position={[ponto.latitude, ponto.longitude]}>
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
