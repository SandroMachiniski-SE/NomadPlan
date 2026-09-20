import type { ReactNode } from "react";

interface AuthShellProps {
  titulo: string;
  subtitulo?: string;
  rodape?: ReactNode;
  children: ReactNode;
}

function AuthShell({ titulo, subtitulo, rodape, children }: AuthShellProps) {
  return (
    <div className="auth">
      <div className="auth__card card">
        <img className="auth__logo" src="/emblema.png" alt="" width={56} height={56} />
        <h1 className="auth__titulo">{titulo}</h1>
        {subtitulo && <p className="auth__sub">{subtitulo}</p>}

        {children}

        {rodape && <div className="auth__rodape">{rodape}</div>}
      </div>
    </div>
  );
}

export default AuthShell;
