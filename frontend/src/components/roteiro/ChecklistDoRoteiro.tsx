import { useState, type FormEvent } from "react";
import api from "../../services/api";
import type { ItemChecklist } from "../../types/roteiro";
import { extrairMensagemErro } from "../../utils/erro";
import Icone from "../Icone";

interface ChecklistDoRoteiroProps {
  idRoteiro: number;
  itens: ItemChecklist[];
  aoMudar: () => void | Promise<void>;
  somenteLeitura?: boolean;
}

// Lista de tarefas da viagem (documentos, bagagem, reservas a fazer...).
function ChecklistDoRoteiro({ idRoteiro, itens, aoMudar, somenteLeitura = false }: ChecklistDoRoteiroProps) {
  const [novo, setNovo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // O visto aparece na hora; o valor do servidor só chega depois de recarregar o roteiro.
  const [marcados, setMarcados] = useState<Record<number, boolean>>({});

  const estaFeito = (item: ItemChecklist) => marcados[item.id] ?? item.feito;
  const feitos = itens.filter(estaFeito).length;

  async function executar(acao: () => Promise<unknown>, mensagemDeErro: string) {
    try {
      setOcupado(true);
      setErro(null);

      await acao();
      await aoMudar();
    } catch (err) {
      console.error(err);
      setErro(extrairMensagemErro(err, mensagemDeErro));
    } finally {
      setMarcados({});
      setOcupado(false);
    }
  }

  async function aoAdicionar(evento: FormEvent) {
    evento.preventDefault();

    const texto = novo.trim();
    if (!texto) return;

    await executar(async () => {
      await api.post(`/roteiros/${idRoteiro}/checklist`, { texto });
      setNovo("");
    }, "Não foi possível adicionar o item.");
  }

  return (
    <section className="card card--pad stack" aria-labelledby="titulo-checklist">
      <div className="cluster spread">
        <h2 id="titulo-checklist">Checklist</h2>
        {itens.length > 0 && (
          <span className="badge badge--primary">
            {feitos} de {itens.length}
          </span>
        )}
      </div>

      {itens.length === 0 ? (
        <p className="muted small">Documentos, bagagem, reservas a fazer... anote aqui o que não pode ser esquecido.</p>
      ) : (
        <ul className="checklist">
          {itens.map((item) => (
            <li key={item.id} className={estaFeito(item) ? "checklist__item checklist__item--feito" : "checklist__item"}>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={estaFeito(item)}
                  disabled={ocupado || somenteLeitura}
                  onChange={(e) => {
                    const feito = e.target.checked;
                    setMarcados({ [item.id]: feito });

                    executar(
                      () => api.patch(`/roteiros/${idRoteiro}/checklist/${item.id}`, { feito }),
                      "Não foi possível atualizar o item.",
                    );
                  }}
                />
                <span>{item.texto}</span>
              </label>

              {!somenteLeitura && (
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                disabled={ocupado}
                onClick={() =>
                  executar(() => api.delete(`/roteiros/${idRoteiro}/checklist/${item.id}`), "Não foi possível remover o item.")
                }
                aria-label={`Remover ${item.texto}`}
                title="Remover"
              >
                <Icone nome="lixeira" />
              </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {erro && (
        <div className="alert alert--error" role="alert">
          <p>{erro}</p>
        </div>
      )}

      {!somenteLeitura && (
      <form onSubmit={aoAdicionar} className="checklist__novo">
        <input
          type="text"
          value={novo}
          maxLength={200}
          onChange={(e) => setNovo(e.target.value)}
          placeholder="Novo item (ex.: Passaporte)"
          aria-label="Novo item da checklist"
        />
        <button type="submit" className="btn btn--primary btn--sm" disabled={ocupado || !novo.trim()}>
          <Icone nome="mais" />
          Adicionar
        </button>
      </form>
      )}
    </section>
  );
}

export default ChecklistDoRoteiro;
