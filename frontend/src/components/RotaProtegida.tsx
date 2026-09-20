import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import type { TipoConta } from "../types/usuario";
import Icone from "./Icone";

interface RotaProtegidaProps {
  papeis?: TipoConta[];
}

function RotaProtegida({ papeis }: RotaProtegidaProps) {
  const { usuario, autenticado, carregando } = useAuth();
  const location = useLocation();

  if (carregando) {
    return (
      <div className="container page">
        <p className="loading">Carregando...</p>
      </div>
    );
  }

  if (!autenticado) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ destino: location.pathname }}
      />
    );
  }

  if (papeis && !papeis.includes(usuario!.tipoConta)) {
    return (
      <div className="container page">
        <div className="alert alert--warning" role="alert">
          <Icone nome="alerta" />
          <p>Você não tem permissão para acessar esta página.</p>
        </div>
      </div>
    );
  }

  return <Outlet />;
}

export default RotaProtegida;
