import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../services/api";
import type { Ponto } from "../types/ponto";
import { extrairMensagemErro } from "../utils/erro";

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

const estiloCampo = { padding: "0.5rem", borderRadius: 6, border: "1px solid #ccc" };
const estiloLabel = { display: "grid", gap: "0.25rem" };

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
    };
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
      const dados = (err as { response?: { data?: { possiveisDuplicados?: PossivelDuplicado[] } } })
        ?.response?.data;

      if (status === 409 && dados?.possiveisDuplicados) {
        setDuplicados(dados.possiveisDuplicados);
        setErro(
          "Encontramos possíveis pontos duplicados. Revise abaixo ou confirme o cadastro mesmo assim.",
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
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1rem" }}>
        <p>Carregando...</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1rem" }}>
      <Link to="/pontos/meus" style={{ color: "#2563eb", textDecoration: "none" }}>
        Voltar para meus pontos
      </Link>

      <h1 style={{ marginTop: "1rem" }}>{emEdicao ? "Editar ponto turístico" : "Novo ponto turístico"}</h1>

      {ponto && ponto.status === "REJEITADO" && ponto.motivoRejeicao && (
        <div
          style={{
            border: "1px solid #f87171",
            backgroundColor: "#fee2e2",
            color: "#991b1b",
            borderRadius: 8,
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          Este ponto foi rejeitado pela moderação: {ponto.motivoRejeicao}
        </div>
      )}

      <form onSubmit={aoEnviar} style={{ display: "grid", gap: "1rem" }}>
        <label style={estiloLabel}>
          Nome *
          <input
            type="text"
            value={campos.nome}
            onChange={(e) => aoMudarCampo("nome", e.target.value)}
            maxLength={160}
            style={estiloCampo}
          />
        </label>

        <label style={estiloLabel}>
          Categoria *
          <input
            type="text"
            value={campos.categoria}
            onChange={(e) => aoMudarCampo("categoria", e.target.value)}
            maxLength={80}
            style={estiloCampo}
          />
        </label>

        <label style={estiloLabel}>
          Cidade *
          <input
            type="text"
            value={campos.cidade}
            onChange={(e) => aoMudarCampo("cidade", e.target.value)}
            maxLength={120}
            style={estiloCampo}
          />
        </label>

        <label style={estiloLabel}>
          Endereço
          <input
            type="text"
            value={campos.endereco}
            onChange={(e) => aoMudarCampo("endereco", e.target.value)}
            maxLength={200}
            style={estiloCampo}
          />
        </label>

        <label style={estiloLabel}>
          Descrição
          <textarea
            value={campos.descricao}
            onChange={(e) => aoMudarCampo("descricao", e.target.value)}
            maxLength={2000}
            rows={4}
            style={estiloCampo}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          <label style={estiloLabel}>
            Latitude
            <input
              type="number"
              step="any"
              value={campos.latitude}
              onChange={(e) => aoMudarCampo("latitude", e.target.value)}
              style={estiloCampo}
            />
          </label>

          <label style={estiloLabel}>
            Longitude
            <input
              type="number"
              step="any"
              value={campos.longitude}
              onChange={(e) => aoMudarCampo("longitude", e.target.value)}
              style={estiloCampo}
            />
          </label>
        </div>

        <label style={estiloLabel}>
          Horário de funcionamento *
          <input
            type="text"
            placeholder="Ex.: Seg-Sex 9h-18h"
            value={campos.horarioFuncionamento}
            onChange={(e) => aoMudarCampo("horarioFuncionamento", e.target.value)}
            maxLength={200}
            style={estiloCampo}
          />
        </label>

        <label style={estiloLabel}>
          Faixa de preço
          <input
            type="text"
            value={campos.faixaPreco}
            onChange={(e) => aoMudarCampo("faixaPreco", e.target.value)}
            maxLength={60}
            style={estiloCampo}
          />
        </label>

        <label style={estiloLabel}>
          Acessibilidade
          <input
            type="text"
            value={campos.acessibilidade}
            onChange={(e) => aoMudarCampo("acessibilidade", e.target.value)}
            maxLength={200}
            style={estiloCampo}
          />
        </label>

        <label style={estiloLabel}>
          Site oficial
          <input
            type="text"
            value={campos.siteOficial}
            onChange={(e) => aoMudarCampo("siteOficial", e.target.value)}
            maxLength={200}
            style={estiloCampo}
          />
        </label>

        <label style={estiloLabel}>
          Telefone de contato
          <input
            type="text"
            value={campos.telefoneContato}
            onChange={(e) => aoMudarCampo("telefoneContato", e.target.value)}
            maxLength={40}
            style={estiloCampo}
          />
        </label>

        {erro && (
          <div
            style={{
              border: "1px solid #f87171",
              backgroundColor: "#fee2e2",
              color: "#991b1b",
              borderRadius: 8,
              padding: "1rem",
            }}
          >
            {erro}
          </div>
        )}

        {duplicados && duplicados.length > 0 && (
          <div style={{ border: "1px solid #fbbf24", backgroundColor: "#fffbeb", borderRadius: 8, padding: "1rem" }}>
            <p style={{ marginTop: 0 }}>Possíveis duplicados encontrados:</p>
            <ul>
              {duplicados.map((d) => (
                <li key={d.id}>
                  {d.nome} {d.endereco ? `— ${d.endereco}` : ""}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => salvar(true)}
              disabled={salvando}
              style={{ padding: "0.5rem 1rem", borderRadius: 6, border: "1px solid #b45309", background: "transparent", color: "#b45309" }}
            >
              Cadastrar mesmo assim
            </button>
          </div>
        )}

        <button
          type="submit"
          disabled={salvando}
          style={{
            padding: "0.75rem",
            borderRadius: 6,
            border: "none",
            backgroundColor: "#2563eb",
            color: "#fff",
            fontWeight: "bold",
            cursor: salvando ? "not-allowed" : "pointer",
          }}
        >
          {salvando ? "Salvando..." : emEdicao ? "Salvar alterações" : "Cadastrar ponto"}
        </button>
      </form>

      {emEdicao && ponto && (
        <>
          <h2 style={{ marginTop: "2rem" }}>Imagem</h2>

          {ponto.imagemUrl && (
            <img
              src={`${api.defaults.baseURL}${ponto.imagemUrl}`}
              alt={ponto.nome}
              style={{ maxWidth: "100%", borderRadius: 8, marginBottom: "1rem" }}
            />
          )}

          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setArquivoImagem(e.target.files?.[0] ?? null)}
            />

            <button
              type="button"
              onClick={aoEnviarImagem}
              disabled={!arquivoImagem || enviandoImagem}
              style={{ padding: "0.5rem 1rem", borderRadius: 6, border: "1px solid #2563eb", background: "transparent", color: "#2563eb" }}
            >
              {enviandoImagem ? "Enviando..." : "Enviar imagem"}
            </button>
          </div>

          {(ponto.status === "RASCUNHO" || ponto.status === "REJEITADO") && (
            <button
              type="button"
              onClick={aoPublicar}
              disabled={publicando}
              style={{
                marginTop: "2rem",
                padding: "0.75rem",
                width: "100%",
                borderRadius: 6,
                border: "none",
                backgroundColor: "#166534",
                color: "#fff",
                fontWeight: "bold",
                cursor: publicando ? "not-allowed" : "pointer",
              }}
            >
              {publicando ? "Enviando..." : "Enviar para publicação"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default PontoFormulario;
