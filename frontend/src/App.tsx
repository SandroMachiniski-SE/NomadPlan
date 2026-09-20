import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import Layout from "./components/Layout";
import RotaProtegida from "./components/RotaProtegida";
import Home from "./pages/Home";
import NaoEncontrado from "./pages/NaoEncontrado";
import PontoDetalhes from "./pages/PontoDetalhes";
import Roteiros from "./pages/Roteiros";
import RoteiroDetalhes from "./pages/RoteiroDetalhes";
import NovoRoteiro from "./pages/NovoRoteiro";
import Login from "./pages/Login";
import Registrar from "./pages/Registrar";
import EsqueciSenha from "./pages/EsqueciSenha";
import RedefinirSenha from "./pages/RedefinirSenha";
import Perfil from "./pages/Perfil";
import MeusPontos from "./pages/MeusPontos";
import PontoFormulario from "./pages/PontoFormulario";
import Moderacao from "./pages/Moderacao";
import GerarRoteiro from "./pages/GerarRoteiro";
import RoteiroPublico from "./pages/RoteiroPublico";
import FerramentasPontos from "./pages/FerramentasPontos";
import Admin from "./pages/Admin";

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
