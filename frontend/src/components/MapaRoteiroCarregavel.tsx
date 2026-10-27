import { lazy, Suspense } from "react";
import type { MapaRoteiroProps } from "./MapaRoteiro";

// Como o mapa de pontos: o Leaflet só é baixado quando um mapa aparece.
const MapaRoteiro = lazy(() => import("./MapaRoteiro"));

function MapaRoteiroCarregavel(props: MapaRoteiroProps) {
  return (
    <Suspense
      fallback={
        <div className="mapa-carregando" style={{ height: props.altura ?? 420 }}>
          <p className="loading">Carregando mapa...</p>
        </div>
      }
    >
      <MapaRoteiro {...props} />
    </Suspense>
  );
}

export default MapaRoteiroCarregavel;
