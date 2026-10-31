import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ehUrlHttp, normalizarUrlHttp } from "./urlHttp";

describe("normalizarUrlHttp", () => {
  it("aceita endereços http e https e o campo vazio", () => {
    assert.equal(normalizarUrlHttp("https://museu.example.com.br/visita?a=1"), "https://museu.example.com.br/visita?a=1");
    assert.equal(normalizarUrlHttp("http://museu.example.com.br"), "http://museu.example.com.br");
    assert.equal(normalizarUrlHttp(""), "");
  });

  it("completa o protocolo de quem digita só o domínio", () => {
    assert.equal(normalizarUrlHttp("museu.com.br"), "https://museu.com.br");
    assert.equal(normalizarUrlHttp(" www.museu.com.br/horarios "), "https://www.museu.com.br/horarios");
  });
});

describe("ehUrlHttp", () => {
  it("recusa esquemas que executam código ou não são páginas", () => {
    assert.equal(ehUrlHttp("javascript:alert(1)"), false);
    assert.equal(ehUrlHttp("JaVaScRiPt:alert(1)"), false);
    assert.equal(ehUrlHttp("data:text/html,<script>alert(1)</script>"), false);
    assert.equal(ehUrlHttp("vbscript:msgbox(1)"), false);
    assert.equal(ehUrlHttp("file:///etc/passwd"), false);
  });

  it("recusa texto que não é endereço", () => {
    assert.equal(ehUrlHttp("não é um site"), false);
    assert.equal(ehUrlHttp("alert(1)"), false);
  });
});
