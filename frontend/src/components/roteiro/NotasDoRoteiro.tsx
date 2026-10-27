import { useState, type FormEvent } from "react";
import api from "../../services/api";
import { extrairMensagemErro } from "../../utils/erro";
import Icone from "../Icone";

interface NotasDoRoteiroProps {
  idRoteiro: number;
  notas: string | null;
  aoSalvar: () => void | Promise<void>;
}

// Anotações livres da viagem (endereços, senhas de reserva, lembretes). Só o dono vê.
function NotasDoRoteiro({ idRoteiro, notas, aoSalvar }: NotasDoRoteiroProps) {
  const [texto, setTexto] = useState(notas ?? "");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();

    try {
      setSalvando(true);
      setErro(null);
      setSalvo(false);

      await api.patch(`/roteiros/${idRoteiro}/anotacoes`, { notas: texto.trim() || null });

      setSalvo(true);
      await aoSalvar();
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, "Não foi possível salvar as notas."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="card card--pad stack" aria-labelledby="titulo-notas">
      <div>
        <h2 id="titulo-notas">Notas</h2>
        <p className="muted small">Só você vê. Não aparecem no link público do roteiro.</p>
      </div>

      <form onSubmit={aoEnviar} className="form">
        <label className="field">
          <textarea
            rows={6}
            maxLength={5000}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setSalvo(false);
            }}
            placeholder="Horários de voo, endereço do hotel, ideias, lembretes..."
            aria-label="Notas do roteiro"
          />
        </label>

        {erro && (
          <div className="alert alert--error" role="alert">
            <p>{erro}</p>
          </div>
        )}

        <div className="cluster">
          <button type="submit" className="btn btn--outline btn--sm" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar notas"}
          </button>
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
