// Google Places de mentira para os testes: intercepta só as chamadas a places.googleapis.com
// (o resto, como o cliente HTTP dos testes de integração, segue para o fetch de verdade).

export interface ChamadaGoogle {
  url: string;
  metodo: string;
  campos: string | null;
  chave: string | null;
  corpo: unknown;
}

export type RespostasGoogle = (chamada: ChamadaGoogle) => { status?: number; corpo: unknown } | undefined;

export function instalarGoogleFalso(responder: RespostasGoogle) {
  const original = globalThis.fetch;
  const chamadas: ChamadaGoogle[] = [];

  globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.toString() : entrada.url;

    if (!url.startsWith("https://places.googleapis.com/")) {
      return original(entrada, init);
    }

    const cabecalhos = new Headers(init?.headers);
    const chamada: ChamadaGoogle = {
      url,
      metodo: init?.method ?? "GET",
      campos: cabecalhos.get("X-Goog-FieldMask"),
      chave: cabecalhos.get("X-Goog-Api-Key"),
      corpo: typeof init?.body === "string" ? JSON.parse(init.body) : null,
    };
    chamadas.push(chamada);

    const resposta = responder(chamada) ?? { status: 404, corpo: { error: { message: "não encontrado" } } };

    return new Response(JSON.stringify(resposta.corpo), {
      status: resposta.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  return {
    chamadas,
    desinstalar: () => {
      globalThis.fetch = original;
    },
  };
}

/** Períodos do Google para "Ter-Dom 9h-17h" (dia 0 = domingo). */
export const PERIODOS_TER_A_DOM_9_17 = [0, 2, 3, 4, 5, 6].map((dia) => ({
  open: { day: dia, hour: 9, minute: 0 },
  close: { day: dia, hour: 17, minute: 0 },
}));
