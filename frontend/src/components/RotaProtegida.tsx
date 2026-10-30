import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import type { TipoConta } from "../types/usuario";
import Icone from "./Icone";

interface RotaProtegidaProps {
  papeis?: TipoConta[];
}

function RotaProtegida({ papeis }: RotaProtegidaProps) {
  const { usuario, autenticado, carregando, sessaoExpirada, saiuManualmente } = useAuth();
  const location = useLocation();

  if (carregando) {
    return (
      <div className="container page">
        <p className="loading">Carregando...</p>
      </div>
    );
  }

  if (!autenticado) {
    // Quem acabou de sair por conta própria volta ao início; quem nunca entrou vai ao login.
    return (
      <Navigate
        to={saiuManualmente ? "/" : "/login"}
        replace
        state={{
          destino: location.pathname,
          ...(sessaoExpirada ? { mensagem: "Sua sessão expirou. Entre novamente para continuar." } : {}),
        }}
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
