import { Link } from "react-router-dom";
import Icone from "../components/Icone";

function Privacidade() {
  return (
    <div className="container container--narrow page">
      <Link to="/" className="back-link">
        <Icone nome="voltar" />
        Voltar
      </Link>

      <div className="page-head">
        <div className="page-head__text">
          <h1>Política de Privacidade</h1>
          <p className="page-head__sub">
            Como o NomadPlan trata seus dados pessoais, conforme a Lei Geral de Proteção de Dados
            (Lei nº 13.709/2018).
          </p>
        </div>
      </div>

      <div className="card card--pad texto-longo">
        <h2>1. Quais dados coletamos</h2>
        <ul>
          <li>
            <strong>Cadastro:</strong> nome, e-mail, senha (guardada apenas como hash irreversível), tipo
            de conta e cidade base.
          </li>
          <li>
            <strong>Preferências:</strong> interesses de viagem, idioma e necessidades de acessibilidade,
            que você informa no perfil.
          </li>
          <li>
            <strong>Uso:</strong> roteiros, pontos salvos, avaliações, sugestões de edição e fotos que você
            envia, além de registros de segurança (login, falhas de login e endereço IP).
          </li>
          <li>
            <strong>Localização:</strong> só quando você pede &ldquo;perto de mim&rdquo;; a posição é usada
            na consulta e não é armazenada.
          </li>
        </ul>

        <h2>2. Para que usamos</h2>
        <p>
          Para oferecer a plataforma: autenticar sua conta, montar e compartilhar roteiros, recomendar
          lugares, moderar conteúdo, proteger o sistema contra abuso e gerar estatísticas agregadas de uso
          sem identificar você.
        </p>

        <h2>3. Base legal</h2>
        <p>
          O tratamento se baseia no seu <strong>consentimento</strong>, dado ao criar a conta, e na
          execução do serviço que você solicitou. Também mantemos registros de segurança por legítimo
          interesse na proteção da plataforma.
        </p>

        <h2>4. Compartilhamento</h2>
        <p>
          Não vendemos seus dados. O nome do autor aparece junto às avaliações e aos roteiros que você
          decidir tornar públicos. Seu e-mail nunca é exibido a outros usuários. Dados podem ser
          compartilhados se houver obrigação legal.
        </p>

        <h2>5. Segurança</h2>
        <p>
          Senhas são protegidas com hash e sessões expiram automaticamente. Você pode ativar a verificação
          em duas etapas (aplicativo autenticador) no seu perfil. Tentativas repetidas de login errado
          bloqueiam o acesso temporariamente.
        </p>

        <h2>6. Seus direitos</h2>
        <p>No seu perfil você pode, a qualquer momento:</p>
        <ul>
          <li>corrigir seus dados cadastrais e preferências;</li>
          <li>
            <strong>baixar uma cópia</strong> de todos os dados que guardamos sobre você (portabilidade);
          </li>
          <li>
            <strong>excluir sua conta</strong>: seus dados pessoais são removidos ou anonimizados. O
            conteúdo que contribuiu à comunidade (como pontos publicados) permanece, sem identificação.
          </li>
        </ul>

        <h2>7. Por quanto tempo guardamos</h2>
        <p>
          Enquanto a conta existir. Após a exclusão, mantemos apenas registros anonimizados e os registros
          de segurança exigidos para auditoria.
        </p>

        <h2>8. Contato</h2>
        <p>
          Dúvidas ou solicitações sobre seus dados podem ser feitas pelo canal de contato indicado no
          repositório do projeto NomadPlan.
        </p>
      </div>
    </div>
  );
}

export default Privacidade;
