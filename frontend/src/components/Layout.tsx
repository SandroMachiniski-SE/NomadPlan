import { Suspense, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import Icone from "./Icone";
import NotificacoesSino from "./NotificacoesSino";

function Marca() {
  return (
    <>
      <img className="brand__logo" src="/emblema.png" alt="" width={40} height={40} />
      <span className="brand__name">
        Nomad<span>Plan</span>
      </span>
    </>
  );
}

function Layout() {
  const { usuario, autenticado, logout } = useAuth();
  const navigate = useNavigate();
  const [menuAberto, setMenuAberto] = useState(false);

  const tipoConta = usuario?.tipoConta;
  const podeCadastrarPontos =
    tipoConta === "NEGOCIO" || tipoConta === "GESTOR" || tipoConta === "MODERADOR" || tipoConta === "ADMIN";
  const podeModerar = tipoConta === "MODERADOR" || tipoConta === "ADMIN";
  const ehAdmin = tipoConta === "ADMIN";

  function aoSair() {
    logout();
    navigate("/");
  }

  const inicial = (usuario?.nome ?? "?").trim().charAt(0).toUpperCase();

  return (
    <div className="app">
      <a className="skip-link" href="#conteudo">
        Ir para o conteúdo
      </a>

      <header className="site-header">
        <div className="container site-header__inner">
          <Link to="/" className="brand" aria-label="NomadPlan — página inicial">
            <Marca />
          </Link>

          <div
            id="menu-principal"
            className="site-menu"
            data-aberto={menuAberto}
            onClick={() => setMenuAberto(false)}
          >
            <nav className="site-nav" aria-label="Principal">
              <NavLink to="/" end className="nav-link">
                Explorar
              </NavLink>

              {autenticado && (
                <NavLink to="/roteiros" className="nav-link">
                  Meus roteiros
                </NavLink>
              )}

              {autenticado && podeCadastrarPontos && (
                <NavLink to="/pontos/meus" className="nav-link">
                  Meus pontos
                </NavLink>
              )}

              {autenticado && podeModerar && (
                <NavLink to="/moderacao" className="nav-link">
                  Moderação
                </NavLink>
              )}

              {autenticado && ehAdmin && (
                <NavLink to="/admin" className="nav-link">
                  Admin
                </NavLink>
              )}
            </nav>

            <div className="site-account">
              {autenticado ? (
                <>
                  <NavLink to="/perfil" className="user-chip">
                    <span className="user-chip__avatar" aria-hidden="true">
                      {inicial}
                    </span>
                    <span className="user-chip__name">{usuario?.nome ?? "Perfil"}</span>
                  </NavLink>

                  <button type="button" className="btn btn--ghost btn--sm" onClick={aoSair}>
                    <Icone nome="sair" />
                    Sair
                  </button>
                </>
              ) : (
                <>
                  <NavLink to="/login" className="btn btn--ghost">
                    Entrar
                  </NavLink>
                  <NavLink to="/registrar" className="btn btn--primary">
                    Cadastre-se
                  </NavLink>
                </>
              )}
            </div>
          </div>

          {autenticado && (
            <div className="site-header__bell">
              <NotificacoesSino />
            </div>
          )}

          <button
            type="button"
            className="nav-toggle"
            aria-label={menuAberto ? "Fechar menu" : "Abrir menu"}
            aria-expanded={menuAberto}
            aria-controls="menu-principal"
            onClick={() => setMenuAberto((atual) => !atual)}
          >
            <Icone nome={menuAberto ? "fechar" : "menu"} />
          </button>
        </div>
      </header>

      <main id="conteudo" className="app__main">
        <Suspense
          fallback={
            <div className="container page">
              <p className="loading">Carregando...</p>
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>

      <footer className="site-footer">
        <div className="container site-footer__inner">
          <div>
            <Link to="/" className="brand" aria-label="NomadPlan — página inicial">
              <Marca />
            </Link>
            <p className="site-footer__tagline">
              Sua jornada digital, planejada e conectada. Descubra lugares e monte roteiros sob
              medida.
            </p>
          </div>

          <div>
            <h2 className="site-footer__title">Explorar</h2>
            <ul className="site-footer__links">
              <li>
                <Link to="/">Buscar pontos turísticos</Link>
              </li>
              {autenticado && (
                <li>
                  <Link to="/roteiros/gerar">Gerar roteiro</Link>
                </li>
              )}
              {autenticado && (
                <li>
                  <Link to="/roteiros">Meus roteiros</Link>
                </li>
              )}
            </ul>
          </div>

          <div>
            <h2 className="site-footer__title">Conta</h2>
            <ul className="site-footer__links">
              {autenticado ? (
                <li>
                  <Link to="/perfil">Meu perfil</Link>
                </li>
              ) : (
                <>
                  <li>
                    <Link to="/login">Entrar</Link>
                  </li>
                  <li>
                    <Link to="/registrar">Criar conta</Link>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>

        <div className="container site-footer__bottom">
          © {new Date().getFullYear()} NomadPlan — Explore. Organize. Thrive.
        </div>
      </footer>
    </div>
  );
}

export default Layout;
