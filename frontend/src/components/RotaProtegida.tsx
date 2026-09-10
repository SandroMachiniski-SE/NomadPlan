import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import type { TipoConta } from "../types/usuario";

interface RotaProtegidaProps {
  papeis?: TipoConta[];
}

function RotaProtegida({ papeis }: RotaProtegidaProps) {
  const { usuario, autenticado, carregando } = useAuth();
  const location = useLocation();

  if (carregando) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem" }}>
        <p>Carregando...</p>
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
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem" }}>
        <p>Você não tem permissão para acessar esta página.</p>
      </div>
    );
  }

  return <Outlet />;
}

export default RotaProtegida;
