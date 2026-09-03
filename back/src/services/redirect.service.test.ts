import { describe, expect, it, vi } from "vitest";

// redirect.service.ts importa cache.service.ts, que importa db/redis.js —
// e esse módulo abre uma conexão TCP de verdade só de ser importado (o
// construtor do ioredis já tenta conectar). Sem mockar, rodar este teste
// tentaria conectar num Redis real (e falharia, sem REDIS_URL) mesmo sem
// nenhum teste chamar get/set/del — evaluate() é pura, nunca toca o Redis.
vi.mock("../db/redis.js", () => ({ redis: {} }));

import { evaluate } from "./redirect.service.js";
import type { CachedLink } from "./cache.service.js";

describe("evaluate", () => {
  it("link ativo e não expirado retorna ok", () => {
    const link: CachedLink = {
      linkId: "1",
      urlDestino: "https://exemplo.com",
      ativo: true,
      expiraEm: new Date(Date.now() + 86_400_000).toISOString(),
    };

    expect(evaluate(link)).toEqual({
      status: "ok",
      linkId: link.linkId,
      urlDestino: link.urlDestino,
    });
  });

  it("link ativo mas expirado retorna gone", () => {
    const link: CachedLink = {
      linkId: "1",
      urlDestino: "https://exemplo.com",
      ativo: true,
      // Data fixa no passado, não Date.now() - X: com "- X" o teste ainda
      // depende do relógio no momento em que roda (basta trocar o sinal
      // por engano, ou o "X" ser pequeno demais, pra virar uma data no
      // futuro sem querer — exatamente o oposto do que este teste quer
      // garantir). Fixando um ano bem no passado, o teste sempre expira,
      // não importa quando for executado.
      expiraEm: "2020-01-01T00:00:00.000Z",
    };

    expect(evaluate(link)).toEqual({ status: "gone" });
  });

  it("link desativado retorna gone, mesmo sem estar expirado", () => {
    const link: CachedLink = {
      linkId: "1",
      urlDestino: "https://exemplo.com",
      ativo: false,
      // Sem expiração nenhuma (null) de propósito: se este teste passasse
      // só por causa de expiraEm, ele não provaria nada sobre `ativo`. O
      // link só cai aqui por causa do `!data.ativo` em evaluate().
      expiraEm: null,
    };

    expect(evaluate(link)).toEqual({ status: "gone" });
  });
});
