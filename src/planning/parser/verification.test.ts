import { describe, expect, it } from "vitest";

import { parseVerificationFile } from "./verification";
import { isUnrecognized } from "../parse-result";

import verificationMd from "../__fixtures__/artifacts/01-VERIFICATION.md?raw";

describe("parseVerificationFile — fixture real (01-VERIFICATION.md)", () => {
  it("devolve status restrito ao vocabulário conhecido e os demais campos do frontmatter", () => {
    const result = parseVerificationFile(verificationMd, "01-VERIFICATION.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.value.frontmatter.phase).toBe("01-espelho-fiel");
    expect(result.value.frontmatter.status).toBe("passed");
    expect(result.value.frontmatter.score).toContain("4/4");
    expect(result.value.frontmatter.behaviorUnverified).toBe(0);
  });

  it("extrai as linhas de ### Observable Truths com o marcador de cada uma", () => {
    const result = parseVerificationFile(verificationMd, "01-VERIFICATION.md");
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;

    expect(result.value.observableTruths).toHaveLength(4);
    expect(result.value.observableTruths[0].marker).toContain("VERIFIED");
    expect(result.value.observableTruths[2].truth).toContain("degrada localmente");
  });
});

describe("parseVerificationFile — status nunca cai em passed por default", () => {
  it("valor desconhecido de status resulta em unrecognized — explicitamente não em passed", () => {
    const raw = `---
phase: 09-teste
verified: 2026-07-23T12:00:00Z
status: something_unexpected
score: 1/1 must-haves verified
---

# Verification

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | algo | ✓ VERIFIED | evidência |
`;
    const result = parseVerificationFile(raw, "unknown-status.md");
    expect(isUnrecognized(result)).toBe(true);
    if (isUnrecognized(result)) {
      expect(result.issues.some((issue) => issue.field === "status")).toBe(true);
    }
    // Explicitamente, o resultado nunca deve ser "ok" com status "passed" por default.
    if (result.kind === "ok") {
      expect(result.value.frontmatter.status).not.toBe("passed");
    }
  });

  it("status ausente do frontmatter resulta em unrecognized, não lança exceção", () => {
    expect(() => {
      const raw = `---
phase: 09-teste
verified: 2026-07-23T12:00:00Z
---

# Verification
`;
      const result = parseVerificationFile(raw, "missing-status.md");
      expect(isUnrecognized(result)).toBe(true);
    }).not.toThrow();
  });

  it("frontmatter YAML malformado resulta em unrecognized", () => {
    const raw = `---
phase: 09-teste
status: passed
  bad indentation: [
---

# Verification
`;
    const result = parseVerificationFile(raw, "malformed.md");
    expect(isUnrecognized(result)).toBe(true);
  });
});
