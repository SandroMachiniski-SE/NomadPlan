import { lazy, Suspense } from "react";
import type { MapaPontosProps } from "./MapaPontos";

// O Leaflet é pesado e só é necessário quando um mapa aparece na tela: o import
// dinâmico tira a biblioteca do pacote inicial.
const MapaPontos = lazy(() => import("./MapaPontos"));

function MapaCarregavel(props: MapaPontosProps) {
  return (
    <Suspense
      fallback={
        <div className="mapa-carregando" style={{ height: props.altura ?? 420 }}>
          <p className="loading">Carregando mapa...</p>
        </div>
      }
    >
      <MapaPontos {...props} />
    </Suspense>
  );
}

export default MapaCarregavel;
