import { useState, type FormEvent } from "react";
import { useAuth } from "../context/useAuth";
import { extrairMensagemErro } from "../utils/erro";

function Perfil() {
  const { usuario, atualizarPerfil } = useAuth();

  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [cidadeBase, setCidadeBase] = useState(usuario?.cidadeBase ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  if (!usuario) {
    return null;
  }

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSucesso(false);

    if (nome.trim().length === 0) {
      setErro("O nome não pode ficar em branco.");
      return;
    }

    try {
      setSalvando(true);

      await atualizarPerfil({
        nome: nome.trim(),
        cidadeBase: cidadeBase.trim() || null,
      });

      setSucesso(true);
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível salvar seu perfil."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Meu perfil</h1>

      <p style={{ color: "#666" }}>
        {usuario.email} — conta {usuario.tipoConta.toLowerCase()}
      </p>

      <form onSubmit={aoEnviar} style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          Nome
          <input
            type="text"
            maxLength={120}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
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

        {sucesso && (
          <div
            style={{
              border: "1px solid #86efac",
              backgroundColor: "#dcfce7",
              color: "#166534",
              borderRadius: 8,
              padding: "1rem",
            }}
          >
            Perfil atualizado com sucesso.
          </div>
        )}

        <button
          type="submit"
          disabled={salvando}
          style={{
            padding: "0.75rem",
            borderRadius: 6,
            border: "none",
            backgroundColor: "#2563eb",
            color: "#fff",
            fontWeight: "bold",
            cursor: salvando ? "not-allowed" : "pointer",
          }}
        >
          {salvando ? "Salvando..." : "Salvar alterações"}
        </button>
      </form>
    </div>
  );
}

export default Perfil;
