// Tempo limite curto da busca (300 ms), para o teste conseguir provocar o erro de tempo
// esgotado (AF02). Precisa ser importado ANTES de qualquer módulo da aplicação.
process.env.BUSCA_TIMEOUT_MS = "300";

import "./ambiente";
