import { useCallback, useEffect, useState } from "react";
import api from "../services/api";
import type { LogAuditoria, Metricas, UsuarioAdmin } from "../types/admin";
import type { TipoConta } from "../types/usuario";
import { extrairMensagemErro } from "../utils/erro";
import Icone from "../components/Icone";

const PAPEIS: TipoConta[] = ["VISITANTE", "MORADOR", "NEGOCIO", "GESTOR", "MODERADOR", "ADMIN"];

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
      <div className="container page">
        <p className="loading">Carregando painel administrativo...</p>
      </div>
    );
  }

  const cartoesMetricas = metricas
    ? [
        { valor: metricas.totalUsuarios, rotulo: "Usuários" },
        { valor: metricas.pontosPublicados, rotulo: "Pontos publicados" },
        { valor: metricas.totalPontos, rotulo: "Pontos (total)" },
        { valor: metricas.totalRoteiros, rotulo: "Roteiros" },
        { valor: metricas.roteirosPublicos, rotulo: "Roteiros públicos" },
        { valor: metricas.totalAvaliacoes, rotulo: "Avaliações aprovadas" },
        { valor: metricas.totalSugestoesPendentes, rotulo: "Sugestões pendentes" },
        { valor: metricas.totalVerificacoesPendentes, rotulo: "Selos pendentes" },
      ]
    : [];

  return (
    <div className="container page">
      <div className="page-head">
        <div className="page-head__text">
          <h1>Administração</h1>
          <p className="page-head__sub">
            Acompanhe as métricas da plataforma, gerencie papéis e consulte o log de auditoria.
          </p>
        </div>
      </div>

      {erro && (
        <div className="alert alert--error" role="alert">
          <Icone nome="alerta" />
          <p>{erro}</p>
        </div>
      )}

      {metricas && (
        <section aria-labelledby="titulo-metricas">
          <h2 id="titulo-metricas" className="section__title">
            Métricas de uso
          </h2>
          <div className="stat-grid">
            {cartoesMetricas.map((cartao) => (
              <div key={cartao.rotulo} className="stat">
                <div className="stat__value">{cartao.valor}</div>
                <div className="stat__label">{cartao.rotulo}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="titulo-usuarios">
        <h2 id="titulo-usuarios" className="section__title">
          Usuários e papéis
        </h2>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Reputação</th>
                <th>Papel</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((usuario) => (
                <tr key={usuario.id}>
                  <td>
                    <div className="tabela-usuario">
                      <span className="user-chip__avatar" aria-hidden="true">
                        {usuario.nome.trim().charAt(0).toUpperCase()}
                      </span>
                      <div>
                        <strong>{usuario.nome}</strong>
                        <div className="muted small">{usuario.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>{usuario.reputacao}</td>
                  <td>
                    <select
                      value={usuario.tipoConta}
                      onChange={(e) => aoAlterarPapel(usuario.id, e.target.value as TipoConta)}
                      disabled={alterandoId === usuario.id}
                      aria-label={`Papel de ${usuario.nome}`}
                      className="tabela-select"
                    >
                      {PAPEIS.map((papel) => (
                        <option key={papel} value={papel}>
                          {papel}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="section" aria-labelledby="titulo-auditoria">
        <h2 id="titulo-auditoria" className="section__title">
          Log de auditoria <span className="muted small">(últimas {logs.length} ações)</span>
        </h2>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Ação</th>
                <th>Entidade</th>
                <th>Autor</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>
                    <span className="badge badge--primary">{log.acao}</span>
                  </td>
                  <td>
                    {log.entidade}
                    {log.idEntidade ? ` #${log.idEntidade}` : ""}
                  </td>
                  <td>{log.usuario?.nome ?? "sistema"}</td>
                  <td className="muted small">{new Date(log.dataCriacao).toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default Admin;
