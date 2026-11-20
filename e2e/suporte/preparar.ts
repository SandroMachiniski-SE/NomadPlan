import { execFileSync } from "node:child_process";
import path from "node:path";

// Antes de qualquer teste: cria o banco de ponta a ponta (se preciso), aplica as migrations
// e recarrega as contas e os pontos de partida.
export default function preparar() {
  const backend = path.resolve(__dirname, "../../backend");

  // O interpretador e o tsx são chamados por caminho (sem procurar no PATH do sistema).
  execFileSync(process.execPath, [path.join(backend, "node_modules", "tsx", "dist", "cli.mjs"), "src/scripts/prepararE2e.ts"], {
    cwd: backend,
    stdio: "inherit",
  });
}
