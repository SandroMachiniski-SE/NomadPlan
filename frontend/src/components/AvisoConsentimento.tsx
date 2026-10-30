import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import type { Usuario } from "../types/usuario";
import { useAuth } from "../context/useAuth";
import { extrairMensagemErro } from "../utils/erro";
import Icone from "./Icone";

// LGPD: contas criadas antes da política passam a aceitá-la de forma explícita.
function AvisoConsentimento() {
  const { usuario, definirUsuario } = useAuth();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  if (!usuario || usuario.consentimentoEm) {
    return null;
  }

  async function aoAceitar() {
    try {
      setEnviando(true);
      setErro(null);

      const resposta = await api.post<Usuario>("/auth/consentimento");
      definirUsuario(resposta.data);
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível registrar seu aceite."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="aviso-consentimento" role="region" aria-label="Política de Privacidade">
      <div className="container aviso-consentimento__inner">
        <Icone nome="cadeado" />
        <p>
          Atualizamos nossa <Link to="/privacidade">Política de Privacidade</Link> conforme a LGPD. Para
          continuar usando sua conta, confirme que leu e concorda.
          {erro && <strong className="aviso-consentimento__erro"> {erro}</strong>}
        </p>
        <button type="button" className="btn btn--primary btn--sm" onClick={aoAceitar} disabled={enviando}>
          {enviando ? "Salvando..." : "Li e concordo"}
        </button>
      </div>
    </div>
  );
}

export default AvisoConsentimento;
