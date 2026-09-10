import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { extrairMensagemErro } from "../utils/erro";

interface RelatorioImportacao {
  total: number;
  sucesso: number;
  falhas: { linha: number; motivo?: string }[];
}

function FerramentasPontos() {
  const [exportando, setExportando] = useState<"csv" | "geojson" | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [relatorio, setRelatorio] = useState<RelatorioImportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function aoExportar(formato: "csv" | "geojson") {
    try {
      setExportando(formato);

      const resposta = await api.get(`/pontos/exportar`, {
        params: { formato },
        responseType: "blob",
      });

      const url = URL.createObjectURL(resposta.data as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pontos.${formato}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível exportar os pontos."));
    } finally {
      setExportando(null);
    }
  }

  async function aoImportar() {
    if (!arquivo) return;

    setErro(null);
    setRelatorio(null);

    try {
      setImportando(true);

      const formData = new FormData();
      formData.append("arquivo", arquivo);

      const resposta = await api.post<RelatorioImportacao>("/pontos/importar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setRelatorio(resposta.data);
      setArquivo(null);
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível importar o arquivo."));
    } finally {
      setImportando(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1rem" }}>
      <Link to="/pontos/meus" style={{ color: "#2563eb", textDecoration: "none" }}>
        Voltar para meus pontos
      </Link>

      <h1 style={{ marginTop: "1rem" }}>Ferramentas de inventário</h1>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Exportar</h2>
        <p style={{ color: "#666" }}>Exporta todos os pontos publicados.</p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={() => aoExportar("csv")}
            disabled={exportando !== null}
            style={{ padding: "0.5rem 1rem", borderRadius: 6, border: "1px solid #2563eb", background: "transparent", color: "#2563eb" }}
          >
            {exportando === "csv" ? "Exportando..." : "Exportar CSV"}
          </button>
          <button
            type="button"
            onClick={() => aoExportar("geojson")}
            disabled={exportando !== null}
            style={{ padding: "0.5rem 1rem", borderRadius: 6, border: "1px solid #2563eb", background: "transparent", color: "#2563eb" }}
          >
            {exportando === "geojson" ? "Exportando..." : "Exportar GeoJSON"}
          </button>
        </div>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Importar</h2>
        <p style={{ color: "#666" }}>
          Envie um CSV com as colunas: nome, categoria, cidade, endereco, latitude, longitude,
          faixaPreco, acessibilidade, siteOficial, telefoneContato, horarioFuncionamento. Os
          pontos entram como rascunho e passam pelo fluxo normal de publicação.
        </p>

        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
        />

        <div style={{ marginTop: "0.75rem" }}>
          <button
            type="button"
            onClick={aoImportar}
            disabled={!arquivo || importando}
            style={{ padding: "0.5rem 1rem", borderRadius: 6, border: "none", backgroundColor: "#2563eb", color: "#fff" }}
          >
            {importando ? "Importando..." : "Importar"}
          </button>
        </div>

        {erro && (
          <div style={{ marginTop: "1rem", border: "1px solid #f87171", backgroundColor: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "1rem" }}>
            {erro}
          </div>
        )}

        {relatorio && (
          <div style={{ marginTop: "1rem", border: "1px solid #ddd", borderRadius: 8, padding: "1rem" }}>
            <p style={{ margin: 0 }}>
              {relatorio.sucesso} de {relatorio.total} linhas importadas com sucesso.
            </p>

            {relatorio.falhas.length > 0 && (
              <>
                <p style={{ marginTop: "0.75rem", marginBottom: "0.25rem", fontWeight: "bold" }}>
                  Linhas com erro:
                </p>
                <ul>
                  {relatorio.falhas.map((falha) => (
                    <li key={falha.linha}>
                      Linha {falha.linha}: {falha.motivo}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export default FerramentasPontos;
