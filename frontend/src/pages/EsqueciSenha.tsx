import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { extrairMensagemErro } from "../utils/erro";
import AuthShell from "../components/AuthShell";

function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    try {
      setEnviando(true);
      await api.post("/auth/esqueci-senha", { email: email.trim() });
      setEnviado(true);
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível processar sua solicitação."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthShell
      titulo="Recuperar senha"
      subtitulo="Informe seu e-mail e enviaremos as instruções para criar uma nova senha."
      rodape={
        <p>
          <Link to="/login">Voltar para o login</Link>
        </p>
      }
    >
      {enviado ? (
        <div className="stack">
          <div className="alert alert--success" role="status">
            <p>
              Se houver uma conta com este e-mail, enviaremos instruções de redefinição em
              instantes.
            </p>
          </div>

          <ul className="auth__dicas">
            <li>Confira também a caixa de spam ou lixo eletrônico.</li>
            <li>O link vale por 15 minutos e só pode ser usado uma vez.</li>
          </ul>

          <button type="button" className="btn btn--outline btn--block" onClick={() => setEnviado(false)}>
            Usar outro e-mail
          </button>
        </div>
      ) : (
        <form onSubmit={aoEnviar} className="form">
          <label className="field">
            <span>E-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="voce@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          {erro && (
            <div className="alert alert--error" role="alert">
              <p>{erro}</p>
            </div>
          )}

          <button type="submit" disabled={enviando} className="btn btn--primary btn--lg btn--block">
            {enviando ? "Enviando..." : "Enviar instruções"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

export default EsqueciSenha;
