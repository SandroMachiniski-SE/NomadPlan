import { useSyncExternalStore } from "react";

// Largura a partir da qual a lista de resultados e o mapa cabem lado a lado.
const CONSULTA = "(min-width: 1100px)";

function assinar(aviso: () => void) {
  const consulta = window.matchMedia(CONSULTA);

  consulta.addEventListener("change", aviso);

  return () => consulta.removeEventListener("change", aviso);
}

/** `true` em telas largas (desktop); acompanha o redimensionamento da janela. */
export function useTelaLarga(): boolean {
  return useSyncExternalStore(
    assinar,
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  );
}
