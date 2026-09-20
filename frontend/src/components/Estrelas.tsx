import Icone from "./Icone";

interface EstrelasProps {
  nota: number;
  tamanho?: "padrao" | "grande";
}

function Estrelas({ nota, tamanho = "padrao" }: EstrelasProps) {
  const arredondada = Math.round(nota);

  return (
    <span
      className={tamanho === "grande" ? "estrelas estrelas--grande" : "estrelas"}
      role="img"
      aria-label={`${nota.toFixed(nota % 1 === 0 ? 0 : 1)} de 5 estrelas`}
    >
      {[1, 2, 3, 4, 5].map((posicao) => (
        <Icone
          key={posicao}
          nome="estrela"
          className={posicao <= arredondada ? "icon--fill estrelas__cheia" : "estrelas__vazia"}
        />
      ))}
    </span>
  );
}

export default Estrelas;
