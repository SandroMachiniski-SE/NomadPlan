import { useCallback, useEffect, useState, type FormEvent } from "react";
import api from "../../services/api";
import type { ConviteEnviado, PapelColaborador, Roteiro } from "../../types/roteiro";
import { extrairMensagemErro } from "../../utils/erro";
import { useAuth } from "../../context/useAuth";
import Icone from "../Icone";

interface ColaboradoresProps {
  roteiro: Roteiro;
  /** Recarrega o roteiro depois de uma mudança nos participantes. */
  aoMudar: () => void | Promise<void>;
  /** A pessoa saiu do roteiro: não há mais o que mostrar. */
  aoSair: () => void;
}

const ROTULO_PAPEL: Record<string, string> = { DONO: "Dono", EDITOR: "Editor", LEITOR: "Leitor" };

// Quem participa do roteiro. O dono convida por e-mail e gerencia; os demais veem a lista
// e podem sair.
function Colaboradores({ roteiro, aoMudar, aoSair }: ColaboradoresProps) {
  const { usuario } = useAuth();
  const ehDono = roteiro.meuPapel === "DONO";
  const colaboradores = roteiro.colaboradores ?? [];

  const [convites, setConvites] = useState<ConviteEnviado[]>([]);
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<PapelColaborador>("EDITOR");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const carregarConvites = useCallback(async () => {
    if (!ehDono) return;

    try {
      const resposta = await api.get<{ dados: ConviteEnviado[] }>(`/roteiros/${roteiro.id}/convites`);
      setConvites(resposta.data.dados);
    } catch (err) {
      console.error(err);
    }
  }, [ehDono, roteiro.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca inicial dos convites pendentes
    carregarConvites();
  }, [carregarConvites]);

  async function executar(acao: () => Promise<unknown>, mensagemDeErro: string, depois?: () => void) {
    try {
      setOcupado(true);
      setErro(null);
      setAviso(null);

      await acao();
      depois?.();

      await Promise.all([aoMudar(), carregarConvites()]);
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, mensagemDeErro));
    } finally {
      setOcupado(false);
    }
  }

  function aoConvidar(evento: FormEvent) {
    evento.preventDefault();

    const convidado = email.trim();
    if (!convidado) return;

    executar(
      () => api.post(`/roteiros/${roteiro.id}/convites`, { email: convidado, papel }),
      "Não foi possível enviar o convite.",
      () => {
        setEmail("");
        setAviso(`Convite enviado para ${convidado}. A pessoa precisa aceitar para participar.`);
      },
    );
  }

  function aoSairDoRoteiro() {
    if (!usuario || !window.confirm("Sair deste roteiro? Você perde o acesso a ele.")) return;

    executar(
      () => api.delete(`/roteiros/${roteiro.id}/colaboradores/${usuario.id}`),
      "Não foi possível sair do roteiro.",
      aoSair,
    );
  }

  return (
    <section className="card card--pad stack" aria-labelledby="titulo-participantes">
      <div>
        <h2 id="titulo-participantes">Quem participa</h2>
        <p className="muted small">
          {ehDono
            ? "Convide pessoas para montar o roteiro com você. Editores alteram tudo, menos excluir, compartilhar o link público e gerenciar convidados; leitores só acompanham."
            : "Você participa deste roteiro como " + (ROTULO_PAPEL[roteiro.meuPapel ?? "LEITOR"] ?? "leitor").toLowerCase() + "."}
        </p>
      </div>

      <ul className="participantes">
        <li>
          <span className="user-chip__avatar" aria-hidden="true">
            {(roteiro.usuario?.nome ?? "?").charAt(0).toUpperCase()}
          </span>
          <span className="participantes__nome">{roteiro.usuario?.nome ?? "Dono"}</span>
          <span className="badge badge--primary">Dono</span>
        </li>

        {colaboradores.map((pessoa) => (
          <li key={pessoa.idUsuario}>
            <span className="user-chip__avatar" aria-hidden="true">
              {pessoa.nome.charAt(0).toUpperCase()}
            </span>
            <span className="participantes__nome">
              {pessoa.nome}
              {pessoa.idUsuario === usuario?.id && <span className="muted small"> (você)</span>}
            </span>

            {ehDono ? (
              <>
                <select
                  className="parada__dia"
                  value={pessoa.papel}
                  disabled={ocupado}
                  aria-label={`Papel de ${pessoa.nome}`}
                  onChange={(e) =>
                    executar(
                      () => api.patch(`/roteiros/${roteiro.id}/colaboradores/${pessoa.idUsuario}`, { papel: e.target.value }),
                      "Não foi possível alterar o papel.",
                    )
                  }
                >
                  <option value="EDITOR">Editor</option>
                  <option value="LEITOR">Leitor</option>
                </select>
                <button
                  type="button"
                  className="btn btn--danger-outline btn--sm"
                  disabled={ocupado}
                  onClick={() =>
                    window.confirm(`Remover ${pessoa.nome} do roteiro?`) &&
                    executar(
                      () => api.delete(`/roteiros/${roteiro.id}/colaboradores/${pessoa.idUsuario}`),
                      "Não foi possível remover a pessoa.",
                    )
                  }
                >
                  Remover
                </button>
              </>
            ) : (
              <span className="badge">{ROTULO_PAPEL[pessoa.papel]}</span>
            )}
          </li>
        ))}

        {ehDono &&
          convites.map((convite) => (
            <li key={`convite-${convite.id}`} className="participantes__pendente">
              <span className="user-chip__avatar" aria-hidden="true">
                <Icone nome="relogio" />
              </span>
              <span className="participantes__nome">
                {convite.email} <span className="muted small">· convite pendente</span>
              </span>
              <span className="badge">{ROTULO_PAPEL[convite.papel]}</span>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={ocupado}
                onClick={() =>
                  executar(
                    () => api.delete(`/roteiros/${roteiro.id}/convites/${convite.id}`),
                    "Não foi possível cancelar o convite.",
                  )
                }
              >
                Cancelar
              </button>
            </li>
          ))}
      </ul>

      {erro && (
        <div className="alert alert--error" role="alert">
          <p>{erro}</p>
        </div>
      )}

      {aviso && (
        <div className="alert alert--success" role="status">
          <Icone nome="check" />
          <p>{aviso}</p>
        </div>
      )}

      {ehDono ? (
        <form onSubmit={aoConvidar} className="form convite-form">
          <label className="field">
            <span>E-mail da pessoa</span>
            <input
              type="email"
              value={email}
              maxLength={180}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="amigo@exemplo.com"
              aria-label="E-mail para convidar"
            />
          </label>

          <label className="field">
            <span>Papel</span>
            <select value={papel} onChange={(e) => setPapel(e.target.value as PapelColaborador)} aria-label="Papel do convidado">
              <option value="EDITOR">Editor</option>
              <option value="LEITOR">Leitor</option>
            </select>
          </label>

          <button type="submit" className="btn btn--primary" disabled={ocupado || !email.trim()}>
            <Icone nome="mais" />
            Convidar
          </button>
        </form>
      ) : (
        <div>
          <button type="button" className="btn btn--danger-outline btn--sm" onClick={aoSairDoRoteiro} disabled={ocupado}>
            <Icone nome="sair" />
            Sair deste roteiro
          </button>
        </div>
      )}
    </section>
  );
}

export default Colaboradores;
