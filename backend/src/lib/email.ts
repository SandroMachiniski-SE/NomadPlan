import nodemailer, { type Transporter } from "nodemailer";

export interface ConfiguracaoSmtp {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export interface DadosEmailRedefinicao {
  para: string;
  nome: string;
  link: string;
}

export type ResultadoEnvio = "enviado" | "console" | "nao-configurado";

const VALIDADE_MINUTOS = 15;

/**
 * Lê a configuração de SMTP do ambiente. Sem SMTP_HOST não há servidor de e-mail
 * configurado e a função devolve null (o envio cai no modo de desenvolvimento).
 */
export function lerConfiguracaoSmtp(env: NodeJS.ProcessEnv = process.env): ConfiguracaoSmtp | null {
  if (!env.SMTP_HOST) {
    return null;
  }

  const porta = Number(env.SMTP_PORT ?? 587);
  const user = env.SMTP_USER || undefined;

  return {
    host: env.SMTP_HOST,
    port: Number.isFinite(porta) ? porta : 587,
    // Porta 465 usa TLS direto; as demais (587/25) iniciam em texto e sobem com STARTTLS.
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === "true" : porta === 465,
    user,
    pass: env.SMTP_PASS || undefined,
    from: env.EMAIL_FROM || `NomadPlan <${user ?? "nao-responda@nomadplan.local"}>`,
  };
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function montarEmailRedefinicao({ nome, link }: Pick<DadosEmailRedefinicao, "nome" | "link">) {
  const primeiroNome = nome.trim().split(/\s+/)[0] || "";
  const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : "Olá!";

  const texto = [
    saudacao,
    "",
    "Recebemos um pedido para redefinir a senha da sua conta no NomadPlan.",
    "Para escolher uma nova senha, abra o link abaixo:",
    "",
    link,
    "",
    `O link vale por ${VALIDADE_MINUTOS} minutos e só pode ser usado uma vez.`,
    "Se você não fez esse pedido, ignore este e-mail: sua senha continua a mesma.",
    "",
    "— Equipe NomadPlan",
  ].join("\n");

  const linkHtml = escaparHtml(link);

  const html = `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#f8f5ef;font-family:Arial,Helvetica,sans-serif;color:#1c2b31;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellspacing="0" cellpadding="0" style="max-width:480px;background:#ffffff;border-radius:12px;border:1px solid #e4ded0;">
            <tr>
              <td style="padding:28px 32px 8px;">
                <span style="font-size:22px;font-weight:bold;color:#075963;">Nomad<span style="color:#de6b48;">Plan</span></span>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0;">
                <h1 style="margin:0 0 12px;font-size:20px;color:#0a2f37;">${escaparHtml(saudacao)}</h1>
                <p style="margin:0 0 16px;line-height:1.5;">Recebemos um pedido para redefinir a senha da sua conta no NomadPlan. Clique no botão abaixo para escolher uma nova senha.</p>
                <p style="margin:24px 0;">
                  <a href="${linkHtml}" style="display:inline-block;background:#075963;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 24px;border-radius:8px;">Redefinir minha senha</a>
                </p>
                <p style="margin:0 0 8px;font-size:13px;color:#566468;line-height:1.5;">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
                <p style="margin:0 0 16px;font-size:13px;word-break:break-all;"><a href="${linkHtml}" style="color:#075963;">${linkHtml}</a></p>
                <p style="margin:0 0 24px;font-size:13px;color:#566468;line-height:1.5;">O link vale por ${VALIDADE_MINUTOS} minutos e só pode ser usado uma vez. Se você não fez esse pedido, ignore este e-mail: sua senha continua a mesma.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    assunto: "Redefinição de senha — NomadPlan",
    texto,
    html,
  };
}

let transporteEmCache: { chave: string; transporte: Transporter } | null = null;

function obterTransporte(config: ConfiguracaoSmtp): Transporter {
  const chave = JSON.stringify(config);

  if (transporteEmCache?.chave !== chave) {
    transporteEmCache = {
      chave,
      transporte: nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.user ? { user: config.user, pass: config.pass } : undefined,
      }),
    };
  }

  return transporteEmCache.transporte;
}

interface OpcoesEnvio {
  config?: ConfiguracaoSmtp | null;
  transporte?: Transporter;
  producao?: boolean;
}

/**
 * Envia o e-mail com o link de redefinição de senha.
 *
 * - Com SMTP configurado: envia de verdade.
 * - Sem SMTP e fora de produção (modo de desenvolvimento): escreve o link no console
 *   do servidor, para dar para testar o fluxo sem servidor de e-mail.
 * - Sem SMTP em produção: não envia e avisa no log, sem nunca registrar o link (ele
 *   permite trocar a senha da conta).
 */
export async function enviarEmailRedefinicaoSenha(
  dados: DadosEmailRedefinicao,
  opcoes: OpcoesEnvio = {},
): Promise<ResultadoEnvio> {
  const config = opcoes.config === undefined ? lerConfiguracaoSmtp() : opcoes.config;
  const producao = opcoes.producao ?? process.env.NODE_ENV === "production";

  if (!config) {
    if (producao) {
      console.error(
        "SMTP não configurado: o e-mail de redefinição de senha não foi enviado. " +
          "Defina SMTP_HOST (e demais variáveis SMTP_*) no ambiente.",
      );
      return "nao-configurado";
    }

    console.log(
      `[e-mail em modo de desenvolvimento] Link de redefinição de senha para ${dados.para}: ${dados.link}`,
    );
    return "console";
  }

  const { assunto, texto, html } = montarEmailRedefinicao(dados);
  const transporte = opcoes.transporte ?? obterTransporte(config);

  await transporte.sendMail({
    from: config.from,
    to: dados.para,
    subject: assunto,
    text: texto,
    html,
  });

  return "enviado";
}
