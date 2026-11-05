import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Estrelas from "./Estrelas";

describe("Estrelas", () => {
  it("descreve a nota para leitores de tela, sem casa decimal quando é inteira", () => {
    render(<Estrelas nota={4} />);

    expect(screen.getByRole("img", { name: "4 de 5 estrelas" })).toBeTruthy();
  });

  it("mostra uma casa decimal quando a nota é fracionada", () => {
    render(<Estrelas nota={4.5} />);

    expect(screen.getByRole("img", { name: "4.5 de 5 estrelas" })).toBeTruthy();
  });

  it("pinta as estrelas pela nota arredondada", () => {
    const { container } = render(<Estrelas nota={3.6} />);

    expect(container.querySelectorAll(".estrelas__cheia")).toHaveLength(4);
    expect(container.querySelectorAll(".estrelas__vazia")).toHaveLength(1);
  });
});
