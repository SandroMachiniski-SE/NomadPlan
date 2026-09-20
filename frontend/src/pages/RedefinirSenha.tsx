import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../services/api";
import { extrairMensagemErro } from "../utils/erro";
import AuthShell from "../components/AuthShell";

function RedefinirSenha() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [novaSenha, setNovaSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (novaSenha.length < 8) {
      setErro("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }

    try {
      setEnviando(true);
      await api.post("/auth/redefinir-senha", { token, novaSenha });
      navigate("/login", { replace: true });
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível redefinir sua senha."));
    } finally {
      setEnviando(false);
    }
  }

  if (!token) {
    return (
      <AuthShell
        titulo="Redefinir senha"
        rodape={
          <p>
            <Link to="/esqueci-senha">Solicitar redefinição</Link>
          </p>
        }
      >
        <div className="alert alert--error" role="alert">
          <p>Link inválido. Solicite uma nova redefinição de senha.</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell titulo="Redefinir senha" subtitulo="Escolha uma nova senha para acessar sua conta.">
      <form onSubmit={aoEnviar} className="form">
        <label className="field">
          <span>
            Nova senha <span className="field__hint">mínimo de 8 caracteres</span>
          </span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
          />
        </label>

        {erro && (
          <div className="alert alert--error" role="alert">
            <p>{erro}</p>
          </div>
        )}

        <button type="submit" disabled={enviando} className="btn btn--primary btn--lg btn--block">
          {enviando ? "Salvando..." : "Redefinir senha"}
        </button>
      </form>
    </AuthShell>
  );
}

export default RedefinirSenha;
