import { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import type { LogAuditoria, Metricas, UsuarioAdmin } from "../types/admin";
import type { TipoConta } from "../types/usuario";
import { extrairMensagemErro } from "../utils/erro";

const PAPEIS: TipoConta[] = ["VISITANTE", "MORADOR", "NEGOCIO", "GESTOR", "MODERADOR", "ADMIN"];

const estiloCartao = { border: "1px solid #ddd", borderRadius: 8, padding: "1rem" };

function Admin() {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[]>([]);
  const [logs, setLogs] = useState<LogAuditoria[]>([]);
  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [alterandoId, setAlterandoId] = useState<number | null>(null);

  const carregarTudo = useCallback(async () => {
    try {
      setCarregando(true);
      setErro(null);

      const [respostaUsuarios, respostaLogs, respostaMetricas] = await Promise.all([
        api.get<{ dados: UsuarioAdmin[] }>("/admin/usuarios"),
        api.get<{ dados: LogAuditoria[] }>("/admin/auditoria"),
        api.get<Metricas>("/admin/metricas"),
      ]);

      setUsuarios(respostaUsuarios.data.dados);
      setLogs(respostaLogs.data.dados);
      setMetricas(respostaMetricas.data);
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível carregar o painel administrativo."));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial ao montar o componente
    carregarTudo();
  }, [carregarTudo]);

  async function aoAlterarPapel(id: number, tipoConta: TipoConta) {
    try {
      setAlterandoId(id);
      await api.patch(`/admin/usuarios/${id}/papel`, { tipoConta });
      await carregarTudo();
    } catch (err) {
      alert(extrairMensagemErro(err, "Não foi possível alterar o papel deste usuário."));
    } finally {
      setAlterandoId(null);
    }
  }

  if (carregando) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem" }}>
        <p>Carregando painel administrativo...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Administração</h1>

      {erro && (
        <div style={{ border: "1px solid #f87171", backgroundColor: "#fee2e2", color: "#991b1b", borderRadius: 8, padding: "1rem" }}>
          {erro}
        </div>
      )}

      {metricas && (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>Métricas de uso</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.75rem" }}>
            <div style={estiloCartao}><strong>{metricas.totalUsuarios}</strong><p style={{ margin: 0 }}>Usuários</p></div>
            <div style={estiloCartao}><strong>{metricas.pontosPublicados}</strong><p style={{ margin: 0 }}>Pontos publicados</p></div>
            <div style={estiloCartao}><strong>{metricas.totalPontos}</strong><p style={{ margin: 0 }}>Pontos (total)</p></div>
            <div style={estiloCartao}><strong>{metricas.totalRoteiros}</strong><p style={{ margin: 0 }}>Roteiros</p></div>
            <div style={estiloCartao}><strong>{metricas.roteirosPublicos}</strong><p style={{ margin: 0 }}>Roteiros públicos</p></div>
            <div style={estiloCartao}><strong>{metricas.totalAvaliacoes}</strong><p style={{ margin: 0 }}>Avaliações aprovadas</p></div>
            <div style={estiloCartao}><strong>{metricas.totalSugestoesPendentes}</strong><p style={{ margin: 0 }}>Sugestões pendentes</p></div>
            <div style={estiloCartao}><strong>{metricas.totalVerificacoesPendentes}</strong><p style={{ margin: 0 }}>Selos pendentes</p></div>
          </div>
        </section>
      )}

      <section style={{ marginTop: "2rem" }}>
        <h2>Usuários e papéis</h2>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {usuarios.map((usuario) => (
            <div key={usuario.id} style={{ ...estiloCartao, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <strong>{usuario.nome}</strong> — {usuario.email}
                <p style={{ margin: 0, color: "#666", fontSize: "0.85rem" }}>
                  Reputação: {usuario.reputacao}
                </p>
              </div>
              <select
                value={usuario.tipoConta}
                onChange={(e) => aoAlterarPapel(usuario.id, e.target.value as TipoConta)}
                disabled={alterandoId === usuario.id}
                style={{ padding: "0.35rem 0.5rem", borderRadius: 6, border: "1px solid #ccc" }}
              >
                {PAPEIS.map((papel) => (
                  <option key={papel} value={papel}>
                    {papel}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>Log de auditoria (últimas {logs.length} ações)</h2>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          {logs.map((log) => (
            <div key={log.id} style={estiloCartao}>
              <p style={{ margin: 0 }}>
                <strong>{log.acao}</strong> em {log.entidade}
                {log.idEntidade ? ` #${log.idEntidade}` : ""} por {log.usuario?.nome ?? "sistema"}
              </p>
              <p style={{ margin: 0, color: "#666", fontSize: "0.85rem" }}>
                {new Date(log.dataCriacao).toLocaleString("pt-BR")}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default Admin;
