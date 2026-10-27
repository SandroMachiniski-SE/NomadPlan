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
  const [codigoMfa, setCodigoMfa] = useState("");
  const [pedirCodigo, setPedirCodigo] = useState(false);
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

      const resultado = await login(email.trim(), senha, pedirCodigo ? codigoMfa.trim() : undefined);

      if (resultado.mfaNecessario) {
        setPedirCodigo(true);
        return;
      }

      navigate(destino, { replace: true });
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível entrar. Verifique seus dados."));
      setCodigoMfa("");
    } finally {
      setEnviando(false);
    }
  }

  function aoVoltar() {
    setPedirCodigo(false);
    setCodigoMfa("");
    setErro(null);
  }

  return (
    <AuthShell
      titulo={pedirCodigo ? "Verificação em duas etapas" : "Bem-vindo de volta"}
      subtitulo={
        pedirCodigo
          ? "Digite o código de 6 números do seu aplicativo autenticador."
          : "Entre para acessar seus roteiros e recomendações."
      }
      rodape={
        <p>
          Não tem conta? <Link to="/registrar">Cadastre-se</Link>
        </p>
      }
    >
      <form onSubmit={aoEnviar} className="form">
        {mensagem && !pedirCodigo && (
          <div className="alert alert--success" role="status">
            <p>{mensagem}</p>
          </div>
        )}

        {!pedirCodigo ? (
          <>
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
          </>
        ) : (
          <label className="field">
            <span>Código do aplicativo</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              autoFocus
              autoComplete="one-time-code"
              placeholder="000000"
              value={codigoMfa}
              onChange={(e) => setCodigoMfa(e.target.value.replace(/\D/g, ""))}
            />
          </label>
        )}

        {erro && (
          <div className="alert alert--error" role="alert">
            <p>{erro}</p>
          </div>
        )}

        <button type="submit" disabled={enviando} className="btn btn--primary btn--lg btn--block">
          {enviando ? "Entrando..." : pedirCodigo ? "Confirmar" : "Entrar"}
        </button>

        {pedirCodigo ? (
          <button type="button" className="auth__link" onClick={aoVoltar}>
            Voltar
          </button>
        ) : (
          <Link to="/esqueci-senha" className="auth__link">
            Esqueci minha senha
          </Link>
        )}
      </form>
    </AuthShell>
  );
}

export default Login;
