import { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import { TIPOS_EVENTO_USO, type RespostaUso, type TipoEventoUso } from "../types/admin";
import { extrairMensagemErro } from "../utils/erro";
import Icone from "./Icone";

const ROTULOS: Record<TipoEventoUso, string> = {
  busca: "Buscas",
  roteiro_gerado: "Roteiros gerados",
  roteiro_criado: "Roteiros criados",
  cadastro: "Cadastros",
  login: "Logins",
  avaliacao: "Avaliações",
  ponto_cadastrado: "Pontos cadastrados",
  ponto_salvo: "Pontos salvos",
};

const PERIODOS = [7, 30, 90] as const;

// RF28/RNF26: uso diário da plataforma. Cada linha é um tipo de evento, com uma barra
// por dia; o total do período fica ao lado.
function GraficoUso() {
  const [dias, setDias] = useState<(typeof PERIODOS)[number]>(30);
  const [uso, setUso] = useState<RespostaUso | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setErro(null);

      const resposta = await api.get<RespostaUso>("/admin/metricas/uso", { params: { dias } });
      setUso(resposta.data);
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível carregar o uso diário."));
    }
  }, [dias]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca ao abrir e ao trocar o período
    carregar();
  }, [carregar]);

  async function aoBaixarCsv() {
    try {
      setBaixando(true);

      const resposta = await api.get("/admin/metricas/uso.csv", { params: { dias }, responseType: "blob" });
      const url = URL.createObjectURL(resposta.data as Blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = `uso-nomadplan-${dias}d.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível exportar o CSV."));
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div className="card card--pad stack">
      <div className="cluster spread">
        <div className="segmented" role="group" aria-label="Período">
          {PERIODOS.map((periodo) => (
            <button key={periodo} type="button" aria-pressed={dias === periodo} onClick={() => setDias(periodo)}>
              {periodo} dias
            </button>
          ))}
        </div>

        <button type="button" className="btn btn--outline btn--sm" onClick={aoBaixarCsv} disabled={baixando}>
          <Icone nome="download" />
          {baixando ? "Gerando..." : "Exportar CSV"}
        </button>
      </div>

      {erro && (
        <div className="alert alert--error" role="alert">
          <p>{erro}</p>
        </div>
      )}

      {uso && (
        <ul className="uso">
          {TIPOS_EVENTO_USO.map((tipo) => {
            const valores = uso.serie.map((ponto) => ponto[tipo]);
            const total = valores.reduce((soma, valor) => soma + valor, 0);
            const maximo = Math.max(1, ...valores);

            return (
              <li key={tipo} className="uso__linha">
                <span className="uso__rotulo">{ROTULOS[tipo]}</span>

                <div className="uso__barras" role="img" aria-label={`${ROTULOS[tipo]}: ${total} nos últimos ${uso.dias} dias`}>
                  {uso.serie.map((ponto) => (
                    <span
                      key={ponto.dia}
                      className="uso__barra"
                      style={{ height: `${Math.max(ponto[tipo] > 0 ? 8 : 2, (ponto[tipo] / maximo) * 100)}%` }}
                      title={`${new Date(`${ponto.dia}T12:00:00`).toLocaleDateString("pt-BR")}: ${ponto[tipo]}`}
                      data-vazio={ponto[tipo] === 0}
                    />
                  ))}
                </div>

                <strong className="uso__total">{total}</strong>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default GraficoUso;
