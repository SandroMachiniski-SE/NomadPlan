import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";

function Layout() {
  const { usuario, autenticado, logout } = useAuth();
  const navigate = useNavigate();

  const estiloLink = ({ isActive }: { isActive: boolean }) => ({
    color: "white",
    textDecoration: "none",
    fontWeight: isActive ? "bold" : "normal",
  });

  function aoSair() {
    logout();
    navigate("/");
  }

  return (
    <div>
      <header
        style={{
          backgroundColor: "#2563eb",
          color: "white",
          padding: "1rem",
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <NavLink
            to="/"
            style={{ color: "white", textDecoration: "none", fontWeight: "bold" }}
          >
            NomadPlan
          </NavLink>

          <nav style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <NavLink to="/" style={estiloLink}>
              Explorar
            </NavLink>

            {autenticado ? (
              <>
                <NavLink to="/roteiros" style={estiloLink}>
                  Meus roteiros
                </NavLink>

                <NavLink to="/perfil" style={estiloLink}>
                  {usuario?.nome ?? "Perfil"}
                </NavLink>

                <button
                  type="button"
                  onClick={aoSair}
                  style={{
                    background: "none",
                    border: "1px solid rgba(255,255,255,0.6)",
                    borderRadius: 6,
                    color: "white",
                    padding: "0.35rem 0.75rem",
                    cursor: "pointer",
                  }}
                >
                  Sair
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" style={estiloLink}>
                  Entrar
                </NavLink>

                <NavLink
                  to="/registrar"
                  style={{
                    color: "#2563eb",
                    backgroundColor: "white",
                    textDecoration: "none",
                    borderRadius: 6,
                    padding: "0.35rem 0.75rem",
                    fontWeight: "bold",
                  }}
                >
                  Cadastre-se
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <Outlet />
      </main>

      <footer
        style={{
          maxWidth: 960,
          margin: "2rem auto 0",
          padding: "1rem",
          borderTop: "1px solid #ddd",
          color: "#666",
          textAlign: "center",
        }}
      >
        NomadPlan — descubra novos destinos.
      </footer>
    </div>
  );
}

export default Layout;
