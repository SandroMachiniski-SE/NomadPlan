import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { extrairMensagemErro } from "../utils/erro";
import AuthShell from "../components/AuthShell";

function Registrar() {
  const { registrar } = useAuth();
  const navigate = useNavigate();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [cidadeBase, setCidadeBase] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (senha.length < 8) {
      setErro("A senha deve ter pelo menos 8 caracteres.");
      return;
    }

    try {
      setEnviando(true);

      await registrar({
        nome: nome.trim(),
        email: email.trim(),
        senha,
        cidadeBase: cidadeBase.trim() || undefined,
      });

      navigate("/roteiros", { replace: true });
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível criar sua conta. Tente novamente."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthShell
      titulo="Crie sua conta"
      subtitulo="Salve roteiros, receba recomendações e avalie os lugares que visitou."
      rodape={
        <p>
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      }
    >
      <form onSubmit={aoEnviar} className="form">
        <label className="field">
          <span>Nome</span>
          <input
            type="text"
            required
            maxLength={120}
            autoComplete="name"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </label>

        <label className="field">
          <span>E-mail</span>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="voce@exemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label className="field">
          <span>
            Senha <span className="field__hint">mínimo de 8 caracteres</span>
          </span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
          />
        </label>

        <label className="field">
          <span>
            Cidade base <span className="field__optional">(opcional)</span>
          </span>
          <input
            type="text"
            maxLength={120}
            value={cidadeBase}
            onChange={(e) => setCidadeBase(e.target.value)}
          />
        </label>

        {erro && (
          <div className="alert alert--error" role="alert">
            <p>{erro}</p>
          </div>
        )}

        <button type="submit" disabled={enviando} className="btn btn--primary btn--lg btn--block">
          {enviando ? "Criando conta..." : "Criar conta"}
        </button>
      </form>
    </AuthShell>
  );
}

export default Registrar;
