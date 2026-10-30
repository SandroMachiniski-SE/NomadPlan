import { createContext } from "react";

export interface SalvosContextoValor {
  /** Identificadores dos pontos que o usuário logado salvou. */
  ids: ReadonlySet<number>;
  estaSalvo: (idPonto: number) => boolean;
  /** Salva ou remove o ponto; devolve o novo estado. Lança erro se a API falhar. */
  alternar: (idPonto: number) => Promise<boolean>;
}

export const SalvosContext = createContext<SalvosContextoValor | undefined>(undefined);
