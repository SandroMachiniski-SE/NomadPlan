import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { extrairMensagemErro } from "../utils/erro";

function Registrar() {
  const { registrar } = useAuth();
  const navigate = useNavigate();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [cidadeBase, setCidadeBase] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (senha.length < 8) {
      setErro("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    try {
      setEnviando(true);

      await registrar({
        nome: nome.trim(),
        email: email.trim(),
        senha,
        cidadeBase: cidadeBase.trim() || undefined,
      });

      navigate("/roteiros", { replace: true });
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível criar sua conta. Tente novamente."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Criar conta</h1>

      <form onSubmit={aoEnviar} style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          Nome *
          <input
            type="text"
            required
            maxLength={120}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            style={{ padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </label>

        <label style={{ display: "grid", gap: "0.25rem" }}>
          E-mail *
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </label>

        <label style={{ display: "grid", gap: "0.25rem" }}>
          Senha * (mínimo 8 caracteres)
          <input
            type="password"
            required
            minLength={8}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            style={{ padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </label>

        <label style={{ display: "grid", gap: "0.25rem" }}>
          Cidade base
          <input
            type="text"
            maxLength={120}
            value={cidadeBase}
            onChange={(e) => setCidadeBase(e.target.value)}
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
          {enviando ? "Criando conta..." : "Criar conta"}
        </button>
      </form>

      <p style={{ marginTop: "1rem" }}>
        Já tem conta?{" "}
        <Link to="/login" style={{ color: "#2563eb" }}>
          Entrar
        </Link>
      </p>
    </div>
  );
}

export default Registrar;
