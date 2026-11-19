import { useState } from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import type { TipoConta } from "../types/usuario";
import Icone from "./Icone";

interface RotaProtegidaProps {
  papeis?: TipoConta[];
}

function RotaProtegida({ papeis }: RotaProtegidaProps) {
  const { usuario, autenticado, carregando, sessaoExpirada, saiuManualmente, sessaoIndisponivel, tentarSessaoDeNovo } = useAuth();
  const location = useLocation();
  const [tentando, setTentando] = useState(false);

  if (carregando) {
    return (
      <div className="container page">
        <p className="loading">Carregando...</p>
      </div>
    );
  }

  // O servidor não respondeu para confirmar a sessão guardada: a pessoa não foi deslogada, então não
  // vai ao login. Mostra a recuperação; a conferência também se repete sozinha.
  if (!autenticado && sessaoIndisponivel) {
    return (
      <div className="container container--narrow page">
        <div className="stack">
          <div className="alert alert--warning" role="alert">
            <Icone nome="alerta" />
            <p>
              Não foi possível confirmar a sua sessão: o servidor não respondeu. Você continua conectado e nada foi
              perdido; tentamos de novo sozinhos a cada poucos segundos.
            </p>
          </div>
          <div className="cluster">
            <button
              type="button"
              className="btn btn--outline"
              disabled={tentando}
              onClick={async () => {
                setTentando(true);

                try {
                  await tentarSessaoDeNovo();
                } finally {
                  setTentando(false);
                }
              }}
            >
              {tentando ? "Tentando..." : "Tentar novamente"}
            </button>
            <Link to="/" className="btn btn--ghost">
              Ir para a página inicial
            </Link>
          </div>
        </div>
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
          destino: location.pathname + location.search,
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
