import { describe, expect, it } from "vitest";

import { isValidSessionId } from "./id-format";

describe("isValidSessionId (T-04-16 — flag-injection guard)", () => {
  it("aceita um UUID v4-shaped bem-formado", () => {
    expect(isValidSessionId("a1b2c3d4-e5f6-4789-a012-3456789abcde")).toBe(true);
  });

  it("aceita maiúsculas também (case-insensitive, mesmo formato)", () => {
    expect(isValidSessionId("A1B2C3D4-E5F6-4789-A012-3456789ABCDE")).toBe(true);
  });

  it("REJEITA uma string flag-shaped (--dangerously-skip-permissions) — a asserção central T-04", () => {
    expect(isValidSessionId("--dangerously-skip-permissions")).toBe(false);
  });

  it("rejeita um dash único curto (-x)", () => {
    expect(isValidSessionId("-x")).toBe(false);
  });

  it("rejeita travessia de caminho (../../etc)", () => {
    expect(isValidSessionId("../../etc")).toBe(false);
  });

  it("rejeita string vazia", () => {
    expect(isValidSessionId("")).toBe(false);
  });

  it("rejeita whitespace puro", () => {
    expect(isValidSessionId("   ")).toBe(false);
  });

  it("rejeita um UUID com um caractere extra no fim (quase válido, mas âncorado)", () => {
    expect(isValidSessionId("a1b2c3d4-e5f6-4789-a012-3456789abcdeX")).toBe(false);
  });

  it("rejeita um UUID com um traço faltando (segmento colapsado)", () => {
    expect(isValidSessionId("a1b2c3d4e5f6-4789-a012-3456789abcde")).toBe(false);
  });
});
