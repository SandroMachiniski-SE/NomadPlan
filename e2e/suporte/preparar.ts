import { execSync } from "node:child_process";
import path from "node:path";

// Antes de qualquer teste: cria o banco de ponta a ponta (se preciso), aplica as migrations
// e recarrega as contas e os pontos de partida.
export default function preparar() {
  execSync("npm run e2e:preparar", {
    cwd: path.resolve(__dirname, "../../backend"),
    stdio: "inherit",
  });
}
