import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocka cache.service.ts inteiro (não só db/redis.js): como resolveLink()
// (testado mais abaixo) decide entre cache HIT e MISS chamando
// cacheService.get() diretamente, o teste precisa controlar o que esse
// get() devolve. Mockando o módulo inteiro, o cache.service.ts real (e a
// conexão de verdade com o Redis que ele abriria via db/redis.js) nunca
// chega a ser importado — resolve de graça o mesmo problema de conexão
// TCP indevida que apareceu nos testes anteriores de evaluate().
vi.mock("./cache.service.js", () => ({
  cacheService: { get: vi.fn(), set: vi.fn(), del: vi.fn() },
}));

// O outro lado do cache-aside: troca o linkRepository de verdade (Postgres
// via Prisma) por um fake, só pra poder espiar se foi chamado ou não —
// mesma técnica de [[link.service.test.ts]], aqui usada pra provar uma
// ausência de chamada, não um valor de retorno.
vi.mock("../repositories/link.repository.js", () => ({
  linkRepository: { findBySlug: vi.fn() },
}));

import { evaluate, redirectService } from "./redirect.service.js";
import { cacheService, type CachedLink } from "./cache.service.js";
import { linkRepository } from "../repositories/link.repository.js";
import type { Link } from "../generated/prisma/client.js";

function fakeLink(overrides: Partial<Link> = {}): Link {
  return {
    id: "1",
    slug: "abc123",
    urlDestino: "https://exemplo.com",
    ativo: true,
    expiraEm: null,
    criadoEm: new Date(),
    usuarioId: null,
    ...overrides,
  };
}

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

describe("resolveLink", () => {
  // vi.mock() cria os vi.fn() de cacheService/linkRepository UMA vez só,
  // reaproveitados por todo teste deste arquivo. Verificado na prática
  // (removendo este beforeEach e checando .mock.calls em runtime): o
  // HISTÓRICO de chamadas já vem zerado sozinho a cada teste, porque este
  // projeto roda com `clearMocks: true` — o padrão do próprio Vitest 5
  // (confirmado em node_modules/vitest/dist/config.cjs), não algo
  // configurado aqui.
  //
  // Mas `mockReset` é `false` por padrão — só o histórico é limpo, não a
  // IMPLEMENTAÇÃO (o que mockResolvedValue configurou). Se um teste
  // futuro esquecer de programar o próprio retorno de cacheService.get ou
  // linkRepository.findBySlug, ele herdaria em silêncio o valor deixado
  // pelo teste anterior — um resultado "certo" por acidente, não porque o
  // teste provou nada. vi.resetAllMocks() zera as duas coisas
  // (histórico E implementação): esquecer de programar um mock aqui vira
  // erro visível (undefined onde se esperava um link), não um falso
  // positivo silencioso.
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("cache HIT nunca consulta o repository", async () => {
    const cached: CachedLink = {
      linkId: "1",
      urlDestino: "https://exemplo.com",
      ativo: true,
      expiraEm: null,
    };
    // Arrange: cacheService.get() devolve um link válido, como se o Redis
    // tivesse a chave link:{slug} quente — simula o HIT sem Redis nenhum
    // rodando de verdade.
    vi.mocked(cacheService.get).mockResolvedValue(cached);

    // Act
    const result = await redirectService.resolveLink("abc123");

    // Assert: o resultado usa o dado do cache...
    expect(result).toEqual({
      status: "ok",
      linkId: cached.linkId,
      urlDestino: cached.urlDestino,
    });
    // ...e a prova de que resolveLink() de fato tomou o atalho do cache
    // (não é só "o resultado bateu por coincidência"): o repository nunca
    // foi chamado. Se o `if (cached) return evaluate(cached)` de
    // resolveLink() fosse removido ou quebrado, este teste falharia aqui
    // mesmo que o resultado acima continuasse correto por acaso.
    expect(linkRepository.findBySlug).not.toHaveBeenCalled();
  });

  it("cache MISS com link válido consulta o repository e grava no cache", async () => {
    // Arrange: cache vazio (MISS) força a ida ao repository.
    vi.mocked(cacheService.get).mockResolvedValue(null);
    const link = fakeLink();
    vi.mocked(linkRepository.findBySlug).mockResolvedValue(link);

    // Act
    const result = await redirectService.resolveLink("abc123");

    // Assert
    expect(result).toEqual({ status: "ok", linkId: link.id, urlDestino: link.urlDestino });
    expect(linkRepository.findBySlug).toHaveBeenCalledTimes(1);
    expect(linkRepository.findBySlug).toHaveBeenCalledWith("abc123");
    // resolveLink só grava no Redis quando o resultado é "ok" (ver
    // redirect.service.ts) — um link válido vindo do MISS precisa ficar
    // cacheado pro próximo GET/:slug já bater HIT.
    expect(cacheService.set).toHaveBeenCalledTimes(1);
  });

  it("cache MISS com slug inexistente retorna not_found, sem cachear", async () => {
    // Arrange: cache vazio e repository também não encontra nada.
    vi.mocked(cacheService.get).mockResolvedValue(null);
    vi.mocked(linkRepository.findBySlug).mockResolvedValue(null);

    // Act
    const result = await redirectService.resolveLink("nao-existe");

    // Assert
    expect(result).toEqual({ status: "not_found" });
    expect(linkRepository.findBySlug).toHaveBeenCalledTimes(1);
    // Nada pra cachear quando o link nem existe.
    expect(cacheService.set).not.toHaveBeenCalled();
  });
});
