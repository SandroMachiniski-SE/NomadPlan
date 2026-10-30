import { Prisma } from "@prisma/client";
import prisma from "./prisma";

// RF24: sugestões com base em usuários de gostos parecidos. "Gosto parecido" aqui é
// concreto e explicável:
//   - dois usuários que salvaram, avaliaram bem (4 ou 5) ou colocaram em roteiros os
//     mesmos pontos;
//   - mais um ponto de afinidade para cada interesse em comum no perfil.
// Os pontos que essas pessoas parecidas escolheram — e que você ainda não — viram
// recomendação, pesando mais os de quem tem mais afinidade com você.

export interface PontoSimilar {
  id: number;
  pontuacao: number;
}

export async function pontosDeUsuariosSemelhantes(idUsuario: number, limite: number): Promise<PontoSimilar[]> {
  const linhas = await prisma.$queryRaw<{ id: number; pontuacao: number }[]>(Prisma.sql`
    WITH sinais AS (
      SELECT id_usuario AS u, id_ponto AS p, 2 AS w FROM ponto_salvo
      UNION ALL
      SELECT id_autor, id_ponto, 2 FROM avaliacao WHERE status = 'APROVADA' AND nota >= 4
      UNION ALL
      SELECT r.id_usuario, i.id_ponto, 1
      FROM item_roteiro i JOIN roteiro r ON r.id = i.id_roteiro
    ),
    meus AS (
      SELECT p, SUM(w) AS w FROM sinais WHERE u = ${idUsuario} GROUP BY p
    ),
    por_pontos AS (
      SELECT s.u, SUM(LEAST(s.w, m.w)) AS afinidade
      FROM sinais s JOIN meus m ON m.p = s.p
      WHERE s.u <> ${idUsuario}
      GROUP BY s.u
    ),
    por_interesses AS (
      SELECT outro.id AS u, COUNT(*) AS afinidade
      FROM usuario eu
      JOIN usuario outro ON outro.id <> eu.id AND outro.ativo
      CROSS JOIN LATERAL unnest(eu.interesses) AS interesse
      WHERE eu.id = ${idUsuario} AND interesse = ANY (outro.interesses)
      GROUP BY outro.id
    ),
    semelhantes AS (
      SELECT u, SUM(afinidade) AS afinidade
      FROM (SELECT * FROM por_pontos UNION ALL SELECT * FROM por_interesses) todas
      GROUP BY u
    ),
    candidatos AS (
      SELECT s.p, SUM(sem.afinidade * s.w) AS pontuacao
      FROM sinais s JOIN semelhantes sem ON sem.u = s.u
      WHERE s.p NOT IN (SELECT p FROM meus)
      GROUP BY s.p
    )
    SELECT pt.id, c.pontuacao::float8 AS pontuacao
    FROM candidatos c JOIN ponto_turistico pt ON pt.id = c.p
    WHERE pt.status = 'PUBLICADO'
    ORDER BY c.pontuacao DESC, pt.nome ASC
    LIMIT ${limite}
  `);

  return linhas.map((linha) => ({ id: linha.id, pontuacao: Number(linha.pontuacao) }));
}
