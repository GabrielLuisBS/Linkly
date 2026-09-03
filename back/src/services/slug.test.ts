import { describe, expect, it } from "vitest";
import { isValidSlugFormat } from "./slug.js";

describe("isValidSlugFormat", () => {
  it("aceita slugs gerados pelo nanoid (alfanumérico, - e _)", () => {
    expect(isValidSlugFormat("aB3-_9xZ")).toBe(true);
  });

  it("aceita um único caractere", () => {
    expect(isValidSlugFormat("a")).toBe(true);
  });

  it("recusa string vazia", () => {
    expect(isValidSlugFormat("")).toBe(false);
  });

  it("recusa mais de 16 caracteres — mesmo teto do VarChar(16) do schema", () => {
    expect(isValidSlugFormat("a".repeat(17))).toBe(false);
  });

  it("aceita exatamente 16 caracteres", () => {
    expect(isValidSlugFormat("a".repeat(16))).toBe(true);
  });

  it("recusa caracteres fora do alfabeto (espaço, barra, ponto)", () => {
    expect(isValidSlugFormat("abc def")).toBe(false);
    expect(isValidSlugFormat("../etc")).toBe(false);
    expect(isValidSlugFormat("abc.def")).toBe(false);
  });
});
