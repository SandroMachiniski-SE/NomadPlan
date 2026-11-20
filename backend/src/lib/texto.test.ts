import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { semFinais } from "./texto";

describe("semFinais", () => {
  it("tira todas as repetições do caractere no fim", () => {
    assert.equal(semFinais("https://osrm.exemplo///", "/"), "https://osrm.exemplo");
    assert.equal(semFinais("JBSWY3DP====", "="), "JBSWY3DP");
  });

  it("não mexe no que está no começo ou no meio", () => {
    assert.equal(semFinais("//a/b", "/"), "//a/b");
    assert.equal(semFinais("a=b", "="), "a=b");
  });

  it("texto sem o caractere no fim volta igual, e só o caractere vira vazio", () => {
    assert.equal(semFinais("abc", "/"), "abc");
    assert.equal(semFinais("///", "/"), "");
    assert.equal(semFinais("", "/"), "");
  });
});
