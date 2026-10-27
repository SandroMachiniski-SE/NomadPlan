import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PREFERENCIAS_ACESSIBILIDADE, preferenciasAtendidas } from "./preferencias";

describe("preferenciasAtendidas", () => {
  it("não atende nada quando o ponto não informa acessibilidade", () => {
    assert.equal(preferenciasAtendidas(null, ["mobilidade_reduzida"]), 0);
    assert.equal(preferenciasAtendidas("", ["mobilidade_reduzida"]), 0);
    assert.equal(preferenciasAtendidas("A verificar", ["mobilidade_reduzida"]), 0);
  });

  it("não atende nada quando o usuário não tem preferências", () => {
    assert.equal(preferenciasAtendidas("Rampa de acesso", []), 0);
  });

  it("reconhece palavras-chave ignorando acentos e maiúsculas", () => {
    assert.equal(preferenciasAtendidas("RAMPA de acesso e elevador", ["mobilidade_reduzida"]), 1);
    assert.equal(preferenciasAtendidas("Piso Tátil no corredor", ["deficiencia_visual"]), 1);
    assert.equal(preferenciasAtendidas("Intérprete de Libras aos sábados", ["deficiencia_auditiva"]), 1);
  });

  it("conta cada preferência atendida", () => {
    const texto = "Rampa, banheiro adaptado e estacionamento reservado";

    assert.equal(
      preferenciasAtendidas(texto, ["mobilidade_reduzida", "banheiro_adaptado", "estacionamento_reservado"]),
      3,
    );
    assert.equal(preferenciasAtendidas(texto, ["deficiencia_visual"]), 0);
  });

  it("ignora preferências desconhecidas", () => {
    assert.equal(preferenciasAtendidas("Rampa", ["inexistente"]), 0);
  });

  it("expõe a lista de preferências válidas", () => {
    assert.ok(PREFERENCIAS_ACESSIBILIDADE.includes("mobilidade_reduzida"));
    assert.equal(new Set(PREFERENCIAS_ACESSIBILIDADE).size, PREFERENCIAS_ACESSIBILIDADE.length);
  });
});
