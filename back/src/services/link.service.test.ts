import { describe, expect, it, vi } from "vitest";

// Mesmo motivo do redirect.service.test.ts: link.service.ts importa
// cache.service.ts, que importa db/redis.js e abre conexão TCP de
// verdade só de ser importado. getBySlug() não usa cache nenhum, mas o
// import ainda passa por esse módulo — precisa mockar pra não tentar
// conectar num Redis real que não existe no ambiente de teste.
vi.mock("../db/redis.js", () => ({ redis: {} }));

// O mock que interessa de verdade neste teste: troca o linkRepository de
// verdade (que fala com o Postgres via Prisma, ver link.repository.ts)
// por um objeto falso com só o que este teste precisa — findBySlug()
// programado pra sempre devolver null, simulando "slug não existe no
// banco" sem precisar de nenhum banco de verdade. É exatamente o
// propósito da camada Repository (ver Stack e Ferramentas/Camadas): o
// Service nunca fala com o Prisma diretamente, só com este objeto — então
// trocar o objeto inteiro por um fake é o suficiente pra isolar o Service
// do banco.
vi.mock("../repositories/link.repository.js", () => ({
  linkRepository: {
    findBySlug: vi.fn().mockResolvedValue(null),
  },
}));

import { linkService, LinkNotFoundError } from "./link.service.js";

describe("linkService.getBySlug", () => {
  it("slug inexistente lança LinkNotFoundError, sem tocar banco nenhum", async () => {
    await expect(linkService.getBySlug("slug-que-nao-existe")).rejects.toThrow(
      LinkNotFoundError,
    );
  });
});
