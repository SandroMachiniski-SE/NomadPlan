import "dotenv/config";
import {
  enviarEmailDeTeste,
  lerConfiguracaoSmtp,
  verificarConexaoSmtp,
} from "../lib/email";

// Uso: npm run email:testar -- destinatario@exemplo.com
// Confere a configuração de SMTP do backend/.env e envia um e-mail de teste.

function explicar(erro: unknown): string {
  const codigo = (erro as { code?: string })?.code;
  const mensagem = erro instanceof Error ? erro.message : String(erro);

  switch (codigo) {
    case "EAUTH":
      return "Usuário ou senha recusados pelo servidor. No Gmail é preciso usar uma SENHA DE APP (https://myaccount.google.com/apppasswords), não a senha normal da conta.";
    case "ECONNECTION":
    case "ETIMEDOUT":
    case "ESOCKET":
    case "EDNS":
      return "Não foi possível conectar ao servidor SMTP. Confira SMTP_HOST e SMTP_PORT (587 é o padrão; use 465 com SMTP_SECURE=true) e se a rede/firewall permite a conexão.";
    case "EENVELOPE":
      return "O servidor recusou o remetente ou o destinatário. Confira EMAIL_FROM e o endereço de destino.";
    default:
      return mensagem;
  }
}

async function main() {
  const destino = process.argv[2];
  const config = lerConfiguracaoSmtp();

  if (!config) {
    console.error(
      "SMTP_HOST não está definido no backend/.env, então nenhum e-mail pode ser enviado.\n" +
        "Veja a seção 'Recuperação de senha' do README para configurar (ex.: Gmail com senha de app).",
    );
    process.exit(1);
  }

  if (!destino) {
    console.error("Informe o destinatário: npm run email:testar -- voce@exemplo.com");
    process.exit(1);
  }

  console.log(`Conectando a ${config.host}:${config.port} (remetente: ${config.from})...`);

  try {
    await verificarConexaoSmtp(config);
    console.log("Conexão e autenticação OK.");

    await enviarEmailDeTeste(destino, config);
    console.log(`E-mail de teste enviado para ${destino}. Confira a caixa de entrada (e o spam).`);
  } catch (erro) {
    console.error(`Falha: ${explicar(erro)}`);
    process.exit(1);
  }
}

main();
