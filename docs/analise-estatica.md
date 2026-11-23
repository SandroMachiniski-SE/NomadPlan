# Análise estática e de segurança (SonarCloud)

O CI envia o código e a cobertura de testes ao **SonarCloud**, que aponta bugs, vulnerabilidades, pontos de segurança, código
duplicado e "cheiros" de manutenção, e aplica um **portão de qualidade** (*quality gate*) a cada pull request. Atende ao item de
análise estática e de segurança do núcleo comum de engenharia e ao RNF28 (varreduras de vulnerabilidade automatizadas).

Complementam a análise: `npm audit` das dependências de produção no CI, o Dependabot (`.github/dependabot.yml`) e o ESLint do
frontend (`npm run lint`, que falha o CI).

## Configurar (uma vez, por quem é dono do repositório)

1. Entre em <https://sonarcloud.io> com a conta do GitHub, escolha **Analyze new project** e importe o repositório `NomadPlan`
   (plano gratuito, repositório público).
2. Em *Administration → Analysis Method*, desligue a **análise automática** (a análise vem do CI, que também envia a cobertura).
3. Anote a **organização** e a **chave do projeto** que o SonarCloud mostrou. Se forem diferentes de `sandromachiniski-se` e
   `SandroMachiniski-SE_NomadPlan`, corrija as duas primeiras linhas de `sonar-project.properties`.
4. Em *My Account → Security*, gere um **token** e guarde-o no GitHub em *Settings → Secrets and variables → Actions → New
   repository secret* com o nome `SONAR_TOKEN`. Nunca coloque o token em arquivo do repositório.
5. Faça um push ou abra um pull request: o job **Análise estática (SonarCloud)** passa a rodar. Sem o segredo, o job apenas avisa
   que foi ignorado e o CI não quebra (é o caso dos pull requests do Dependabot, que não recebem segredos).

## O que é analisado

| Item | Configuração |
| --- | --- |
| Código | `backend/src` e `frontend/src`, sem testes, `scripts/` e `node_modules` (`sonar-project.properties`) |
| Cobertura | lcov do backend (`npm run test:cobertura`) e do frontend (`npm run test:cobertura`), enviados como artefatos pelo CI. Ficam fora da conta `scripts/`, os testes de ponta a ponta e de carga (`e2e/`) e os pontos de entrada (`server.ts`, `main.tsx`) |
| Portão de qualidade | O padrão do SonarCloud ("Sonar way") para código novo: sem bugs e vulnerabilidades novos, pontos de segurança revisados, duplicação baixa |

## Como ler o resultado

No painel do projeto em SonarCloud, as abas *Issues*, *Security Hotspots* e *Coverage* trazem o detalhe. Um *security hotspot* é um
trecho sensível (por exemplo, uso de expressão regular ou de criptografia) que precisa de revisão humana: abra, leia o contexto e
marque como *Safe* ou corrija. As decisões sobre riscos aceitos ficam registradas em [seguranca.md](seguranca.md).
