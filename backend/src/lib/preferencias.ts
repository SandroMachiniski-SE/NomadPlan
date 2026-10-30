// Preferências do perfil (RF03) e como elas se ligam ao texto livre de acessibilidade
// dos pontos ("Rampa de acesso, banheiro adaptado", "Piso tátil" etc.).

export const IDIOMAS = ["pt-BR", "en", "es"] as const;
export type Idioma = (typeof IDIOMAS)[number];

const PALAVRAS_CHAVE_ACESSIBILIDADE = {
  mobilidade_reduzida: ["rampa", "elevador", "cadeirante", "cadeira de rodas", "acessivel", "mobilidade", "nivelado"],
  deficiencia_visual: ["piso tatil", "braile", "audiodescricao", "audio descricao", "guia sonoro"],
  deficiencia_auditiva: ["libras", "legenda", "sinalizacao visual"],
  banheiro_adaptado: ["banheiro adaptado", "sanitario adaptado", "wc adaptado", "banheiro acessivel"],
  estacionamento_reservado: ["estacionamento reservado", "vaga reservada", "vaga pcd", "vaga para pcd"],
} as const;

export type PreferenciaAcessibilidade = keyof typeof PALAVRAS_CHAVE_ACESSIBILIDADE;

export const PREFERENCIAS_ACESSIBILIDADE = Object.keys(
  PALAVRAS_CHAVE_ACESSIBILIDADE,
) as PreferenciaAcessibilidade[];

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Quantas das preferências informadas o texto de acessibilidade do ponto atende.
 * Texto vazio ou "a verificar" não atende nenhuma (não presumimos acessibilidade).
 */
export function preferenciasAtendidas(
  textoAcessibilidade: string | null | undefined,
  preferencias: readonly string[],
): number {
  if (!textoAcessibilidade || preferencias.length === 0) {
    return 0;
  }

  const texto = normalizar(textoAcessibilidade);

  return preferencias.filter((preferencia) => {
    const palavras = PALAVRAS_CHAVE_ACESSIBILIDADE[preferencia as PreferenciaAcessibilidade];

    return palavras?.some((palavra) => texto.includes(palavra)) ?? false;
  }).length;
}
