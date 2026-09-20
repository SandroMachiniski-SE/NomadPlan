import type { NomeIcone } from "../components/Icone";

export const CATEGORIAS_PONTOS = [
  "Natureza",
  "Cultura",
  "Gastronomia",
  "Hospedagem",
  "Aventura",
  "Compras",
  "Religioso",
];

const ICONES_CATEGORIA: Record<string, NomeIcone> = {
  Natureza: "folha",
  Cultura: "monumento",
  Gastronomia: "talheres",
  Hospedagem: "cama",
  Aventura: "montanha",
  Compras: "sacola",
  Religioso: "igreja",
};

export function iconeDaCategoria(categoria: string): NomeIcone {
  return ICONES_CATEGORIA[categoria] ?? "pin";
}
