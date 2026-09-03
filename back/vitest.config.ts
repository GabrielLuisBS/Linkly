import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Testes ficam junto do código que testam (*.test.ts ao lado do
    // arquivo-fonte), não numa pasta __tests__ separada — mais fácil de
    // achar o teste de um arquivo, mais fácil de notar quando falta um.
    include: ["src/**/*.test.ts"],
  },
});
