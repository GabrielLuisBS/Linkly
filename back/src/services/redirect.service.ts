import { linkRepository } from "../repositories/link.repository.js";
import { cacheService, type CachedLink } from "./cache.service.js";

export type ResolveLinkResult =
  | { status: "ok"; linkId: string; urlDestino: string }
  | { status: "not_found" }
  | { status: "gone" };

function isExpired(expiraEm: string | null): boolean {
  if (!expiraEm) return false;
  return new Date(expiraEm).getTime() <= Date.now();
}

/**
 * Decide se um link cacheado/encontrado ainda é válido. Roda tanto no
 * caminho de HIT quanto no de MISS — checar ativo/expiraEm só na escrita
 * do cache não bastaria, porque um link pode expirar (por tempo) enquanto
 * ainda está com cache quente. Ver "Por que checar ativo e expiraEm mesmo
 * com cache quente" na nota "Redirecionamento" do Obsidian.
 */
export function evaluate(data: CachedLink): ResolveLinkResult {
  if (!data.ativo || isExpired(data.expiraEm)) {
    return { status: "gone" };
  }
  return { status: "ok", linkId: data.linkId, urlDestino: data.urlDestino };
}

export const redirectService = {
  async resolveLink(slug: string): Promise<ResolveLinkResult> {
    const cached = await cacheService.get(slug);
    if (cached) {
      return evaluate(cached);
    }

    const link = await linkRepository.findBySlug(slug);
    if (!link) {
      return { status: "not_found" };
    }

    const candidate: CachedLink = {
      linkId: link.id,
      urlDestino: link.urlDestino,
      ativo: link.ativo,
      expiraEm: link.expiraEm ? link.expiraEm.toISOString() : null,
    };

    const result = evaluate(candidate);
    // Só grava no Redis quando válido — um link inválido/expirado não é
    // cacheado (ver nota "Redirecionamento": "grava no Redis com TTL se
    // válido"), então continua caindo no Postgres até ser corrigido.
    if (result.status === "ok") {
      await cacheService.set(slug, candidate);
    }
    return result;
  },
};
