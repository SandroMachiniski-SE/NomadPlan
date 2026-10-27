import "../ambiente";
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import prisma from "../../lib/prisma";
import { criarCliente, criarPonto, criarUsuario, iniciarServidor, limparBanco, SENHA_DE_TESTE, type ServidorDeTeste } from "../suporte";

type Usuario = Awaited<ReturnType<typeof criarUsuario>>;

describe("roteiro colaborativo: convites, papéis e acesso", () => {
  let servidor: ServidorDeTeste;
  let api: ReturnType<typeof criarCliente>;
  let dono: Usuario;
  let editor: Usuario;
  let leitor: Usuario;
  let estranho: Usuario;
  let roteiro: { id: number; itens: { id: number; idPonto: number }[] };

  before(async () => {
    servidor = await iniciarServidor();
    api = criarCliente(servidor.base);
  });

  beforeEach(async () => {
    await limparBanco();
    [dono, editor, leitor, estranho] = [
      await criarUsuario({ nome: "Dona Ana" }),
      await criarUsuario({ nome: "Edu Editor" }),
      await criarUsuario({ nome: "Lia Leitora" }),
      await criarUsuario({ nome: "Eva Estranha" }),
    ];

    const pontos = [await criarPonto({ nome: "A", latitude: 0, longitude: 0 }), await criarPonto({ nome: "B", latitude: 0, longitude: 0.01 })];
    const r = await api("POST", "/roteiros", {
      token: dono.token,
      json: { nome: "Viagem em grupo", pontos: pontos.map((p) => ({ idPonto: p.id })) },
    });
    roteiro = { id: r.corpo.id, itens: (await api("GET", `/roteiros/${r.corpo.id}`, { token: dono.token })).corpo.itens };
  });

  after(async () => {
    await servidor.fechar();
  });

  /** O dono convida e a pessoa aceita: devolve o id do convite aceito. */
  async function adicionarParticipante(pessoa: Usuario, papel: "EDITOR" | "LEITOR") {
    const convite = await api("POST", `/roteiros/${roteiro.id}/convites`, { token: dono.token, json: { email: pessoa.usuario.email, papel } });
    assert.equal(convite.status, 201, JSON.stringify(convite.corpo));
    const aceite = await api("POST", `/convites/${convite.corpo.id}/aceitar`, { token: pessoa.token });
    assert.equal(aceite.status, 200, JSON.stringify(aceite.corpo));
  }

  const detalhe = (token: string) => api("GET", `/roteiros/${roteiro.id}`, { token });

  describe("convites", () => {
    it("o dono convida por e-mail, a pessoa é avisada, vê o convite e aceita", async () => {
      const r = await api("POST", `/roteiros/${roteiro.id}/convites`, {
        token: dono.token,
        json: { email: editor.usuario.email.toUpperCase(), papel: "EDITOR" },
      });

      assert.equal(r.status, 201);
      assert.equal(r.corpo.email, editor.usuario.email, "o e-mail é guardado em minúsculas");

      const aviso = await prisma.notificacao.findFirst({ where: { idUsuario: editor.usuario.id } });
      assert.match(aviso!.mensagem, /Dona Ana convidou você para o roteiro "Viagem em grupo"/);
      assert.equal(aviso!.link, "/convites");

      const lista = await api("GET", "/convites", { token: editor.token });
      assert.equal(lista.corpo.total, 1);
      assert.equal(lista.corpo.dados[0].roteiro.nome, "Viagem em grupo");
      assert.equal(lista.corpo.dados[0].convidante.nome, "Dona Ana");
      assert.equal(lista.corpo.dados[0].papel, "EDITOR");

      const aceite = await api("POST", `/convites/${lista.corpo.dados[0].id}/aceitar`, { token: editor.token });

      assert.equal(aceite.status, 200);
      assert.equal(aceite.corpo.idRoteiro, roteiro.id);
      assert.equal((await api("GET", "/convites", { token: editor.token })).corpo.total, 0, "o convite some depois de aceito");
      assert.equal(await prisma.colaboradorRoteiro.count({ where: { idRoteiro: roteiro.id } }), 1);

      const avisoDoDono = await prisma.notificacao.findFirst({ where: { idUsuario: dono.usuario.id } });
      assert.match(avisoDoDono!.mensagem, /Edu Editor aceitou o convite/);
    });

    it("recusar apaga o convite sem dar acesso e avisa o dono", async () => {
      const convite = (await api("POST", `/roteiros/${roteiro.id}/convites`, { token: dono.token, json: { email: leitor.usuario.email, papel: "LEITOR" } })).corpo;

      const r = await api("POST", `/convites/${convite.id}/recusar`, { token: leitor.token });

      assert.equal(r.status, 200);
      assert.equal((await detalhe(leitor.token)).status, 404);
      assert.equal(await prisma.conviteRoteiro.count(), 0);
      assert.match((await prisma.notificacao.findFirst({ where: { idUsuario: dono.usuario.id } }))!.mensagem, /recusou/);
    });

    it("convite para quem ainda não tem conta espera e aparece quando a conta é criada com aquele e-mail", async () => {
      const email = "futuro.viajante@exemplo.com";

      const r = await api("POST", `/roteiros/${roteiro.id}/convites`, { token: dono.token, json: { email, papel: "LEITOR" } });
      assert.equal(r.status, 201);
      assert.equal(await prisma.notificacao.count(), 0, "não há conta para notificar");

      const novo = await criarUsuario({ email });
      const lista = await api("GET", "/convites", { token: novo.token });

      assert.equal(lista.corpo.total, 1);
      assert.equal((await api("POST", `/convites/${lista.corpo.dados[0].id}/aceitar`, { token: novo.token })).status, 200);
      assert.equal((await detalhe(novo.token)).status, 200);
    });

    it("só a pessoa convidada responde ao convite", async () => {
      const convite = (await api("POST", `/roteiros/${roteiro.id}/convites`, { token: dono.token, json: { email: editor.usuario.email, papel: "EDITOR" } })).corpo;

      assert.equal((await api("POST", `/convites/${convite.id}/aceitar`, { token: estranho.token })).status, 404);
      assert.equal((await api("POST", `/convites/${convite.id}/recusar`, { token: estranho.token })).status, 404);
      assert.equal((await api("GET", "/convites", { token: estranho.token })).corpo.total, 0);
      assert.equal((await api("POST", `/convites/${convite.id}/aceitar`, {})).status, 401);
      assert.equal((await api("POST", "/convites/abc/aceitar", { token: editor.token })).status, 400);
    });

    it("valida: não convida a si mesmo, nem duas vezes, nem quem já participa; e-mail e papel válidos", async () => {
      const convidar = (json: unknown) => api("POST", `/roteiros/${roteiro.id}/convites`, { token: dono.token, json });

      assert.equal((await convidar({ email: dono.usuario.email, papel: "EDITOR" })).status, 400);
      assert.equal((await convidar({ email: "nao-e-email", papel: "EDITOR" })).status, 400);
      assert.equal((await convidar({ email: "a@b.com", papel: "DONO" })).status, 400);
      assert.equal((await convidar({ email: "a@b.com" })).status, 400);

      assert.equal((await convidar({ email: "a@b.com", papel: "EDITOR" })).status, 201);
      assert.equal((await convidar({ email: "A@B.com", papel: "LEITOR" })).status, 409, "convite repetido");

      await adicionarParticipante(editor, "EDITOR");
      assert.equal((await convidar({ email: editor.usuario.email, papel: "LEITOR" })).status, 409, "já participa");
    });

    it("limita a 10 participantes e convites juntos", async () => {
      for (let i = 0; i < 10; i++) {
        const r = await api("POST", `/roteiros/${roteiro.id}/convites`, { token: dono.token, json: { email: `pessoa${i}@exemplo.com`, papel: "LEITOR" } });
        assert.equal(r.status, 201, `convite ${i + 1}`);
      }

      const r = await api("POST", `/roteiros/${roteiro.id}/convites`, { token: dono.token, json: { email: "excedente@exemplo.com", papel: "LEITOR" } });

      assert.equal(r.status, 409);
    });

    it("o dono lista e cancela convites pendentes; ninguém mais vê os e-mails", async () => {
      const convite = (await api("POST", `/roteiros/${roteiro.id}/convites`, { token: dono.token, json: { email: "pendente@exemplo.com", papel: "EDITOR" } })).corpo;
      await adicionarParticipante(editor, "EDITOR");

      const lista = await api("GET", `/roteiros/${roteiro.id}/convites`, { token: dono.token });
      assert.deepEqual(lista.corpo.dados.map((c: { email: string }) => c.email), ["pendente@exemplo.com"]);

      assert.equal((await api("GET", `/roteiros/${roteiro.id}/convites`, { token: editor.token })).status, 403);
      assert.equal((await api("DELETE", `/roteiros/${roteiro.id}/convites/${convite.id}`, { token: editor.token })).status, 403);

      assert.equal((await api("DELETE", `/roteiros/${roteiro.id}/convites/${convite.id}`, { token: dono.token })).status, 204);
      assert.equal((await api("DELETE", `/roteiros/${roteiro.id}/convites/${convite.id}`, { token: dono.token })).status, 404);
    });

    it("convidar exige ser o dono e pedir a um roteiro que não existe dá 404", async () => {
      const json = { email: "x@exemplo.com", papel: "LEITOR" };

      assert.equal((await api("POST", `/roteiros/${roteiro.id}/convites`, { token: estranho.token, json })).status, 404);
      assert.equal((await api("POST", `/roteiros/${roteiro.id}/convites`, { json })).status, 401);
      assert.equal((await api("POST", "/roteiros/999999/convites", { token: dono.token, json })).status, 404);
    });
  });

  describe("o que cada papel pode fazer", () => {
    beforeEach(async () => {
      await adicionarParticipante(editor, "EDITOR");
      await adicionarParticipante(leitor, "LEITOR");
    });

    it("quem participa vê o roteiro com seu papel, o dono e a lista de participantes (sem e-mails)", async () => {
      for (const [pessoa, papel] of [[editor, "EDITOR"], [leitor, "LEITOR"], [dono, "DONO"]] as const) {
        const r = await detalhe(pessoa.token);

        assert.equal(r.status, 200);
        assert.equal(r.corpo.meuPapel, papel);
        assert.equal(r.corpo.usuario.nome, "Dona Ana");
        assert.deepEqual(r.corpo.colaboradores.map((c: { nome: string; papel: string }) => [c.nome, c.papel]), [["Edu Editor", "EDITOR"], ["Lia Leitora", "LEITOR"]]);
        assert.ok(!r.texto.includes(editor.usuario.email), "e-mails de participantes não vazam");
      }
    });

    it("o roteiro aparece na lista dos participantes, com o papel e o dono", async () => {
      const lista = await api("GET", "/roteiros", { token: editor.token });

      assert.equal(lista.corpo.total, 1);
      assert.equal(lista.corpo.dados[0].meuPapel, "EDITOR");
      assert.equal(lista.corpo.dados[0].usuario.nome, "Dona Ana");
      assert.equal((await api("GET", "/roteiros", { token: dono.token })).corpo.dados[0].meuPapel, "DONO");
      assert.equal((await api("GET", "/roteiros", { token: estranho.token })).corpo.total, 0);
    });

    it("o editor altera paradas, dias, custos, notas, checklist e os dados do roteiro", async () => {
      const t = editor.token;
      const [a, b] = roteiro.itens;
      const novo = await criarPonto({ nome: "C" });

      assert.equal((await api("POST", `/roteiros/${roteiro.id}/itens`, { token: t, json: { idPonto: novo.id, dia: 2 } })).status, 201);
      assert.equal((await api("PUT", `/roteiros/${roteiro.id}/itens/organizar`, { token: t, json: { itens: [{ id: b.id, dia: 1 }, { id: a.id, dia: 1 }, { id: (await detalhe(t)).corpo.itens[2].id, dia: 2 }] } })).status, 204);
      assert.equal((await api("PATCH", `/roteiros/${roteiro.id}/itens/${a.id}`, { token: t, json: { custoCentavos: 500 } })).status, 200);
      assert.equal((await api("PATCH", `/roteiros/${roteiro.id}/anotacoes`, { token: t, json: { notas: "do editor" } })).status, 200);
      assert.equal((await api("POST", `/roteiros/${roteiro.id}/checklist`, { token: t, json: { texto: "Algo" } })).status, 201);
      assert.equal((await api("POST", `/roteiros/${roteiro.id}/otimizar`, { token: t, json: {} })).status, 200);
      assert.equal((await api("PUT", `/roteiros/${roteiro.id}`, { token: t, json: { nome: "Novo nome" } })).status, 200);

      // O dono enxerga tudo o que o editor fez.
      const doDono = (await detalhe(dono.token)).corpo;
      assert.equal(doDono.nome, "Novo nome");
      assert.equal(doDono.notas, "do editor");
      assert.equal(doDono.checklist.length, 1);
    });

    it("o histórico mostra quem fez cada alteração", async () => {
      await api("PUT", `/roteiros/${roteiro.id}`, { token: editor.token, json: { nome: "Mudança do editor" } });
      await api("PUT", `/roteiros/${roteiro.id}`, { token: dono.token, json: { nome: "Mudança da dona" } });

      const versoes = (await api("GET", `/roteiros/${roteiro.id}/versoes`, { token: leitor.token })).corpo.dados as { autor: string }[];

      assert.deepEqual(versoes.map((v) => v.autor), ["Dona Ana", "Edu Editor"]);
    });

    it("o editor não exclui, não compartilha o link público, não convida nem gerencia participantes", async () => {
      const t = editor.token;

      assert.equal((await api("DELETE", `/roteiros/${roteiro.id}`, { token: t })).status, 403);
      assert.equal((await api("PATCH", `/roteiros/${roteiro.id}/compartilhar`, { token: t, json: { publico: true } })).status, 403);
      assert.equal((await api("POST", `/roteiros/${roteiro.id}/convites`, { token: t, json: { email: "x@exemplo.com", papel: "LEITOR" } })).status, 403);
      assert.equal((await api("PATCH", `/roteiros/${roteiro.id}/colaboradores/${leitor.usuario.id}`, { token: t, json: { papel: "EDITOR" } })).status, 403);
      assert.equal((await api("DELETE", `/roteiros/${roteiro.id}/colaboradores/${leitor.usuario.id}`, { token: t })).status, 403);

      assert.equal((await detalhe(dono.token)).status, 200, "nada disso mexeu no roteiro");
      assert.equal(await prisma.colaboradorRoteiro.count(), 2);
    });

    it("o leitor só consulta: qualquer alteração é recusada com 403 e nada muda", async () => {
      const t = leitor.token;
      const [a] = roteiro.itens;
      const antes = JSON.stringify((await detalhe(dono.token)).corpo.itens);

      const tentativas: [string, string, unknown?][] = [
        ["PUT", `/roteiros/${roteiro.id}`, { nome: "X" }],
        ["POST", `/roteiros/${roteiro.id}/itens`, { idPonto: 1 }],
        ["PUT", `/roteiros/${roteiro.id}/itens/organizar`, { itens: [{ id: a.id, dia: 2 }] }],
        ["POST", `/roteiros/${roteiro.id}/itens/reordenar`, { idsItensEmOrdem: [a.id] }],
        ["PATCH", `/roteiros/${roteiro.id}/itens/${a.id}`, { custoCentavos: 1 }],
        ["DELETE", `/roteiros/${roteiro.id}/itens/${a.idPonto}`],
        ["POST", `/roteiros/${roteiro.id}/otimizar`, {}],
        ["PATCH", `/roteiros/${roteiro.id}/anotacoes`, { notas: "x" }],
        ["POST", `/roteiros/${roteiro.id}/checklist`, { texto: "x" }],
        ["POST", `/roteiros/${roteiro.id}/versoes/1/restaurar`],
        ["DELETE", `/roteiros/${roteiro.id}`],
        ["PATCH", `/roteiros/${roteiro.id}/compartilhar`, { publico: true }],
      ];

      for (const [metodo, caminho, json] of tentativas) {
        const r = await api(metodo, caminho, { token: t, json });
        assert.equal(r.status, 403, `${metodo} ${caminho}`);
      }

      assert.equal(JSON.stringify((await detalhe(dono.token)).corpo.itens), antes);
      assert.equal((await api("GET", `/roteiros/${roteiro.id}/versoes`, { token: t })).status, 200, "consultar o histórico é permitido");
    });

    it("quem não participa recebe 404 em tudo, como se o roteiro não existisse", async () => {
      const t = estranho.token;

      for (const [metodo, caminho] of [
        ["GET", `/roteiros/${roteiro.id}`],
        ["GET", `/roteiros/${roteiro.id}/versoes`],
        ["PUT", `/roteiros/${roteiro.id}`],
        ["DELETE", `/roteiros/${roteiro.id}`],
        ["POST", `/roteiros/${roteiro.id}/checklist`],
        ["DELETE", `/roteiros/${roteiro.id}/colaboradores/${editor.usuario.id}`],
      ] as const) {
        assert.equal((await api(metodo, caminho, { token: t, ...(metodo === "GET" ? {} : { json: {} }) })).status, 404, `${metodo} ${caminho}`);
      }
    });

    it("o roteiro compartilhado não mostra e-mails nem entra no link público por causa dos convidados", async () => {
      const { corpo } = await api("PATCH", `/roteiros/${roteiro.id}/compartilhar`, { token: dono.token, json: { publico: true } });
      const publico = (await api("GET", `/roteiros/publico/${corpo.slugPublico}`)).texto;

      assert.ok(!publico.includes("Edu Editor") && !publico.includes("colaboradores") && !publico.includes(editor.usuario.email));
    });
  });

  describe("gestão dos participantes", () => {
    beforeEach(async () => {
      await adicionarParticipante(editor, "EDITOR");
      await adicionarParticipante(leitor, "LEITOR");
    });

    it("o dono muda o papel e a mudança vale na hora", async () => {
      assert.equal((await api("PUT", `/roteiros/${roteiro.id}`, { token: leitor.token, json: { nome: "X" } })).status, 403);

      const r = await api("PATCH", `/roteiros/${roteiro.id}/colaboradores/${leitor.usuario.id}`, { token: dono.token, json: { papel: "EDITOR" } });

      assert.equal(r.status, 204);
      assert.equal((await api("PUT", `/roteiros/${roteiro.id}`, { token: leitor.token, json: { nome: "Agora pode" } })).status, 200);

      await api("PATCH", `/roteiros/${roteiro.id}/colaboradores/${leitor.usuario.id}`, { token: dono.token, json: { papel: "LEITOR" } });
      assert.equal((await api("PUT", `/roteiros/${roteiro.id}`, { token: leitor.token, json: { nome: "De novo" } })).status, 403);

      assert.equal((await api("PATCH", `/roteiros/${roteiro.id}/colaboradores/${leitor.usuario.id}`, { token: dono.token, json: { papel: "DONO" } })).status, 400);
      assert.equal((await api("PATCH", `/roteiros/${roteiro.id}/colaboradores/${estranho.usuario.id}`, { token: dono.token, json: { papel: "EDITOR" } })).status, 404);
    });

    it("o dono remove um participante, que perde o acesso na hora", async () => {
      assert.equal((await api("DELETE", `/roteiros/${roteiro.id}/colaboradores/${editor.usuario.id}`, { token: dono.token })).status, 204);

      assert.equal((await detalhe(editor.token)).status, 404);
      assert.equal((await api("GET", "/roteiros", { token: editor.token })).corpo.total, 0);
      assert.equal((await api("DELETE", `/roteiros/${roteiro.id}/colaboradores/${editor.usuario.id}`, { token: dono.token })).status, 404);
    });

    it("cada participante pode sair do roteiro; o dono continua com ele", async () => {
      assert.equal((await api("DELETE", `/roteiros/${roteiro.id}/colaboradores/${leitor.usuario.id}`, { token: leitor.token })).status, 204);

      assert.equal((await detalhe(leitor.token)).status, 404);
      assert.equal((await detalhe(dono.token)).corpo.colaboradores.length, 1);
      assert.ok(await prisma.logAuditoria.findFirst({ where: { acao: "sair_do_roteiro", idUsuario: leitor.usuario.id } }));
    });

    it("excluir o roteiro leva junto os participantes e convites; o dono pode excluir", async () => {
      await api("POST", `/roteiros/${roteiro.id}/convites`, { token: dono.token, json: { email: "pendente@exemplo.com", papel: "LEITOR" } });

      assert.equal((await api("DELETE", `/roteiros/${roteiro.id}`, { token: dono.token })).status, 204);

      assert.equal(await prisma.colaboradorRoteiro.count(), 0);
      assert.equal(await prisma.conviteRoteiro.count(), 0);
      assert.equal((await api("GET", "/roteiros", { token: editor.token })).corpo.total, 0);
    });

    it("registra convites, aceites e mudanças no log de auditoria", async () => {
      await api("PATCH", `/roteiros/${roteiro.id}/colaboradores/${leitor.usuario.id}`, { token: dono.token, json: { papel: "EDITOR" } });
      await api("DELETE", `/roteiros/${roteiro.id}/colaboradores/${leitor.usuario.id}`, { token: dono.token });

      const acoes = (await prisma.logAuditoria.findMany({ where: { idEntidade: roteiro.id } })).map((l) => l.acao);

      for (const esperada of ["convidar_colaborador", "aceitar_convite", "alterar_papel_colaborador", "remover_colaborador"]) {
        assert.ok(acoes.includes(esperada), esperada);
      }
    });
  });

  describe("privacidade (LGPD)", () => {
    it("excluir a conta de um participante remove a participação e os convites dele, sem afetar o roteiro do dono", async () => {
      await adicionarParticipante(editor, "EDITOR");
      await api("POST", `/roteiros/${roteiro.id}/convites`, { token: dono.token, json: { email: leitor.usuario.email, papel: "LEITOR" } });

      assert.equal((await api("DELETE", "/auth/me", { token: editor.token, json: { senha: SENHA_DE_TESTE } })).status, 200);
      assert.equal((await api("DELETE", "/auth/me", { token: leitor.token, json: { senha: SENHA_DE_TESTE } })).status, 200);

      assert.equal(await prisma.colaboradorRoteiro.count(), 0);
      assert.equal(await prisma.conviteRoteiro.count(), 0);
      assert.equal((await detalhe(dono.token)).status, 200);
    });

    it("o download de dados lista os roteiros compartilhados com a pessoa", async () => {
      await adicionarParticipante(editor, "EDITOR");

      const dados = (await api("GET", "/auth/me/dados", { token: editor.token })).corpo;

      assert.deepEqual(dados.roteirosCompartilhadosComigo.map((p: { papel: string; roteiro: { nome: string } }) => [p.papel, p.roteiro.nome]), [["EDITOR", "Viagem em grupo"]]);
    });
  });
});
