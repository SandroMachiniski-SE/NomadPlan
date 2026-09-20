import { useState, type FormEvent } from "react";
import { useAuth } from "../context/useAuth";
import { extrairMensagemErro } from "../utils/erro";
import { CATEGORIAS_PONTOS, iconeDaCategoria } from "../constants/categorias";
import Icone from "../components/Icone";

const ROTULO_CONTA: Record<string, string> = {
  VISITANTE: "Visitante",
  MORADOR: "Morador",
  NEGOCIO: "Negócio",
  GESTOR: "Gestor",
  MODERADOR: "Moderador",
  ADMIN: "Administrador",
};

function Perfil() {
  const { usuario, atualizarPerfil } = useAuth();

  const [nome, setNome] = useState(usuario?.nome ?? "");
  const [cidadeBase, setCidadeBase] = useState(usuario?.cidadeBase ?? "");
  const [interesses, setInteresses] = useState<string[]>(usuario?.interesses ?? []);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState(false);

  function alternarInteresse(categoria: string) {
    setInteresses((atual) =>
      atual.includes(categoria) ? atual.filter((c) => c !== categoria) : [...atual, categoria],
    );
  }

  if (!usuario) {
    return null;
  }

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setSucesso(false);

    if (nome.trim().length === 0) {
      setErro("O nome não pode ficar em branco.");
      return;
    }

    try {
      setSalvando(true);

      await atualizarPerfil({
        nome: nome.trim(),
        cidadeBase: cidadeBase.trim() || null,
        interesses,
      });

      setSucesso(true);
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível salvar seu perfil."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="container container--narrow page">
      <div className="perfil-topo card card--pad">
        <span className="perfil-topo__avatar" aria-hidden="true">
          {usuario.nome.trim().charAt(0).toUpperCase()}
        </span>

        <div className="stack stack--sm">
          <h1>Meu perfil</h1>
          <p className="muted">{usuario.email}</p>
          <div className="cluster">
            <span className="badge badge--primary">
              {ROTULO_CONTA[usuario.tipoConta] ?? usuario.tipoConta}
            </span>
            <span className="badge badge--accent">
              <Icone nome="estrela" className="icon--fill" />
              {usuario.reputacao} pontos de reputação
            </span>
          </div>
        </div>
      </div>

      {usuario.reputacao >= 5 && (
        <div className="alert alert--success" style={{ marginTop: "1rem" }}>
          <Icone nome="verificado" />
          <p>Com essa reputação, suas sugestões de edição são aplicadas automaticamente.</p>
        </div>
      )}

      <form onSubmit={aoEnviar} className="card form-card form" style={{ marginTop: "1.5rem" }}>
        <div className="form-grid">
          <label className="field">
            <span>Nome</span>
            <input
              type="text"
              maxLength={120}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Cidade base</span>
            <input
              type="text"
              maxLength={120}
              value={cidadeBase}
              onChange={(e) => setCidadeBase(e.target.value)}
            />
          </label>
        </div>

        <fieldset className="field">
          <legend className="field__legenda">
            Interesses <span className="field__hint">usados para sugerir roteiros</span>
          </legend>
          <div className="chips">
            {CATEGORIAS_PONTOS.map((categoria) => (
              <button
                key={categoria}
                type="button"
                className="chip"
                aria-pressed={interesses.includes(categoria)}
                onClick={() => alternarInteresse(categoria)}
              >
                <Icone nome={iconeDaCategoria(categoria)} />
                {categoria}
              </button>
            ))}
          </div>
        </fieldset>

        {erro && (
          <div className="alert alert--error" role="alert">
            <p>{erro}</p>
          </div>
        )}

        {sucesso && (
          <div className="alert alert--success" role="status">
            <Icone nome="check" />
            <p>Perfil atualizado com sucesso.</p>
          </div>
        )}

        <div className="form-actions">
          <button type="submit" disabled={salvando} className="btn btn--primary btn--lg">
            {salvando ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default Perfil;
