import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import type { Notificacao, RespostaNotificacoes } from "../types/admin";

function NotificacoesSino() {
  const navigate = useNavigate();
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function buscar() {
    try {
      const resposta = await api.get<RespostaNotificacoes>("/notificacoes");
      setNotificacoes(resposta.data.dados);
      setNaoLidas(resposta.data.naoLidas);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch inicial ao montar o componente
    buscar();
  }, []);

  useEffect(() => {
    function aoClicarFora(evento: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(evento.target as Node)) {
        setAberto(false);
      }
    }

    document.addEventListener("click", aoClicarFora);
    return () => document.removeEventListener("click", aoClicarFora);
  }, []);

  async function aoAbrir() {
    const novoEstado = !aberto;
    setAberto(novoEstado);
    if (novoEstado) {
      await buscar();
    }
  }

  async function aoClicarNotificacao(notificacao: Notificacao) {
    if (!notificacao.lida) {
      try {
        await api.patch(`/notificacoes/${notificacao.id}/lida`);
        setNaoLidas((atual) => Math.max(0, atual - 1));
        setNotificacoes((atual) =>
          atual.map((n) => (n.id === notificacao.id ? { ...n, lida: true } : n)),
        );
      } catch (err) {
        console.error(err);
      }
    }

    setAberto(false);

    if (notificacao.link) {
      navigate(notificacao.link);
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={aoAbrir}
        style={{
          position: "relative",
          background: "none",
          border: "1px solid rgba(255,255,255,0.6)",
          borderRadius: 6,
          color: "white",
          padding: "0.35rem 0.6rem",
          cursor: "pointer",
        }}
      >
        🔔
        {naoLidas > 0 && (
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              backgroundColor: "#dc2626",
              color: "white",
              borderRadius: 999,
              fontSize: "0.7rem",
              padding: "0 5px",
            }}
          >
            {naoLidas}
          </span>
        )}
      </button>

      {aberto && (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 0.5rem)",
            width: 320,
            maxHeight: 400,
            overflowY: "auto",
            backgroundColor: "#fff",
            color: "#111",
            border: "1px solid #ddd",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 10,
          }}
        >
          {notificacoes.length === 0 ? (
            <p style={{ padding: "1rem", color: "#666" }}>Nenhuma notificação ainda.</p>
          ) : (
            notificacoes.map((notificacao) => (
              <button
                key={notificacao.id}
                type="button"
                onClick={() => aoClicarNotificacao(notificacao)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.75rem 1rem",
                  border: "none",
                  borderBottom: "1px solid #eee",
                  backgroundColor: notificacao.lida ? "#fff" : "#eff6ff",
                  cursor: "pointer",
                }}
              >
                <p style={{ margin: 0, fontSize: "0.9rem" }}>{notificacao.mensagem}</p>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "#666" }}>
                  {new Date(notificacao.dataCriacao).toLocaleString("pt-BR")}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default NotificacoesSino;
