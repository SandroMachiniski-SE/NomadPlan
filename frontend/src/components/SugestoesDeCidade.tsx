import { useCidadesDisponiveis } from "../services/cidades";

/** Lista de sugestões para um campo de cidade: use `list={id}` no input. */
function SugestoesDeCidade({ id }: { id: string }) {
  const cidades = useCidadesDisponiveis();

  return (
    <datalist id={id}>
      {cidades.map((c) => (
        <option key={c.cidade} value={c.cidade} label={`${c.pontos} pontos`} />
      ))}
    </datalist>
  );
}

export default SugestoesDeCidade;
