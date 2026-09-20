import { Link } from "react-router-dom";
import Icone from "../components/Icone";

function NaoEncontrado() {
  return (
    <div className="nao-encontrado">
      <div className="nao-encontrado__conteudo">
        <img src="/emblema.png" alt="" width={96} height={96} className="nao-encontrado__logo" />
        <p className="nao-encontrado__codigo">404</p>
        <h1>Você se perdeu no caminho</h1>
        <p className="muted">A página que você tentou acessar não existe ou foi movida.</p>
        <Link to="/" className="btn btn--primary btn--lg">
          <Icone nome="voltar" />
          Voltar para a página inicial
        </Link>
      </div>
    </div>
  );
}

export default NaoEncontrado;
