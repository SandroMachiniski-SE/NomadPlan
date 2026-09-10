import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import type { Roteiro, RespostaRoteiros } from "../types/roteiro";

function Roteiros() {
  const [roteiros, setRoteiros] = useState<Roteiro[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function buscarRoteiros() {
      try {
        setCarregando(true);
        setErro(null);

        const resposta = await api.get<RespostaRoteiros>("/roteiros");

        setRoteiros(resposta.data.dados);
      } catch (err) {
        console.error(err);
        setErro("Nao foi possivel carregar seus roteiros. Verifique se a API esta rodando.");
      } finally {
        setCarregando(false);
      }
    }

    buscarRoteiros();
  }, []);

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Meus roteiros</h1>
      <p>Seus roteiros personalizados aparecerao aqui.</p>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
        <Link
          to="/roteiros/novo"
          style={{
            display: "inline-block",
            padding: "0.5rem 1rem",
            borderRadius: 6,
            backgroundColor: "#2563eb",
            color: "#fff",
            textDecoration: "none",
          }}
        >
          + Novo roteiro
        </Link>

        <Link
          to="/roteiros/gerar"
          style={{
            display: "inline-block",
            padding: "0.5rem 1rem",
            borderRadius: 6,
            border: "1px solid #2563eb",
            color: "#2563eb",
            textDecoration: "none",
          }}
        >
          ✨ Gerar roteiro sugerido
        </Link>
      </div>

      {carregando && <p>Carregando roteiros...</p>}

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

      {!carregando && !erro && roteiros.length === 0 && (
        <div
          style={{
            border: "1px dashed #aaa",
            borderRadius: 8,
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <p>Voce ainda nao tem roteiros cadastrados.</p>
          <p>Clique em "+ Novo roteiro" para comecar a organizar sua viagem.</p>
        </div>
      )}

      {!carregando && !erro && roteiros.length > 0 && (
        <div style={{ display: "grid", gap: "1rem" }}>
          {roteiros.map((roteiro) => (
            <Link
              key={roteiro.id}
              to={`/roteiros/${roteiro.id}`}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: "1.5rem",
                textDecoration: "none",
                color: "inherit",
                display: "block",
              }}
            >
              <h2 style={{ margin: 0 }}>{roteiro.nome}</h2>
              <p style={{ color: "#666", margin: "0.5rem 0 0" }}>{roteiro.cidade}</p>
              {roteiro.descricao && (
                <p style={{ margin: "0.5rem 0 0" }}>{roteiro.descricao}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default Roteiros;
