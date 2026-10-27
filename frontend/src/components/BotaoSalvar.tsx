import { useState } from "react";
import { useAuth } from "../context/useAuth";
import { useSalvos } from "../context/useSalvos";
import Icone from "./Icone";

interface BotaoSalvarProps {
  idPonto: number;
  /** "cartao": coração sobre o card. "completo": botão com texto. */
  variante?: "cartao" | "completo";
}

function BotaoSalvar({ idPonto, variante = "cartao" }: BotaoSalvarProps) {
  const { autenticado } = useAuth();
  const { estaSalvo, alternar } = useSalvos();
  const [processando, setProcessando] = useState(false);

  if (!autenticado) {
    return null;
  }

  const salvo = estaSalvo(idPonto);

  async function aoClicar() {
    try {
      setProcessando(true);
      await alternar(idPonto);
    } catch (erro) {
      console.error("Erro ao atualizar pontos salvos:", erro);
    } finally {
      setProcessando(false);
    }
  }

  if (variante === "completo") {
    return (
      <button
        type="button"
        className={salvo ? "btn btn--primary btn--block" : "btn btn--outline btn--block"}
        onClick={aoClicar}
        disabled={processando}
        aria-pressed={salvo}
      >
        <Icone nome="coracao" className={salvo ? "icon--fill" : undefined} />
        {salvo ? "Salvo nos favoritos" : "Salvar nos favoritos"}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={salvo ? "btn-salvar btn-salvar--ativo" : "btn-salvar"}
      onClick={aoClicar}
      disabled={processando}
      aria-pressed={salvo}
      aria-label={salvo ? "Remover dos favoritos" : "Salvar nos favoritos"}
      title={salvo ? "Remover dos favoritos" : "Salvar nos favoritos"}
    >
      <Icone nome="coracao" className={salvo ? "icon--fill" : undefined} />
    </button>
  );
}

export default BotaoSalvar;
