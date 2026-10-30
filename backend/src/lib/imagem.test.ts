import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { detectarTipoImagem } from "./imagem";

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const JPEG = Buffer.from("ffd8ffe000104a4649460001", "hex");
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);

describe("detectarTipoImagem", () => {
  it("reconhece PNG, JPEG e WEBP pelo conteúdo", () => {
    assert.equal(detectarTipoImagem(PNG), "image/png");
    assert.equal(detectarTipoImagem(JPEG), "image/jpeg");
    assert.equal(detectarTipoImagem(WEBP), "image/webp");
  });

  it("recusa HTML e scripts disfarçados de imagem", () => {
    assert.equal(detectarTipoImagem(Buffer.from("<html><script>alert(1)</script>")), null);
    assert.equal(detectarTipoImagem(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")), null);
  });

  it("recusa arquivo vazio ou curto demais", () => {
    assert.equal(detectarTipoImagem(Buffer.alloc(0)), null);
    assert.equal(detectarTipoImagem(Buffer.from([0xff, 0xd8])), null);
  });

  it("não confunde um RIFF que não é WEBP (WAV, por exemplo)", () => {
    const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0, 0, 0]), Buffer.from("WAVEfmt ")]);

    assert.equal(detectarTipoImagem(wav), null);
  });
});
