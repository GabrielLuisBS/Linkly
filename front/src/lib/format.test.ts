import { describe, expect, it } from "vitest";
import { computeLinkStatus, stripProtocol } from "./format";

describe("stripProtocol", () => {
  it("remove http://", () => {
    expect(stripProtocol("http://linkly.to/abc")).toBe("linkly.to/abc");
  });

  it("remove https://", () => {
    expect(stripProtocol("https://linkly.to/abc")).toBe("linkly.to/abc");
  });

  it("não mexe numa URL sem protocolo", () => {
    expect(stripProtocol("linkly.to/abc")).toBe("linkly.to/abc");
  });
});

describe("computeLinkStatus", () => {
  it("desativado tem prioridade sobre expiração", () => {
    const noFuturo = new Date(Date.now() + 86_400_000).toISOString();
    expect(computeLinkStatus(false, noFuturo)).toBe("desativado");
  });

  it("ativo e sem expiração é ativo", () => {
    expect(computeLinkStatus(true, null)).toBe("ativo");
  });

  it("ativo mas com expiração no passado é expirado", () => {
    const passado = new Date(Date.now() - 1000).toISOString();
    expect(computeLinkStatus(true, passado)).toBe("expirado");
  });

  it("ativo e expiração no futuro é ativo", () => {
    const futuro = new Date(Date.now() + 86_400_000).toISOString();
    expect(computeLinkStatus(true, futuro)).toBe("ativo");
  });
});
