import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import type { Notificacao, RespostaNotificacoes } from "../types/admin";
import Icone from "./Icone";

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
    <div ref={containerRef} className="sino">
      <button
        type="button"
        className="sino__botao"
        onClick={aoAbrir}
        aria-label={naoLidas > 0 ? `Notificações (${naoLidas} não lidas)` : "Notificações"}
        aria-expanded={aberto}
      >
        <Icone nome="sino" />
        {naoLidas > 0 && <span className="sino__contador">{naoLidas}</span>}
      </button>

      {aberto && (
        <div className="sino__painel">
          <div className="sino__titulo">Notificações</div>

          {notificacoes.length === 0 ? (
            <p className="sino__vazio">Nenhuma notificação ainda.</p>
          ) : (
            notificacoes.map((notificacao) => (
              <button
                key={notificacao.id}
                type="button"
                className="sino__item"
                data-lida={notificacao.lida}
                onClick={() => aoClicarNotificacao(notificacao)}
              >
                <p className="sino__mensagem">{notificacao.mensagem}</p>
                <p className="sino__data">
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
