import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import type { Ponto, VersaoPonto } from "../types/ponto";
import { extrairMensagemErro } from "../utils/erro";
import { CATEGORIAS_PONTOS } from "../constants/categorias";
import Icone from "../components/Icone";

interface CamposPonto {
  nome: string;
  categoria: string;
  cidade: string;
  endereco: string;
  descricao: string;
  latitude: string;
  longitude: string;
  faixaPreco: string;
  acessibilidade: string;
  siteOficial: string;
  telefoneContato: string;
  horarioFuncionamento: string;
}

const CAMPOS_VAZIOS: CamposPonto = {
  nome: "",
  categoria: "",
  cidade: "",
  endereco: "",
  descricao: "",
  latitude: "",
  longitude: "",
  faixaPreco: "",
  acessibilidade: "",
  siteOficial: "",
  telefoneContato: "",
  horarioFuncionamento: "",
};

interface PossivelDuplicado {
  id: number;
  nome: string;
  endereco: string | null;
}

function PontoFormulario() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const emEdicao = Boolean(id);

  const [campos, setCampos] = useState<CamposPonto>(CAMPOS_VAZIOS);
  const [ponto, setPonto] = useState<Ponto | null>(null);
  const [carregando, setCarregando] = useState(emEdicao);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [duplicados, setDuplicados] = useState<PossivelDuplicado[] | null>(null);
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const [arquivoImagem, setArquivoImagem] = useState<File | null>(null);
  const [publicando, setPublicando] = useState(false);

  const [versoes, setVersoes] = useState<VersaoPonto[]>([]);
  const [restaurandoId, setRestaurandoId] = useState<number | null>(null);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);

  useEffect(() => {
    if (!id) {
      return;
    }

    async function buscarPonto() {
      try {
        const resposta = await api.get<Ponto>(`/pontos/${id}`);
        setPonto(resposta.data);
        setCampos({
          nome: resposta.data.nome,
          categoria: resposta.data.categoria,
          cidade: resposta.data.cidade,
          endereco: resposta.data.endereco ?? "",
          descricao: resposta.data.descricao ?? "",
          latitude: resposta.data.latitude !== null ? String(resposta.data.latitude) : "",
          longitude: resposta.data.longitude !== null ? String(resposta.data.longitude) : "",
          faixaPreco: resposta.data.faixaPreco ?? "",
          acessibilidade: resposta.data.acessibilidade ?? "",
          siteOficial: resposta.data.siteOficial ?? "",
          telefoneContato: resposta.data.telefoneContato ?? "",
          horarioFuncionamento: resposta.data.horarioFuncionamento ?? "",
        });
      } catch (err) {
        console.error(err);
        setErro(extrairMensagemErro(err, "Não foi possível carregar este ponto turístico."));
      } finally {
        setCarregando(false);
      }
    }

    buscarPonto();
  }, [id]);

  function aoMudarCampo<K extends keyof CamposPonto>(campo: K, valor: string) {
    setCampos((atual) => ({ ...atual, [campo]: valor }));
  }

  function montarPayload(confirmarDuplicidade: boolean) {
    return {
      nome: campos.nome.trim(),
      categoria: campos.categoria.trim(),
      cidade: campos.cidade.trim(),
      endereco: campos.endereco.trim() || undefined,
      descricao: campos.descricao.trim() || undefined,
      latitude: campos.latitude.trim() || undefined,
      longitude: campos.longitude.trim() || undefined,
      faixaPreco: campos.faixaPreco.trim() || undefined,
      acessibilidade: campos.acessibilidade.trim() || undefined,
      siteOficial: campos.siteOficial.trim() || undefined,
      telefoneContato: campos.telefoneContato.trim() || undefined,
      horarioFuncionamento: campos.horarioFuncionamento.trim() || undefined,
      confirmarDuplicidade,
      versaoEsperada: ponto?.versao,
    };
  }

  async function carregarHistorico() {
    if (!id) return;

    try {
      const resposta = await api.get<{ dados: VersaoPonto[] }>(`/pontos/${id}/versoes`);
      setVersoes(resposta.data.dados);
      setMostrarHistorico(true);
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível carregar o histórico de versões."));
    }
  }

  async function aoRestaurarVersao(versaoId: number) {
    if (!id) return;

    const confirmar = window.confirm("Restaurar esta versão? O estado atual será salvo no histórico.");
    if (!confirmar) return;

    try {
      setRestaurandoId(versaoId);
      const resposta = await api.post<Ponto>(`/pontos/${id}/versoes/${versaoId}/restaurar`);
      setPonto(resposta.data);
      setCampos({
        nome: resposta.data.nome,
        categoria: resposta.data.categoria,
        cidade: resposta.data.cidade,
        endereco: resposta.data.endereco ?? "",
        descricao: resposta.data.descricao ?? "",
        latitude: resposta.data.latitude !== null ? String(resposta.data.latitude) : "",
        longitude: resposta.data.longitude !== null ? String(resposta.data.longitude) : "",
        faixaPreco: resposta.data.faixaPreco ?? "",
        acessibilidade: resposta.data.acessibilidade ?? "",
        siteOficial: resposta.data.siteOficial ?? "",
        telefoneContato: resposta.data.telefoneContato ?? "",
        horarioFuncionamento: resposta.data.horarioFuncionamento ?? "",
      });
      await carregarHistorico();
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível restaurar esta versão."));
    } finally {
      setRestaurandoId(null);
    }
  }

  async function salvar(confirmarDuplicidade = false) {
    setErro(null);

    if (!campos.nome.trim() || !campos.categoria.trim() || !campos.cidade.trim()) {
      setErro("Nome, categoria e cidade são obrigatórios.");
      return;
    }

    try {
      setSalvando(true);

      if (emEdicao) {
        await api.put(`/pontos/${id}`, montarPayload(confirmarDuplicidade));
        navigate(`/pontos/${id}/editar`, { replace: true });
        return;
      }

      const resposta = await api.post<Ponto>("/pontos", montarPayload(confirmarDuplicidade));
      setDuplicados(null);
      navigate(`/pontos/${resposta.data.id}/editar`, { replace: true });
    } catch (err) {
      console.error(err);

      const status = (err as { response?: { status?: number } })?.response?.status;
      const dados = (
        err as {
          response?: { data?: { possiveisDuplicados?: PossivelDuplicado[]; pontoAtual?: Ponto } };
        }
      )?.response?.data;

      if (status === 409 && dados?.possiveisDuplicados) {
        setDuplicados(dados.possiveisDuplicados);
        setErro(
          "Encontramos possíveis pontos duplicados. Revise abaixo ou confirme o cadastro mesmo assim.",
        );
        return;
      }

      if (status === 409 && dados?.pontoAtual) {
        setPonto(dados.pontoAtual);
        setErro(
          "Este ponto foi alterado por outra pessoa enquanto você editava. Recarregue os campos abaixo e tente novamente.",
        );
        return;
      }

      setErro(extrairMensagemErro(err, "Não foi possível salvar este ponto turístico."));
    } finally {
      setSalvando(false);
    }
  }

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    await salvar(false);
  }

  async function aoEnviarImagem() {
    if (!arquivoImagem || !id) {
      return;
    }

    try {
      setEnviandoImagem(true);

      const formData = new FormData();
      formData.append("imagem", arquivoImagem);

      const resposta = await api.post<Ponto>(`/pontos/${id}/imagem`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setPonto(resposta.data);
      setArquivoImagem(null);
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível enviar a imagem."));
    } finally {
      setEnviandoImagem(false);
    }
  }

  async function aoPublicar() {
    if (!id) {
      return;
    }

    try {
      setPublicando(true);
      const resposta = await api.post<Ponto>(`/pontos/${id}/publicar`);
      setPonto(resposta.data);
    } catch (err) {
      console.error(err);
      alert(extrairMensagemErro(err, "Não foi possível enviar este ponto para publicação."));
    } finally {
      setPublicando(false);
    }
  }

  if (carregando) {
    return (
      <div className="container container--narrow page">
        <p className="loading">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="container container--narrow page">
      <Link to="/pontos/meus" className="back-link">
        <Icone nome="voltar" />
        Voltar para meus pontos
      </Link>

      <div className="page-head">
        <div className="page-head__text">
          <h1>{emEdicao ? "Editar ponto turístico" : "Novo ponto turístico"}</h1>
          <p className="page-head__sub">
            Campos marcados com * são obrigatórios. Após salvar, envie o ponto para publicação.
          </p>
        </div>
      </div>

      {ponto && ponto.status === "REJEITADO" && ponto.motivoRejeicao && (
        <div className="alert alert--error" style={{ marginBottom: "1.25rem" }}>
          <Icone nome="alerta" />
          <p>Este ponto foi rejeitado pela moderação: {ponto.motivoRejeicao}</p>
        </div>
      )}

      <form onSubmit={aoEnviar} className="card form-card form">
        <h2 className="form-titulo">Informações básicas</h2>

        <div className="form-grid">
          <label className="field field--full">
            <span>Nome *</span>
            <input
              type="text"
              value={campos.nome}
              onChange={(e) => aoMudarCampo("nome", e.target.value)}
              maxLength={160}
            />
          </label>

          <label className="field">
            <span>Categoria *</span>
            <input
              type="text"
              list="lista-categorias"
              value={campos.categoria}
              onChange={(e) => aoMudarCampo("categoria", e.target.value)}
              maxLength={80}
            />
            <datalist id="lista-categorias">
              {CATEGORIAS_PONTOS.map((categoria) => (
                <option key={categoria} value={categoria} />
              ))}
            </datalist>
          </label>

          <label className="field">
            <span>Cidade *</span>
            <input
              type="text"
              value={campos.cidade}
              onChange={(e) => aoMudarCampo("cidade", e.target.value)}
              maxLength={120}
            />
          </label>

          <label className="field field--full">
            <span>Endereço</span>
            <input
              type="text"
              value={campos.endereco}
              onChange={(e) => aoMudarCampo("endereco", e.target.value)}
              maxLength={200}
            />
          </label>

          <label className="field field--full">
            <span>Descrição</span>
            <textarea
              value={campos.descricao}
              onChange={(e) => aoMudarCampo("descricao", e.target.value)}
              maxLength={2000}
              rows={4}
            />
          </label>
        </div>

        <h2 className="form-titulo">Localização no mapa</h2>

        <div className="form-grid">
          <label className="field">
            <span>Latitude</span>
            <input
              type="number"
              step="any"
              value={campos.latitude}
              onChange={(e) => aoMudarCampo("latitude", e.target.value)}
            />
          </label>

          <label className="field">
            <span>Longitude</span>
            <input
              type="number"
              step="any"
              value={campos.longitude}
              onChange={(e) => aoMudarCampo("longitude", e.target.value)}
            />
          </label>
        </div>

        <h2 className="form-titulo">Funcionamento e contato</h2>

        <div className="form-grid">
          <label className="field field--full">
            <span>Horário de funcionamento *</span>
            <input
              type="text"
              placeholder="Ex.: Seg-Sex 9h-18h"
              value={campos.horarioFuncionamento}
              onChange={(e) => aoMudarCampo("horarioFuncionamento", e.target.value)}
              maxLength={200}
            />
          </label>

          <label className="field">
            <span>Faixa de preço</span>
            <input
              type="text"
              value={campos.faixaPreco}
              onChange={(e) => aoMudarCampo("faixaPreco", e.target.value)}
              maxLength={60}
            />
          </label>

          <label className="field">
            <span>Acessibilidade</span>
            <input
              type="text"
              value={campos.acessibilidade}
              onChange={(e) => aoMudarCampo("acessibilidade", e.target.value)}
              maxLength={200}
            />
          </label>

          <label className="field">
            <span>Site oficial</span>
            <input
              type="text"
              value={campos.siteOficial}
              onChange={(e) => aoMudarCampo("siteOficial", e.target.value)}
              maxLength={200}
            />
          </label>

          <label className="field">
            <span>Telefone de contato</span>
            <input
              type="text"
              value={campos.telefoneContato}
              onChange={(e) => aoMudarCampo("telefoneContato", e.target.value)}
              maxLength={40}
            />
          </label>
        </div>

        {erro && (
          <div className="alert alert--error" role="alert">
            <p>{erro}</p>
          </div>
        )}

        {duplicados && duplicados.length > 0 && (
          <div className="alert alert--warning">
            <div>
              <p>
                <strong>Possíveis duplicados encontrados:</strong>
              </p>
              <ul className="relatorio__lista">
                {duplicados.map((d) => (
                  <li key={d.id}>
                    {d.nome} {d.endereco ? `— ${d.endereco}` : ""}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => salvar(true)}
                disabled={salvando}
                style={{ marginTop: "0.75rem" }}
              >
                Cadastrar mesmo assim
              </button>
            </div>
          </div>
        )}

        <div className="form-actions">
          <button type="submit" disabled={salvando} className="btn btn--primary btn--lg">
            {salvando ? "Salvando..." : emEdicao ? "Salvar alterações" : "Cadastrar ponto"}
          </button>
        </div>
      </form>

      {emEdicao && ponto && (
        <div className="stack stack--lg" style={{ marginTop: "1.5rem" }}>
          <section className="card card--pad stack">
            <h2>Imagem</h2>

            {ponto.imagemUrl && (
              <img
                src={`${api.defaults.baseURL}${ponto.imagemUrl}`}
                alt={ponto.nome}
                className="imagem-previa"
              />
            )}

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setArquivoImagem(e.target.files?.[0] ?? null)}
            />

            <div>
              <button
                type="button"
                className="btn btn--outline"
                onClick={aoEnviarImagem}
                disabled={!arquivoImagem || enviandoImagem}
              >
                {enviandoImagem ? "Enviando..." : "Enviar imagem"}
              </button>
            </div>
          </section>

          {(ponto.status === "RASCUNHO" || ponto.status === "REJEITADO") && (
            <button
              type="button"
              onClick={aoPublicar}
              disabled={publicando}
              className="btn btn--accent btn--lg btn--block"
            >
              {publicando ? "Enviando..." : "Enviar para publicação"}
            </button>
          )}

          <section className="card card--pad stack">
            <h2>Histórico de versões</h2>

            {!mostrarHistorico ? (
              <div>
                <button type="button" className="btn btn--outline" onClick={carregarHistorico}>
                  Ver histórico
                </button>
              </div>
            ) : versoes.length === 0 ? (
              <p className="muted">Nenhuma alteração registrada ainda.</p>
            ) : (
              <div className="stack stack--sm">
                {versoes.map((versao) => (
                  <div key={versao.id} className="versao">
                    <div>
                      <p className="muted small">
                        {new Date(versao.dataCriacao).toLocaleString("pt-BR")} — {versao.motivo}
                      </p>
                      <p>Nome salvo: {(versao.dados as { nome?: string }).nome ?? "—"}</p>
                    </div>
                    <button
                      type="button"
                      className="btn btn--outline btn--sm"
                      onClick={() => aoRestaurarVersao(versao.id)}
                      disabled={restaurandoId === versao.id}
                    >
                      {restaurandoId === versao.id ? "Restaurando..." : "Restaurar esta versão"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default PontoFormulario;
