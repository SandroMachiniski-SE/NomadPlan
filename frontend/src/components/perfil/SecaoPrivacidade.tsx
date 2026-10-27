import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../../services/api";
import { useAuth } from "../../context/useAuth";
import { extrairMensagemErro } from "../../utils/erro";
import Icone from "../Icone";

// LGPD: portabilidade (baixar os dados) e exclusão da conta.
function SecaoPrivacidade() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();

  const [baixando, setBaixando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [senha, setSenha] = useState("");
  const [codigoMfa, setCodigoMfa] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  if (!usuario) {
    return null;
  }

  async function aoBaixarDados() {
    setErro(null);

    try {
      setBaixando(true);

      const resposta = await api.get("/auth/me/dados", { responseType: "blob" });
      const url = URL.createObjectURL(resposta.data as Blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "meus-dados-nomadplan.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível baixar seus dados."));
    } finally {
      setBaixando(false);
    }
  }

  async function aoExcluir(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    try {
      setExcluindo(true);

      await api.delete("/auth/me", {
        data: { senha, ...(usuario?.mfaAtivo ? { codigoMfa: codigoMfa.trim() } : {}) },
      });

      logout();
      navigate("/", { replace: true });
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível excluir a conta."));
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <section className="card card--pad stack" aria-labelledby="titulo-privacidade">
      <div>
        <h2 id="titulo-privacidade">Privacidade e dados</h2>
        <p className="muted">
          Conforme a LGPD, você controla seus dados. Leia a <Link to="/privacidade">Política de Privacidade</Link>.
          {usuario.consentimentoEm && (
            <>
              {" "}
              Aceite registrado em {new Date(usuario.consentimentoEm).toLocaleDateString("pt-BR")}.
            </>
          )}
        </p>
      </div>

      {erro && (
        <div className="alert alert--error" role="alert">
          <p>{erro}</p>
        </div>
      )}

      <div>
        <button type="button" className="btn btn--outline" onClick={aoBaixarDados} disabled={baixando}>
          <Icone nome="download" />
          {baixando ? "Gerando arquivo..." : "Baixar meus dados"}
        </button>
      </div>

      <hr className="divisor" />

      <div className="stack stack--sm">
        <h3>Excluir minha conta</h3>
        <p className="muted">
          Seus dados pessoais serão removidos e a conta encerrada. Esta ação não pode ser desfeita. Pontos e
          contribuições públicas permanecem, sem identificar você.
        </p>

        {!confirmando ? (
          <div>
            <button type="button" className="btn btn--danger-outline" onClick={() => setConfirmando(true)}>
              <Icone nome="lixeira" />
              Excluir conta
            </button>
          </div>
        ) : (
          <form onSubmit={aoExcluir} className="form">
            <label className="field">
              <span>Confirme sua senha</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
              />
            </label>

            {usuario.mfaAtivo && (
              <label className="field">
                <span>Código do aplicativo autenticador</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={codigoMfa}
                  onChange={(e) => setCodigoMfa(e.target.value.replace(/\D/g, ""))}
                />
              </label>
            )}

            <div className="form-actions">
              <button type="submit" className="btn btn--danger" disabled={excluindo}>
                {excluindo ? "Excluindo..." : "Excluir definitivamente"}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setConfirmando(false);
                  setSenha("");
                  setCodigoMfa("");
                  setErro(null);
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}

export default SecaoPrivacidade;
