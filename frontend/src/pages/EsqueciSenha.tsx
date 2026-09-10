import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { extrairMensagemErro } from "../utils/erro";

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
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Recuperar senha</h1>

      {enviado ? (
        <p>
          Se houver uma conta com este e-mail, enviaremos instruções de
          redefinição em instantes.
        </p>
      ) : (
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
            {enviando ? "Enviando..." : "Enviar instruções"}
          </button>
        </form>
      )}

      <p style={{ marginTop: "1rem" }}>
        <Link to="/login" style={{ color: "#2563eb" }}>
          Voltar para o login
        </Link>
      </p>
    </div>
  );
}

export default EsqueciSenha;
