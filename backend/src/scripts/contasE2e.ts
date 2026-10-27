// Contas de partida do banco de ponta a ponta (ver prepararE2e.ts). Usadas também pelos
// testes do Playwright para entrar com cada papel.

export const SENHA_E2E = "senha-e2e-123";

export const CONTAS_E2E = {
  admin: { nome: "Admin E2E", email: "admin@e2e.test", tipoConta: "ADMIN" },
  moderador: { nome: "Moderadora E2E", email: "moderador@e2e.test", tipoConta: "MODERADOR" },
  negocio: { nome: "Negócio E2E", email: "negocio@e2e.test", tipoConta: "NEGOCIO" },
} as const;
