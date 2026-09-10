interface ErroApi {
  response?: {
    data?: {
      erro?: string;
    };
  };
}

export function extrairMensagemErro(err: unknown, mensagemPadrao: string): string {
  if (typeof err === "object" && err !== null && "response" in err) {
    const possivelErro = err as ErroApi;

    if (typeof possivelErro.response?.data?.erro === "string") {
      return possivelErro.response.data.erro;
    }
  }

  return mensagemPadrao;
}
