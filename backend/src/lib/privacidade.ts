import { randomBytes } from "crypto";
import { Prisma, StatusPonto, TipoConta } from "@prisma/client";
import prisma from "./prisma";
import { gerarHashSenha } from "./auth";
import { registrarAuditoria } from "./auditoria";
import { removerArquivoPublico } from "./arquivos";

// LGPD (RNF13, AF10): exportação dos dados pessoais e anonimização da conta.

export class ErroPrivacidade extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
  }
}

/**
 * Anonimiza a conta: a linha do usuário é mantida (para não quebrar o histórico de
 * auditoria, as avaliações e as sugestões já publicadas), mas sem nenhum dado pessoal,
 * e fica impossível de usar para entrar. Conteúdo estritamente pessoal é apagado.
 */
export async function anonimizarUsuario(idUsuario: number): Promise<void> {
  const usuario = await prisma.usuario.findUnique({
    where: { id: idUsuario },
    select: { id: true, tipoConta: true, removidoEm: true, email: true },
  });

  if (!usuario || usuario.removidoEm) {
    throw new ErroPrivacidade("Conta não encontrada.", 404);
  }

  if (usuario.tipoConta === TipoConta.ADMIN) {
    const outrosAdmins = await prisma.usuario.count({
      where: { tipoConta: TipoConta.ADMIN, ativo: true, id: { not: idUsuario } },
    });

    if (outrosAdmins === 0) {
      throw new ErroPrivacidade(
        "Você é o único administrador. Promova outra pessoa a administrador antes de excluir sua conta.",
        409,
      );
    }
  }

  const emailOriginal = usuario.email.toLowerCase();

  const hashInutilizavel = await gerarHashSenha(randomBytes(32).toString("hex"));

  const avaliacoesComFoto = await prisma.avaliacao.findMany({
    where: { idAutor: idUsuario, fotoUrl: { not: null } },
    select: { fotoUrl: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.roteiro.deleteMany({ where: { idUsuario } });
    // Participações em roteiros de outras pessoas e convites enviados ou recebidos.
    await tx.colaboradorRoteiro.deleteMany({ where: { idUsuario } });
    await tx.conviteRoteiro.deleteMany({ where: { OR: [{ idConvidante: idUsuario }, { email: emailOriginal }] } });
    await tx.notificacao.deleteMany({ where: { idUsuario } });
    await tx.pontoSalvo.deleteMany({ where: { idUsuario } });
    await tx.avaliacao.updateMany({ where: { idAutor: idUsuario }, data: { fotoUrl: null } });

    // Rascunhos e pontos rejeitados nunca foram públicos: somem com a conta.
    await tx.pontoTuristico.deleteMany({
      where: {
        idResponsavel: idUsuario,
        status: { in: [StatusPonto.RASCUNHO, StatusPonto.REJEITADO] },
      },
    });
    // Os já publicados continuam no inventário, sem responsável.
    await tx.pontoTuristico.updateMany({
      where: { idResponsavel: idUsuario },
      data: { idResponsavel: null },
    });

    // O IP das tentativas de login é dado pessoal; o evento em si permanece no log.
    await tx.logAuditoria.updateMany({
      where: { idUsuario, acao: "login_falhou" },
      data: { detalhes: Prisma.DbNull },
    });

    await tx.usuario.update({
      where: { id: idUsuario },
      data: {
        nome: "Usuário removido",
        email: `removido-${idUsuario}@anonimo.invalid`,
        senhaHash: hashInutilizavel,
        tipoConta: TipoConta.VISITANTE,
        cidadeBase: null,
        interesses: [],
        preferenciasAcessibilidade: [],
        idioma: "pt-BR",
        reputacao: 0,
        ativo: false,
        mfaAtivo: false,
        mfaSegredo: null,
        consentimentoEm: null,
        removidoEm: new Date(),
      },
    });
  });

  await Promise.all(avaliacoesComFoto.map((a) => removerArquivoPublico(a.fotoUrl)));

  await registrarAuditoria({
    idUsuario,
    acao: "anonimizar_conta",
    entidade: "usuario",
    idEntidade: idUsuario,
  });
}

/** Tudo o que o sistema guarda sobre a pessoa, num formato legível (portabilidade). */
export async function exportarDadosDoUsuario(idUsuario: number) {
  const [perfil, roteiros, participacoes, avaliacoes, sugestoes, pontosCadastrados, pontosSalvos, notificacoes, historico] =
    await Promise.all([
      prisma.usuario.findUnique({
        where: { id: idUsuario },
        select: {
          id: true,
          nome: true,
          email: true,
          tipoConta: true,
          cidadeBase: true,
          interesses: true,
          idioma: true,
          preferenciasAcessibilidade: true,
          reputacao: true,
          mfaAtivo: true,
          consentimentoEm: true,
          dataCriacao: true,
        },
      }),
      prisma.roteiro.findMany({
        where: { idUsuario },
        include: {
          itens: { orderBy: [{ dia: "asc" }, { ordem: "asc" }], include: { ponto: { select: { id: true, nome: true } } } },
          checklist: { orderBy: { ordem: "asc" } },
        },
      }),
      prisma.colaboradorRoteiro.findMany({
        where: { idUsuario },
        select: { papel: true, dataCriacao: true, roteiro: { select: { id: true, nome: true } } },
      }),
      prisma.avaliacao.findMany({
        where: { idAutor: idUsuario },
        select: {
          id: true,
          nota: true,
          comentario: true,
          fotoUrl: true,
          status: true,
          dataCriacao: true,
          ponto: { select: { id: true, nome: true } },
        },
      }),
      prisma.sugestaoEdicao.findMany({
        where: { idAutor: idUsuario },
        select: {
          id: true,
          camposPropostos: true,
          mensagem: true,
          status: true,
          dataCriacao: true,
          ponto: { select: { id: true, nome: true } },
        },
      }),
      prisma.pontoTuristico.findMany({
        where: { idResponsavel: idUsuario },
        select: { id: true, nome: true, status: true, dataCriacao: true },
      }),
      prisma.pontoSalvo.findMany({
        where: { idUsuario },
        select: { dataCriacao: true, ponto: { select: { id: true, nome: true } } },
      }),
      prisma.notificacao.findMany({
        where: { idUsuario },
        select: { mensagem: true, lida: true, dataCriacao: true },
      }),
      prisma.logAuditoria.findMany({
        where: { idUsuario },
        orderBy: { dataCriacao: "desc" },
        take: 500,
        select: { acao: true, entidade: true, idEntidade: true, dataCriacao: true },
      }),
    ]);

  return {
    geradoEm: new Date().toISOString(),
    perfil,
    roteiros,
    roteirosCompartilhadosComigo: participacoes,
    avaliacoes,
    sugestoes,
    pontosCadastrados,
    pontosSalvos,
    notificacoes,
    historicoDeAcoes: historico,
  };
}
