// Campos de PontoTuristico devolvidos pela API. A versão "pública" é o que qualquer
// visitante pode ver; a "completa" acrescenta dados de gestão (responsável, versão...).

export const pontoSelecaoPublica = {
  id: true,
  nome: true,
  descricao: true,
  categoria: true,
  cidade: true,
  endereco: true,
  latitude: true,
  longitude: true,
  faixaPreco: true,
  acessibilidade: true,
  siteOficial: true,
  telefoneContato: true,
  horarioFuncionamento: true,
  imagemUrl: true,
  status: true,
  seloVerificado: true,
} as const;

export const pontoSelecaoCompleta = {
  ...pontoSelecaoPublica,
  motivoRejeicao: true,
  versao: true,
  dataCriacao: true,
  dataAtualizacao: true,
  idResponsavel: true,
  responsavel: {
    select: {
      id: true,
      nome: true,
    },
  },
} as const;
