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

          <Route element={<RotaProtegida />}>
            <Route path="/roteiros" element={<Roteiros />} />
            <Route path="/roteiros/:id" element={<RoteiroDetalhes />} />
            <Route path="/roteiros/novo" element={<NovoRoteiro />} />
            <Route path="/perfil" element={<Perfil />} />
          </Route>
        </Route>

        <Route path="*" element={<NaoEncontrado />} />
      </Routes>
    </AuthProvider>
  );
}

export default App;
