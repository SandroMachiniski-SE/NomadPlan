import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import api from "../services/api";
import { useAuth } from "./useAuth";
import { SalvosContext } from "./salvos-context";

// RF10: lista de pontos salvos (favoritos). O conjunto de ids é carregado uma vez por
// sessão para que qualquer card de ponto saiba se deve mostrar o coração preenchido.
export function SalvosProvider({ children }: { children: ReactNode }) {
  const { autenticado } = useAuth();
  const [ids, setIds] = useState<ReadonlySet<number>>(new Set());

  useEffect(() => {
    if (!autenticado) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- limpa os favoritos ao sair da conta
      setIds(new Set());
      return;
    }

    let cancelado = false;

    api
      .get<{ ids: number[] }>("/salvos/ids")
      .then((resposta) => {
        if (!cancelado) setIds(new Set(resposta.data.ids));
      })
      .catch((erro) => console.error("Erro ao carregar pontos salvos:", erro));

    return () => {
      cancelado = true;
    };
  }, [autenticado]);

  const alternar = useCallback(
    async (idPonto: number) => {
      const jaSalvo = ids.has(idPonto);

      if (jaSalvo) {
        await api.delete(`/salvos/${idPonto}`);
      } else {
        await api.post(`/salvos/${idPonto}`);
      }

      setIds((atual) => {
        const proximo = new Set(atual);

        if (jaSalvo) proximo.delete(idPonto);
        else proximo.add(idPonto);

        return proximo;
      });

      return !jaSalvo;
    },
    [ids],
  );

  const valor = useMemo(
    () => ({ ids, estaSalvo: (idPonto: number) => ids.has(idPonto), alternar }),
    [ids, alternar],
  );

  return <SalvosContext.Provider value={valor}>{children}</SalvosContext.Provider>;
}
