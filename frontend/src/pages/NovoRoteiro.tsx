import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../services/api";
import type { Roteiro } from "../types/roteiro";

function NovoRoteiro() {
  const navigate = useNavigate();

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cidade, setCidade] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (nome.trim().length === 0) {
      setErro("O nome do roteiro e obrigatorio.");
      return;
    }

    if (dataInicio && dataFim && dataFim < dataInicio) {
      setErro("A data final nao pode ser anterior a data inicial.");
      return;
    }

    try {
      setEnviando(true);

      const payload = {
        nome: nome.trim(),
        descricao: descricao.trim() || undefined,
        cidade: cidade.trim() || undefined,
        dataInicio: dataInicio || undefined,
        dataFim: dataFim || undefined,
      };

      const resposta = await api.post<Roteiro>("/roteiros", payload);

      navigate(`/roteiros/${resposta.data.id}`);
    } catch (err) {
      console.error(err);
      setErro("Nao foi possivel criar o roteiro. Verifique os dados e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "2rem 1rem" }}>
      <Link to="/roteiros" style={{ color: "#2563eb", textDecoration: "none" }}>
        Voltar para meus roteiros
      </Link>

      <h1 style={{ marginTop: "1rem" }}>Novo roteiro</h1>

      <form onSubmit={aoEnviar} style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          Nome *
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={120}
            style={{ padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </label>

        <label style={{ display: "grid", gap: "0.25rem" }}>
          Cidade
          <input
            type="text"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            maxLength={120}
            style={{ padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </label>

        <label style={{ display: "grid", gap: "0.25rem" }}>
          Descricao
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            maxLength={1000}
            rows={4}
            style={{ padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </label>

        <label style={{ display: "grid", gap: "0.25rem" }}>
          Data de inicio
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            style={{ padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
          />
        </label>

        <label style={{ display: "grid", gap: "0.25rem" }}>
          Data de fim
          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
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
          {enviando ? "Salvando..." : "Criar roteiro"}
        </button>
      </form>
    </div>
  );
}

export default NovoRoteiro;
