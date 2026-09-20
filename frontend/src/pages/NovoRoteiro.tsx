import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api from "../services/api";
import type { Roteiro } from "../types/roteiro";
import Icone from "../components/Icone";

function NovoRoteiro() {
  const navigate = useNavigate();

  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cidade, setCidade] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");

  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aoEnviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);

    if (nome.trim().length === 0) {
      setErro("O nome do roteiro é obrigatório.");
      return;
    }

    if (dataInicio && dataFim && dataFim < dataInicio) {
      setErro("A data final não pode ser anterior à data inicial.");
      return;
    }

    try {
      setEnviando(true);

      const payload = {
        nome: nome.trim(),
        descricao: descricao.trim() || undefined,
        cidade: cidade.trim() || undefined,
        dataInicio: dataInicio || undefined,
        dataFim: dataFim || undefined,
      };

      const resposta = await api.post<Roteiro>("/roteiros", payload);

      navigate(`/roteiros/${resposta.data.id}`);
    } catch (err) {
      console.error(err);
      setErro("Não foi possível criar o roteiro. Verifique os dados e tente novamente.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="container container--narrow page">
      <Link to="/roteiros" className="back-link">
        <Icone nome="voltar" />
        Voltar para meus roteiros
      </Link>

      <div className="page-head">
        <div className="page-head__text">
          <h1>Novo roteiro</h1>
          <p className="page-head__sub">Dê um nome à sua viagem — você adiciona as paradas depois.</p>
        </div>
      </div>

      <form onSubmit={aoEnviar} className="card form-card form">
        <div className="form-grid">
          <label className="field">
            <span>Nome *</span>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={120}
              placeholder="Ex.: Fim de semana em Joinville"
            />
          </label>

          <label className="field">
            <span>Cidade</span>
            <input
              type="text"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              maxLength={120}
            />
          </label>

          <label className="field field--full">
            <span>
              Descrição <span className="field__optional">(opcional)</span>
            </span>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              maxLength={1000}
              rows={4}
            />
          </label>

          <label className="field">
            <span>Data de início</span>
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </label>

          <label className="field">
            <span>Data de fim</span>
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </label>
        </div>

        {erro && (
          <div className="alert alert--error" role="alert">
            <p>{erro}</p>
          </div>
        )}

        <div className="form-actions">
          <button type="submit" disabled={enviando} className="btn btn--primary btn--lg">
            {enviando ? "Salvando..." : "Criar roteiro"}
          </button>
          <Link to="/roteiros" className="btn btn--ghost btn--lg">
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}

export default NovoRoteiro;
