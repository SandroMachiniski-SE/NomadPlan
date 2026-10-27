import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { extrairMensagemErro } from "../utils/erro";
import Icone from "../components/Icone";

interface RelatorioImportacao {
  total: number;
  sucesso: number;
  falhas: { linha: number; motivo?: string }[];
}

const LIMITE_ARQUIVO_BYTES = 2 * 1024 * 1024;

function baixarArquivo(conteudo: Blob, nome: string) {
  const url = URL.createObjectURL(conteudo);
  const link = document.createElement("a");

  link.href = url;
  link.download = nome;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function FerramentasPontos() {
  const [exportando, setExportando] = useState<"csv" | "geojson" | null>(null);
  const [baixandoModelo, setBaixandoModelo] = useState<"csv" | "geojson" | null>(null);
  const [confirmarDuplicidade, setConfirmarDuplicidade] = useState(false);
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

      baixarArquivo(resposta.data as Blob, `pontos.${formato}`);
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível exportar os pontos."));
    } finally {
      setExportando(null);
    }
  }

  async function aoBaixarModelo(formato: "csv" | "geojson") {
    try {
      setBaixandoModelo(formato);

      const resposta = await api.get(`/pontos/importar/modelo`, {
        params: { formato },
        responseType: "blob",
      });

      baixarArquivo(resposta.data as Blob, `modelo-importacao.${formato}`);
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível baixar o modelo."));
    } finally {
      setBaixandoModelo(null);
    }
  }

  function aoEscolherArquivo(escolhido: File | null) {
    setErro(null);
    setRelatorio(null);

    if (escolhido && escolhido.size > LIMITE_ARQUIVO_BYTES) {
      setErro("O arquivo excede 2 MB. Divida a importação em partes menores.");
      setArquivo(null);
      return;
    }

    setArquivo(escolhido);
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
        params: { confirmarDuplicidade },
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
    <div className="container container--narrow page">
      <Link to="/pontos/meus" className="back-link">
        <Icone nome="voltar" />
        Voltar para meus pontos
      </Link>

      <div className="page-head">
        <div className="page-head__text">
          <h1>Ferramentas de inventário</h1>
          <p className="page-head__sub">
            Exporte o inventário de pontos turísticos ou importe vários de uma só vez.
          </p>
        </div>
      </div>

      <div className="stack stack--lg">
        <section className="card card--pad stack">
          <div>
            <h2>Exportar</h2>
            <p className="muted">Exporta todos os pontos publicados.</p>
          </div>

          <div className="cluster">
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => aoExportar("csv")}
              disabled={exportando !== null}
            >
              <Icone nome="download" />
              {exportando === "csv" ? "Exportando..." : "Exportar CSV"}
            </button>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => aoExportar("geojson")}
              disabled={exportando !== null}
            >
              <Icone nome="download" />
              {exportando === "geojson" ? "Exportando..." : "Exportar GeoJSON"}
            </button>
          </div>
        </section>

        <section className="card card--pad stack">
          <div>
            <h2>Importar</h2>
            <p className="muted">
              Envie um arquivo <strong>CSV</strong> ou <strong>GeoJSON</strong> (até 2 MB). No CSV, use as
              colunas <code>nome</code>, <code>categoria</code>, <code>cidade</code>, <code>endereco</code>,{" "}
              <code>latitude</code>, <code>longitude</code>, <code>faixaPreco</code>,{" "}
              <code>acessibilidade</code>, <code>siteOficial</code>, <code>telefoneContato</code> e{" "}
              <code>horarioFuncionamento</code>. No GeoJSON, cada <em>Feature</em> do tipo ponto vira um
              local e as demais informações vão em <code>properties</code>. Os pontos entram como rascunho
              e passam pelo fluxo normal de publicação.
            </p>
          </div>

          <div className="cluster">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => aoBaixarModelo("csv")}
              disabled={baixandoModelo !== null}
            >
              <Icone nome="download" />
              {baixandoModelo === "csv" ? "Baixando..." : "Modelo CSV"}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => aoBaixarModelo("geojson")}
              disabled={baixandoModelo !== null}
            >
              <Icone nome="download" />
              {baixandoModelo === "geojson" ? "Baixando..." : "Modelo GeoJSON"}
            </button>
          </div>

          <input
            type="file"
            accept=".csv,.geojson,.json,text/csv,application/geo+json,application/json"
            onChange={(e) => aoEscolherArquivo(e.target.files?.[0] ?? null)}
          />

          <label className="checkbox">
            <input
              type="checkbox"
              checked={confirmarDuplicidade}
              onChange={(e) => setConfirmarDuplicidade(e.target.checked)}
            />
            <span>Importar mesmo que pareçam duplicados de pontos já cadastrados</span>
          </label>

          <div>
            <button
              type="button"
              className="btn btn--primary"
              onClick={aoImportar}
              disabled={!arquivo || importando}
            >
              {importando ? "Importando..." : "Importar"}
            </button>
          </div>

          {erro && (
            <div className="alert alert--error" role="alert">
              <p>{erro}</p>
            </div>
          )}

          {relatorio && (
            <div className={relatorio.falhas.length > 0 ? "alert alert--warning" : "alert alert--success"}>
              <div>
                <p>
                  <strong>
                    {relatorio.sucesso} de {relatorio.total} linhas importadas com sucesso.
                  </strong>
                </p>

                {relatorio.falhas.length > 0 && (
                  <>
                    <p className="relatorio__titulo">Linhas com erro:</p>
                    <ul className="relatorio__lista">
                      {relatorio.falhas.map((falha) => (
                        <li key={falha.linha}>
                          Linha {falha.linha}: {falha.motivo}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default FerramentasPontos;
