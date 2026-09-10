import { useState, type FormEvent } from "react";
import { useAuth } from "../context/useAuth";
import { extrairMensagemErro } from "../utils/erro";
import { CATEGORIAS_PONTOS } from "../constants/categorias";

function Perfil() {
  const { usuario, atualizarPerfil } = useAuth();

  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [cidadeBase, setCidadeBase] = useState(usuario?.cidadeBase ?? "");
  const [interesses, setInteresses] = useState<string[]>(usuario?.interesses ?? []);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  function alternarInteresse(categoria: string) {
    setInteresses((atual) =>
      atual.includes(categoria) ? atual.filter((c) => c !== categoria) : [...atual, categoria],
    );
  }

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
        interesses,
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
      <p style={{ color: "#166534" }}>
        Reputação: {usuario.reputacao} pontos
        {usuario.reputacao >= 5 && " — suas sugestões de edição são aplicadas automaticamente"}
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

        <div>
          <p style={{ margin: "0 0 0.5rem" }}>Interesses (usados para sugerir roteiros)</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {CATEGORIAS_PONTOS.map((categoria) => (
              <label
                key={categoria}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  border: "1px solid #ccc",
                  borderRadius: 6,
                  padding: "0.35rem 0.6rem",
                  cursor: "pointer",
                  backgroundColor: interesses.includes(categoria) ? "#dbeafe" : "#fff",
                }}
              >
                <input
                  type="checkbox"
                  checked={interesses.includes(categoria)}
                  onChange={() => alternarInteresse(categoria)}
                />
                {categoria}
              </label>
            ))}
          </div>
        </div>

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
