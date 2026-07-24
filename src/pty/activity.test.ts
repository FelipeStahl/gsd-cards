import { describe, expect, it } from "vitest";

import {
  appendToRollingBuffer,
  classifyActivity,
  AWAITING_MARKER,
  BUSY_MARKER,
  ROLLING_BUFFER_CAP,
} from "./activity";

describe("classifyActivity", () => {
  it("retorna null quando nenhum marcador está presente", () => {
    expect(classifyActivity("$ ls -la\ntotal 24\n")).toBeNull();
  });

  it("retorna busy quando o marcador de interrupção está presente", () => {
    expect(classifyActivity("Working... (esc to interrupt)")).toBe("busy");
  });

  it("retorna awaiting quando o marcador de permissão está presente", () => {
    expect(classifyActivity("Do you want to proceed?\n❯ 1. Yes")).toBe("awaiting");
  });

  it("awaiting tem precedência sobre busy quando ambos aparecem na janela", () => {
    const buffer = "Working... (esc to interrupt)\nDo you want to proceed?\n❯ 1. Yes";
    expect(classifyActivity(buffer)).toBe("awaiting");
  });

  it("detecta o marcador busy mesmo cercado por sequências ANSI (cor/cursor)", () => {
    const buffer = "\x1b[33mWorking...\x1b[0m \x1b[2m(esc to interrupt)\x1b[0m\x1b[?25h";
    expect(classifyActivity(buffer)).toBe("busy");
  });

  it("detecta o marcador awaiting mesmo cercado por sequências ANSI", () => {
    const buffer = "\x1b[1mDo you want to proceed?\x1b[0m\n\x1b[36m❯ 1. Yes\x1b[0m";
    expect(classifyActivity(buffer)).toBe("awaiting");
  });

  it("é case-insensitive para ambos os marcadores", () => {
    expect(classifyActivity("ESC TO INTERRUPT")).toBe("busy");
    expect(classifyActivity("DO YOU WANT TO PROCEED?")).toBe("awaiting");
  });
});

describe("appendToRollingBuffer", () => {
  it("concatena chunk ao buffer existente quando dentro do cap", () => {
    expect(appendToRollingBuffer("abc", "def")).toBe("abcdef");
  });

  it("mantém só a cauda quando a soma excede ROLLING_BUFFER_CAP", () => {
    const buffer = "a".repeat(ROLLING_BUFFER_CAP);
    const result = appendToRollingBuffer(buffer, "bbbbb");
    expect(result).toHaveLength(ROLLING_BUFFER_CAP);
    expect(result.endsWith("bbbbb")).toBe(true);
  });

  it("um marcador dividido entre dois appends é detectado assim que ambos os pedaços chegam", () => {
    let buffer = "";
    buffer = appendToRollingBuffer(buffer, "esc to inter");
    // Ainda incompleto — não deve classificar como busy.
    expect(classifyActivity(buffer)).toBeNull();
    buffer = appendToRollingBuffer(buffer, "rupt");
    expect(classifyActivity(buffer)).toBe("busy");
  });

  it("um marcador awaiting dividido entre dois appends é detectado assim que ambos os pedaços chegam", () => {
    let buffer = "";
    buffer = appendToRollingBuffer(buffer, "Do you want to pro");
    expect(classifyActivity(buffer)).toBeNull();
    buffer = appendToRollingBuffer(buffer, "ceed?");
    expect(classifyActivity(buffer)).toBe("awaiting");
  });
});

describe("named constants", () => {
  it("BUSY_MARKER e AWAITING_MARKER são regexes case-insensitive", () => {
    expect(BUSY_MARKER.flags).toContain("i");
    expect(AWAITING_MARKER.flags).toContain("i");
  });

  it("ROLLING_BUFFER_CAP é 2000", () => {
    expect(ROLLING_BUFFER_CAP).toBe(2000);
  });
});
