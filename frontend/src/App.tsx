import { lazy } from "react";
import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Layout from "./components/Layout";
import RotaProtegida from "./components/RotaProtegida";
import Home from "./pages/Home";
const NaoEncontrado = lazy(() => import("./pages/NaoEncontrado"));
const PontoDetalhes = lazy(() => import("./pages/PontoDetalhes"));
const Roteiros = lazy(() => import("./pages/Roteiros"));
const RoteiroDetalhes = lazy(() => import("./pages/RoteiroDetalhes"));
const NovoRoteiro = lazy(() => import("./pages/NovoRoteiro"));
const Login = lazy(() => import("./pages/Login"));
const Registrar = lazy(() => import("./pages/Registrar"));
const EsqueciSenha = lazy(() => import("./pages/EsqueciSenha"));
const RedefinirSenha = lazy(() => import("./pages/RedefinirSenha"));
const Perfil = lazy(() => import("./pages/Perfil"));
const MeusPontos = lazy(() => import("./pages/MeusPontos"));
const PontoFormulario = lazy(() => import("./pages/PontoFormulario"));
const Moderacao = lazy(() => import("./pages/Moderacao"));
const GerarRoteiro = lazy(() => import("./pages/GerarRoteiro"));
const RoteiroPublico = lazy(() => import("./pages/RoteiroPublico"));
const FerramentasPontos = lazy(() => import("./pages/FerramentasPontos"));
const Admin = lazy(() => import("./pages/Admin"));

const PAPEIS_CADASTRADORES = ["NEGOCIO", "GESTOR", "MODERADOR", "ADMIN"] as const;
const PAPEIS_FERRAMENTAS = ["GESTOR", "MODERADOR", "ADMIN"] as const;
const PAPEIS_MODERADORES = ["MODERADOR", "ADMIN"] as const;
const PAPEIS_ADMIN = ["ADMIN"] as const;

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/pontos/:id" element={<PontoDetalhes />} />
          <Route path="/login" element={<Login />} />
          <Route path="/registrar" element={<Registrar />} />
          <Route path="/esqueci-senha" element={<EsqueciSenha />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
          <Route path="/roteiros/publico/:slug" element={<RoteiroPublico />} />

          <Route element={<RotaProtegida />}>
            <Route path="/roteiros" element={<Roteiros />} />
            <Route path="/roteiros/:id" element={<RoteiroDetalhes />} />
            <Route path="/roteiros/novo" element={<NovoRoteiro />} />
            <Route path="/roteiros/gerar" element={<GerarRoteiro />} />
            <Route path="/perfil" element={<Perfil />} />
          </Route>

          <Route element={<RotaProtegida papeis={[...PAPEIS_CADASTRADORES]} />}>
            <Route path="/pontos/meus" element={<MeusPontos />} />
            <Route path="/pontos/novo" element={<PontoFormulario />} />
            <Route path="/pontos/:id/editar" element={<PontoFormulario />} />
          </Route>

          <Route element={<RotaProtegida papeis={[...PAPEIS_FERRAMENTAS]} />}>
            <Route path="/pontos/ferramentas" element={<FerramentasPontos />} />
          </Route>

          <Route element={<RotaProtegida papeis={[...PAPEIS_MODERADORES]} />}>
            <Route path="/moderacao" element={<Moderacao />} />
          </Route>

          <Route element={<RotaProtegida papeis={[...PAPEIS_ADMIN]} />}>
            <Route path="/admin" element={<Admin />} />
          </Route>

          <Route path="*" element={<NaoEncontrado />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
