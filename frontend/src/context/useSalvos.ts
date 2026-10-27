import { useContext } from "react";
import { SalvosContext, type SalvosContextoValor } from "./salvos-context";

export function useSalvos(): SalvosContextoValor {
  const contexto = useContext(SalvosContext);

  if (!contexto) {
    throw new Error("useSalvos deve ser usado dentro de um SalvosProvider.");
  }

  return contexto;
}
