import { useState, type FormEvent } from "react";
import api from "../../services/api";
import type { ConfiguracaoMfa } from "../../types/usuario";
import { useAuth } from "../../context/useAuth";
import { extrairMensagemErro } from "../../utils/erro";
import Icone from "../Icone";

// RF21: verificação em duas etapas (TOTP). O segredo só passa a valer depois que a
// pessoa prova, digitando um código, que o aplicativo o recebeu corretamente.
function SecaoMfa() {
  const { usuario, definirUsuario } = useAuth();

  const [configuracao, setConfiguracao] = useState<ConfiguracaoMfa | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [desativando, setDesativando] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  if (!usuario) {
    return null;
  }

  async function recarregarUsuario() {
    const resposta = await api.get<typeof usuario>("/auth/me");
    if (resposta.data) definirUsuario(resposta.data);
  }

  async function aoIniciar() {
    setErro(null);
    setMensagem(null);

    try {
      setProcessando(true);

      const resposta = await api.post<ConfiguracaoMfa>("/auth/mfa/configurar");
      const { default: QRCode } = await import("qrcode");

      setQrCode(await QRCode.toDataURL(resposta.data.otpauthUrl, { margin: 1, width: 192 }));
      setConfiguracao(resposta.data);
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível iniciar a configuração."));
    } finally {
      setProcessando(false);
    }
  }

  async function aoAtivar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    try {
      setProcessando(true);

      await api.post("/auth/mfa/ativar", { codigo: codigo.trim() });
      await recarregarUsuario();

      setConfiguracao(null);
      setQrCode(null);
      setCodigo("");
      setMensagem("Verificação em duas etapas ativada. No próximo login pediremos o código do aplicativo.");
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível ativar a verificação."));
    } finally {
      setProcessando(false);
    }
  }

  async function aoDesativar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    try {
      setProcessando(true);

      await api.post("/auth/mfa/desativar", { senha, codigoMfa: codigo.trim() });
      await recarregarUsuario();

      setDesativando(false);
      setSenha("");
      setCodigo("");
      setMensagem("Verificação em duas etapas desativada.");
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível desativar a verificação."));
    } finally {
      setProcessando(false);
    }
  }

  function aoCancelar() {
    setConfiguracao(null);
    setQrCode(null);
    setDesativando(false);
    setCodigo("");
    setSenha("");
    setErro(null);
  }

  return (
    <section className="card card--pad stack" aria-labelledby="titulo-mfa">
      <div className="cluster spread">
        <div>
          <h2 id="titulo-mfa">Verificação em duas etapas</h2>
          <p className="muted">Um código do seu celular, além da senha, protege a conta contra acessos indevidos.</p>
        </div>
        <span className={usuario.mfaAtivo ? "badge badge--success" : "badge"}>
          {usuario.mfaAtivo ? "Ativada" : "Desativada"}
        </span>
      </div>

      {mensagem && (
        <div className="alert alert--success" role="status">
          <Icone nome="check" />
          <p>{mensagem}</p>
        </div>
      )}

      {!usuario.mfaAtivo && !configuracao && (
        <div>
          <button type="button" className="btn btn--outline" onClick={aoIniciar} disabled={processando}>
            <Icone nome="cadeado" />
            {processando ? "Preparando..." : "Ativar verificação em duas etapas"}
          </button>
        </div>
      )}

      {configuracao && (
        <form onSubmit={aoAtivar} className="form mfa-configuracao">
          <ol className="mfa-passos">
            <li>Abra um aplicativo autenticador (Google Authenticator, Microsoft Authenticator, Authy...).</li>
            <li>Leia o QR code abaixo ou digite a chave manualmente.</li>
            <li>Informe o código de 6 números que o aplicativo mostrar.</li>
          </ol>

          <div className="mfa-qr">
            {qrCode && <img src={qrCode} alt="QR code para o aplicativo autenticador" width={192} height={192} />}
            <div>
              <p className="muted small">Chave para digitar manualmente:</p>
              <code className="mfa-chave">{configuracao.segredo}</code>
            </div>
          </div>

          <label className="field">
            <span>Código do aplicativo</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              autoComplete="one-time-code"
              placeholder="000000"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
            />
          </label>

          {erro && (
            <div className="alert alert--error" role="alert">
              <p>{erro}</p>
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn--primary" disabled={processando || codigo.length !== 6}>
              {processando ? "Verificando..." : "Confirmar e ativar"}
            </button>
            <button type="button" className="btn btn--ghost" onClick={aoCancelar}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {usuario.mfaAtivo && !desativando && (
        <div>
          <button type="button" className="btn btn--danger-outline" onClick={() => setDesativando(true)}>
            Desativar
          </button>
        </div>
      )}

      {usuario.mfaAtivo && desativando && (
        <form onSubmit={aoDesativar} className="form">
          <p className="muted">Para desativar, confirme sua senha e o código atual do aplicativo.</p>

          <label className="field">
            <span>Senha</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Código do aplicativo</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              required
              autoComplete="one-time-code"
              placeholder="000000"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
            />
          </label>

          {erro && (
            <div className="alert alert--error" role="alert">
              <p>{erro}</p>
            </div>
          )}

          <div className="form-actions">
            <button type="submit" className="btn btn--danger" disabled={processando}>
              {processando ? "Desativando..." : "Desativar verificação"}
            </button>
            <button type="button" className="btn btn--ghost" onClick={aoCancelar}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

export default SecaoMfa;
