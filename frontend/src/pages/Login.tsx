import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { extrairMensagemErro } from "../utils/erro";
import AuthShell from "../components/AuthShell";

function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const estadoNavegacao = location.state as { destino?: string; mensagem?: string } | null;
  const destino = estadoNavegacao?.destino ?? "/roteiros";
  const mensagem = estadoNavegacao?.mensagem;

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    try {
      setEnviando(true);
      await login(email.trim(), senha);
      navigate(destino, { replace: true });
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível entrar. Verifique seus dados."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthShell
      titulo="Bem-vindo de volta"
      subtitulo="Entre para acessar seus roteiros e recomendações."
      rodape={
        <p>
          Não tem conta? <Link to="/registrar">Cadastre-se</Link>
        </p>
      }
    >
      <form onSubmit={aoEnviar} className="form">
        {mensagem && (
          <div className="alert alert--success" role="status">
            <p>{mensagem}</p>
          </div>
        )}

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

        <label className="field">
          <span>Senha</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </label>

        {erro && (
          <div className="alert alert--error" role="alert">
            <p>{erro}</p>
          </div>
        )}

        <button type="submit" disabled={enviando} className="btn btn--primary btn--lg btn--block">
          {enviando ? "Entrando..." : "Entrar"}
        </button>

        <Link to="/esqueci-senha" className="auth__link">
          Esqueci minha senha
        </Link>
      </form>
    </AuthShell>
  );
}

export default Login;
