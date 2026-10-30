import { afterEach, beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import nodemailer, { type SendMailOptions } from "nodemailer";
import {
  descreverConfiguracaoEmail,
  enviarEmailConvite,
  enviarEmailRedefinicaoSenha,
  lerConfiguracaoSmtp,
  montarEmailConvite,
  montarEmailRedefinicao,
  type ConfiguracaoSmtp,
} from "./email";

const LINK = "http://localhost:5173/redefinir-senha?token=abc.def.ghi";

const CONFIG: ConfiguracaoSmtp = {
  host: "smtp.exemplo.com",
  port: 587,
  secure: false,
  user: "conta@exemplo.com",
  pass: "segredo",
  from: "NomadPlan <conta@exemplo.com>",
};

describe("lerConfiguracaoSmtp", () => {
  it("devolve null sem SMTP_HOST (modo de desenvolvimento)", () => {
    assert.equal(lerConfiguracaoSmtp({}), null);
    assert.equal(lerConfiguracaoSmtp({ SMTP_HOST: "" }), null);
  });

  it("usa porta 587 sem TLS direto por padrão", () => {
    const config = lerConfiguracaoSmtp({ SMTP_HOST: "smtp.exemplo.com" });

    assert.equal(config?.port, 587);
    assert.equal(config?.secure, false);
  });

  it("liga o TLS direto na porta 465", () => {
    assert.equal(lerConfiguracaoSmtp({ SMTP_HOST: "h", SMTP_PORT: "465" })?.secure, true);
  });

  it("respeita SMTP_SECURE explícito e monta o remetente a partir do usuário", () => {
    const config = lerConfiguracaoSmtp({
      SMTP_HOST: "h",
      SMTP_PORT: "465",
      SMTP_SECURE: "false",
      SMTP_USER: "conta@exemplo.com",
      SMTP_PASS: "x",
    });

    assert.equal(config?.secure, false);
    assert.equal(config?.from, "NomadPlan <conta@exemplo.com>");
    assert.equal(config?.user, "conta@exemplo.com");
  });

  it("usa EMAIL_FROM quando informado", () => {
    assert.equal(
      lerConfiguracaoSmtp({ SMTP_HOST: "h", EMAIL_FROM: "Equipe <equipe@nomadplan.com>" })?.from,
      "Equipe <equipe@nomadplan.com>",
    );
  });
});

describe("montarEmailRedefinicao", () => {
  it("inclui saudação com o primeiro nome, o link e a validade nas duas versões", () => {
    const { assunto, texto, html } = montarEmailRedefinicao({ nome: "Maria da Silva", link: LINK });

    assert.match(assunto, /Redefinição de senha/);
    assert.match(texto, /Olá, Maria!/);
    assert.ok(texto.includes(LINK));
    assert.match(texto, /15 minutos/);
    assert.ok(html.includes(`href="${LINK}"`));
    assert.match(html, /Olá, Maria!/);
  });

  it("escapa HTML no nome e no link para evitar injeção de marcação", () => {
    const { html } = montarEmailRedefinicao({
      nome: '<script>alert("x")</script>',
      link: 'http://site.com/?a="><img src=x>',
    });

    assert.ok(!html.includes("<script>"));
    assert.ok(!html.includes("<img"));
    assert.match(html, /&lt;script&gt;/);
  });

  it("funciona sem nome", () => {
    assert.match(montarEmailRedefinicao({ nome: "   ", link: LINK }).texto, /^Olá!/);
  });
});

describe("enviarEmailRedefinicaoSenha", () => {
  let logs: string[];
  let erros: string[];

  beforeEach(() => {
    logs = [];
    erros = [];
    mock.method(console, "log", (...args: unknown[]) => logs.push(args.join(" ")));
    mock.method(console, "error", (...args: unknown[]) => erros.push(args.join(" ")));
  });

  afterEach(() => {
    mock.restoreAll();
  });

  it("envia pelo transporte SMTP com remetente, destinatário e corpo corretos", async () => {
    const transporte = nodemailer.createTransport({ jsonTransport: true });
    const enviados: SendMailOptions[] = [];
    const original = transporte.sendMail.bind(transporte);
    mock.method(transporte, "sendMail", (opcoes: SendMailOptions) => {
      enviados.push(opcoes);
      return original(opcoes);
    });

    const resultado = await enviarEmailRedefinicaoSenha(
      { para: "maria@exemplo.com", nome: "Maria", link: LINK },
      { config: CONFIG, transporte },
    );

    assert.equal(resultado, "enviado");
    assert.equal(enviados.length, 1);
    assert.equal(enviados[0].to, "maria@exemplo.com");
    assert.equal(enviados[0].from, CONFIG.from);
    assert.ok(String(enviados[0].text).includes(LINK));
    assert.ok(String(enviados[0].html).includes(LINK));
  });

  it("propaga a falha do servidor de e-mail para quem chamou tratar", async () => {
    const transporte = nodemailer.createTransport({ jsonTransport: true });
    mock.method(transporte, "sendMail", () => Promise.reject(new Error("SMTP fora do ar")));

    await assert.rejects(
      enviarEmailRedefinicaoSenha(
        { para: "maria@exemplo.com", nome: "Maria", link: LINK },
        { config: CONFIG, transporte },
      ),
      /SMTP fora do ar/,
    );
  });

  it("sem SMTP e fora de produção, escreve o link no console", async () => {
    const resultado = await enviarEmailRedefinicaoSenha(
      { para: "maria@exemplo.com", nome: "Maria", link: LINK },
      { config: null, producao: false },
    );

    assert.equal(resultado, "console");
    assert.ok(logs.some((linha) => linha.includes(LINK)));
  });

  it("sem SMTP em produção, não envia e nunca registra o link no log", async () => {
    const resultado = await enviarEmailRedefinicaoSenha(
      { para: "maria@exemplo.com", nome: "Maria", link: LINK },
      { config: null, producao: true },
    );

    assert.equal(resultado, "nao-configurado");
    assert.ok(erros.some((linha) => linha.includes("SMTP não configurado")));
    assert.ok(![...logs, ...erros].some((linha) => linha.includes("token=")));
  });
});

describe("descreverConfiguracaoEmail", () => {
  it("avisa que o link vai para o console quando não há SMTP em desenvolvimento", () => {
    assert.match(descreverConfiguracaoEmail(null, false), /impresso neste console/);
  });

  it("avisa que nada será enviado quando não há SMTP em produção", () => {
    assert.match(descreverConfiguracaoEmail(null, true), /NÃO serão enviados/);
  });

  it("informa servidor, porta e remetente quando há SMTP, sem expor a senha", () => {
    const texto = descreverConfiguracaoEmail(CONFIG, false);

    assert.match(texto, /smtp\.exemplo\.com:587/);
    assert.match(texto, /conta@exemplo\.com/);
    assert.ok(!texto.includes("segredo"));
  });
});

describe("e-mail de convite para roteiro", () => {
  const dados = {
    para: "ana@exemplo.com",
    nomeConvidante: "Beto <script>",
    nomeRoteiro: 'Viagem "dos sonhos"',
    papel: "EDITOR" as const,
    link: "http://localhost:5173/convites",
    temConta: true,
  };

  it("descreve o convite e orienta conforme a pessoa já tenha conta ou não", () => {
    const comConta = montarEmailConvite(dados);
    const semConta = montarEmailConvite({ ...dados, temConta: false, papel: "LEITOR" });

    assert.match(comConta.texto, /convidou você para editar o roteiro/);
    assert.match(comConta.texto, /Entre no NomadPlan/);
    assert.match(semConta.texto, /acompanhar o roteiro/);
    assert.match(semConta.texto, /Crie uma conta no NomadPlan com este mesmo e-mail/);
    assert.match(comConta.assunto, /convidou você para um roteiro/);
  });

  it("escapa o HTML dos nomes digitados por usuários", () => {
    const { html } = montarEmailConvite(dados);

    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("Beto &lt;script&gt;"));
    assert.ok(html.includes("&quot;dos sonhos&quot;"));
  });

  it("sem SMTP em desenvolvimento só registra no console; em produção não envia", async () => {
    assert.equal(await enviarEmailConvite(dados, { config: null, producao: false }), "console");
    assert.equal(await enviarEmailConvite(dados, { config: null, producao: true }), "nao-configurado");
  });

  it("com SMTP envia a mensagem pelo transporte informado", async () => {
    const enviadas: { to: string; subject: string }[] = [];
    const transporte = { sendMail: async (m: { to: string; subject: string }) => void enviadas.push(m) } as never;

    const r = await enviarEmailConvite(dados, {
      config: { host: "smtp.teste", port: 587, secure: false, from: "NomadPlan <x@x>" },
      transporte,
    });

    assert.equal(r, "enviado");
    assert.equal(enviadas[0].to, "ana@exemplo.com");
  });
});
