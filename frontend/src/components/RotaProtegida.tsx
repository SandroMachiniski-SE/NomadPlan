import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";

function RotaProtegida() {
  const { autenticado, carregando } = useAuth();
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

  return <Outlet />;
}

export default RotaProtegida;
