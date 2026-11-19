import { useState, type FormEvent } from "react";
import api from "../../services/api";
import { extrairMensagemErro } from "../../utils/erro";
import Icone from "../Icone";

interface NotasDoRoteiroProps {
  idRoteiro: number;
  notas: string | null;
  aoSalvar: () => void | Promise<void>;
  somenteLeitura?: boolean;
}

// Anotações livres da viagem (endereços, senhas de reserva, lembretes). Só o dono vê.
function NotasDoRoteiro({ idRoteiro, notas, aoSalvar, somenteLeitura = false }: NotasDoRoteiroProps) {
  const [texto, setTexto] = useState(notas ?? "");
  // As notas como estavam quando a edição começou: se mudarem no servidor (outra aba, outra pessoa),
  // a gravação é recusada em vez de apagar o que a outra salvou.
  const [base, setBase] = useState(notas ?? "");
  const [conflito, setConflito] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar(notasAnteriores: string) {
    try {
      setSalvando(true);
      setErro(null);
      setSalvo(false);

      await api.patch(`/roteiros/${idRoteiro}/anotacoes`, { notas: texto.trim() || null, notasAnteriores });

      setBase(texto.trim());
      setConflito(null);
      setSalvo(true);
      await aoSalvar();
    } catch (err) {
      const resposta = (err as { response?: { status?: number; data?: { notasAtuais?: string | null } } }).response;

      if (resposta?.status === 409) {
        setConflito(resposta.data?.notasAtuais ?? "");
        return;
      }

      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível salvar as notas."));
    } finally {
      setSalvando(false);
    }
  }

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    void salvar(base);
  }

  return (
    <section className="card card--pad stack" aria-labelledby="titulo-notas">
      <div>
        <h2 id="titulo-notas">Notas</h2>
        <p className="muted small">Visíveis só para quem participa do roteiro; não aparecem no link público.</p>
      </div>

      <form onSubmit={aoEnviar} className="form">
        <label className="field">
          <textarea
            rows={6}
            maxLength={5000}
            value={texto}
            readOnly={somenteLeitura}
            onChange={(e) => {
              setTexto(e.target.value);
              setSalvo(false);
            }}
            placeholder="Horários de voo, endereço do hotel, ideias, lembretes..."
            aria-label="Notas do roteiro"
          />
        </label>

        {conflito !== null && (
          <div className="alert alert--warning stack stack--sm" role="alert">
            <p>
              As notas mudaram em outra aba ou por outra pessoa enquanto você editava. Nada foi apagado: escolha o
              que fica.
            </p>
            <p className="muted small">Notas salvas agora:</p>
            <blockquote className="notas-conflito">{conflito || "(vazias)"}</blockquote>
            <div className="cluster">
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => {
                  setTexto(conflito);
                  setBase(conflito);
                  setConflito(null);
                }}
              >
                Usar as notas atuais
              </button>
              <button type="button" className="btn btn--outline btn--sm" disabled={salvando} onClick={() => void salvar(conflito)}>
                Salvar as minhas por cima
              </button>
            </div>
          </div>
        )}

        {erro && (
          <div className="alert alert--error" role="alert">
            <p>{erro}</p>
          </div>
        )}

        <div className="cluster">
          {!somenteLeitura && (
          <button type="submit" className="btn btn--outline btn--sm" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar notas"}
          </button>
          )}
          {salvo && (
            <span className="muted small" role="status">
              <Icone nome="check" /> Notas salvas.
            </span>
          )}
        </div>
      </form>
    </section>
  );
}

export default NotasDoRoteiro;
