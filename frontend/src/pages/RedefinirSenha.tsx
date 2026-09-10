import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api from "../services/api";
import { extrairMensagemErro } from "../utils/erro";

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
      <div style={{ maxWidth: 420, margin: "0 auto", padding: "2rem 1rem" }}>
        <h1>Redefinir senha</h1>
        <p>Link inválido. Solicite uma nova redefinição de senha.</p>
        <Link to="/esqueci-senha" style={{ color: "#2563eb" }}>
          Solicitar redefinição
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Redefinir senha</h1>

      <form onSubmit={aoEnviar} style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          Nova senha (mínimo 8 caracteres)
          <input
            type="password"
            required
            minLength={8}
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
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
          {enviando ? "Salvando..." : "Redefinir senha"}
        </button>
      </form>
    </div>
  );
}

export default RedefinirSenha;
