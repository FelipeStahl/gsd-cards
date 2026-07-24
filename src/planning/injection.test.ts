import { describe, expect, it } from "vitest";

import { resolveInjection, type InjectionKind } from "./injection";
import type { TerminalActivity } from "../pty/activity";

const KINDS: InjectionKind[] = ["phase", "parameterless", "parameterized"];
const ACTIVITIES: (TerminalActivity | undefined)[] = ["idle", "busy", "awaiting", undefined];

describe("resolveInjection — Injection Behavior Matrix (ACT-02/ACT-03)", () => {
  describe("sem alvo vivo (hasLiveTarget=false) — unavailable, qualquer kind/atividade", () => {
    for (const kind of KINDS) {
      for (const activity of ACTIVITIES) {
        it(`kind=${kind} activity=${activity ?? "undefined"}`, () => {
          const result = resolveInjection({ command: "/gsd-execute-phase 03", kind, activity, hasLiveTarget: false });
          expect(result).toEqual({ mode: "unavailable", payload: null, guardKey: "board.actions.guard.noSession" });
        });
      }
    }
  });

  describe("busy — blocked, payload null, ZERO injeção, qualquer kind", () => {
    for (const kind of KINDS) {
      it(`kind=${kind}`, () => {
        const result = resolveInjection({
          command: "/gsd-execute-phase 03",
          kind,
          activity: "busy",
          hasLiveTarget: true,
        });
        expect(result).toEqual({ mode: "blocked", payload: null, guardKey: "board.actions.guard.busy" });
      });
    }
  });

  describe("kind=phase", () => {
    it("ociosa -> send + \\r", () => {
      const result = resolveInjection({
        command: "/gsd-execute-phase 03",
        kind: "phase",
        activity: "idle",
        hasLiveTarget: true,
      });
      expect(result).toEqual({ mode: "send", payload: "/gsd-execute-phase 03\r" });
    });

    it("undefined (sem sinal ainda) -> tratada como ociosa, send + \\r", () => {
      const result = resolveInjection({
        command: "/gsd-execute-phase 03",
        kind: "phase",
        activity: undefined,
        hasLiveTarget: true,
      });
      expect(result).toEqual({ mode: "send", payload: "/gsd-execute-phase 03\r" });
    });

    it("aguardando permissão -> prefill sem \\r, guard.prefilled", () => {
      const result = resolveInjection({
        command: "/gsd-execute-phase 03",
        kind: "phase",
        activity: "awaiting",
        hasLiveTarget: true,
      });
      expect(result).toEqual({
        mode: "prefill",
        payload: "/gsd-execute-phase 03",
        guardKey: "board.actions.guard.prefilled",
      });
    });
  });

  describe("kind=parameterless", () => {
    it("ociosa -> send + \\r", () => {
      const result = resolveInjection({
        command: "/gsd-next",
        kind: "parameterless",
        activity: "idle",
        hasLiveTarget: true,
      });
      expect(result).toEqual({ mode: "send", payload: "/gsd-next\r" });
    });

    it("undefined -> tratada como ociosa, send + \\r", () => {
      const result = resolveInjection({
        command: "/gsd-next",
        kind: "parameterless",
        activity: undefined,
        hasLiveTarget: true,
      });
      expect(result).toEqual({ mode: "send", payload: "/gsd-next\r" });
    });

    it("aguardando permissão -> prefill sem \\r, guard.prefilled", () => {
      const result = resolveInjection({
        command: "/gsd-next",
        kind: "parameterless",
        activity: "awaiting",
        hasLiveTarget: true,
      });
      expect(result).toEqual({
        mode: "prefill",
        payload: "/gsd-next",
        guardKey: "board.actions.guard.prefilled",
      });
    });
  });

  describe("kind=parameterized — sempre prefill, nunca \\r, sempre espaço final", () => {
    it("ociosa -> prefill + espaço, guard.prefilled (nunca envia sem N)", () => {
      const result = resolveInjection({
        command: "/gsd-execute-phase",
        kind: "parameterized",
        activity: "idle",
        hasLiveTarget: true,
      });
      expect(result).toEqual({
        mode: "prefill",
        payload: "/gsd-execute-phase ",
        guardKey: "board.actions.guard.prefilled",
      });
    });

    it("undefined -> tratada como ociosa, prefill + espaço", () => {
      const result = resolveInjection({
        command: "/gsd-execute-phase",
        kind: "parameterized",
        activity: undefined,
        hasLiveTarget: true,
      });
      expect(result).toEqual({
        mode: "prefill",
        payload: "/gsd-execute-phase ",
        guardKey: "board.actions.guard.prefilled",
      });
    });

    it("aguardando permissão -> prefill + espaço, guard.prefilled", () => {
      const result = resolveInjection({
        command: "/gsd-execute-phase",
        kind: "parameterized",
        activity: "awaiting",
        hasLiveTarget: true,
      });
      expect(result).toEqual({
        mode: "prefill",
        payload: "/gsd-execute-phase ",
        guardKey: "board.actions.guard.prefilled",
      });
    });
  });
});
