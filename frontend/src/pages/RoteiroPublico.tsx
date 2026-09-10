import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../services/api";
import type { RoteiroPublico as RoteiroPublicoTipo } from "../types/roteiro";
import MapaPontos from "../components/MapaPontos";

function RoteiroPublico() {
  const { slug } = useParams<{ slug: string }>();

  const [roteiro, setRoteiro] = useState<RoteiroPublicoTipo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    async function buscar() {
      try {
        const resposta = await api.get<RoteiroPublicoTipo>(`/roteiros/publico/${slug}`);
        setRoteiro(resposta.data);
      } catch (err) {
        console.error(err);
        setErro("Este roteiro não existe ou não está mais público.");
      } finally {
        setCarregando(false);
      }
    }

    buscar();
  }, [slug]);

  const itensOrdenados = roteiro ? [...roteiro.itens].sort((a, b) => a.ordem - b.ordem) : [];

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
      {carregando && <p>Carregando roteiro...</p>}

      {erro && <p style={{ color: "red" }}>{erro}</p>}

      {roteiro && (
        <article>
          <h1>{roteiro.nome}</h1>
          <p style={{ color: "#555" }}>
            {roteiro.cidade} • roteiro de {roteiro.usuario.nome}
          </p>

          {roteiro.descricao && <p>{roteiro.descricao}</p>}

          {itensOrdenados.length > 0 && (
            <div style={{ margin: "1.5rem 0" }}>
              <MapaPontos pontos={itensOrdenados.map((item) => item.ponto)} />
            </div>
          )}

          <h2>Pontos do roteiro</h2>

          <div style={{ display: "grid", gap: "1rem" }}>
            {itensOrdenados.map((item, indice) => (
              <div key={item.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem" }}>
                <p style={{ margin: 0, color: "#666", fontSize: "0.85rem" }}>Parada {indice + 1}</p>
                <h3 style={{ margin: "0.25rem 0" }}>{item.ponto.nome}</h3>
                <p style={{ margin: 0, color: "#555" }}>
                  {item.ponto.categoria} • {item.ponto.cidade}
                </p>
                {item.observacao && <p style={{ marginTop: "0.5rem" }}>{item.observacao}</p>}
              </div>
            ))}
          </div>
        </article>
      )}
    </div>
  );
}

export default RoteiroPublico;
