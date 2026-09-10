import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { extrairMensagemErro } from "../utils/erro";

function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const destino = (location.state as { destino?: string } | null)?.destino ?? "/roteiros";

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
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Entrar</h1>

      <form onSubmit={aoEnviar} style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          E-mail
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </label>

        <label style={{ display: "grid", gap: "0.25rem" }}>
          Senha
          <input
            type="password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            style={{ padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </label>

        {erro && (
          <div
            style={{
              border: "1px solid #f87171",
              backgroundColor: "#fee2e2",
              color: "#991b1b",
              borderRadius: 8,
              padding: "1rem",
            }}
          >
            {erro}
          </div>
        )}

        <button
          type="submit"
          disabled={enviando}
          style={{
            padding: "0.75rem",
            borderRadius: 6,
            border: "none",
            backgroundColor: "#2563eb",
            color: "#fff",
            fontWeight: "bold",
            cursor: enviando ? "not-allowed" : "pointer",
          }}
        >
          {enviando ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <p style={{ marginTop: "1rem" }}>
        <Link to="/esqueci-senha" style={{ color: "#2563eb" }}>
          Esqueci minha senha
        </Link>
      </p>

      <p style={{ marginTop: "0.5rem" }}>
        Não tem conta?{" "}
        <Link to="/registrar" style={{ color: "#2563eb" }}>
          Cadastre-se
        </Link>
      </p>
    </div>
  );
}

export default Login;
