import { describe, expect, it } from "vitest";
import pkg from "../package.json";

describe("smoke", () => {
  it("proves the vitest suite runs to completion", () => {
    expect(1 + 1).toBe(2);
  });

  it("declares the mandatory npm scripts without any watch mode", () => {
    const requiredScripts = [
      "dev",
      "build",
      "tauri",
      "test",
      "test:planning",
      "typecheck",
    ];

    for (const script of requiredScripts) {
      expect(pkg.scripts).toHaveProperty(script);
    }

    for (const script of Object.values(pkg.scripts)) {
      expect(script).not.toContain("--watch");
    }
  });
});
