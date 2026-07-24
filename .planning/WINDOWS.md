---
schema_version: 1
open_count: 6
waived_count: 0
fixed_count: 0
total_count: 6
last_updated: 2026-07-24T06:26:03.468Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 02 | deviation | src/locales/pt-BR/session.json |  | toolMissing.*.body copy kept generic ('consulte a documentação oficial') per UI-SPEC's own flagged unresolved item — not independently re-verified against current official install docs | open |  | 2026-07-23T17:38:59.572Z |  |
| 2 | 02 | deviation | src/components/terminal/TerminalView.tsx |  | TerminalSearchBar só abre via Ctrl+F/Cmd+F nesta fase — o ícone de busca do chrome header (TerminalPane) não existe em nenhum plano executado (01-06); adicionar o toggle por ícone quando TerminalPane for construído | open |  | 2026-07-23T17:54:39.675Z |  |
| 3 | 02 | deviation | src/components/session/SessionRow.tsx |  | Archive row removal renders instantly (no 150ms fade+collapse per 02-UI-SPEC) — the transient animation needs a pending-removal state in SessionSidebar.tsx, which is out of this plan's declared file scope | open |  | 2026-07-23T18:24:13.726Z |  |
| 4 | 02 | deviation | src/components/terminal/TerminalView.tsx |  | In React StrictMode dev-only double-invoke, the second (surviving) terminal instance's initial resize_session may not be retried after spawn_session resolves (only the first mount's promise chain retries) — cosmetic, dev-only; production builds mount once and are unaffected | open |  | 2026-07-23T18:24:13.863Z |  |
| 5 | 03 | unrun-verify | src/planning/injection.ts |  | D6 backstop: busy-blocks/awaiting-prefills-without-stealing-Enter/idle-sends against a real live claude session not exercised in jsdom — deferred to /gsd-verify-work 3 (Plan 04) | open |  | 2026-07-24T02:56:51.526Z |  |
| 6 | 04 | unrun-verify | .planning/phases/04-casa-persistente/04-07-PLAN.md |  | TERM-04 manual verification (04-VALIDATION Manual-Only, installed build): trigger an awaiting state and a session exit against a real Tauri runtime to confirm the OS notification appears and the rail badge reflects awaiting>exited>count; badge works even when notifications are denied. Automated coverage (mocked plugin) is green; this is the real-OS half. | open |  | 2026-07-24T06:26:03.468Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "02",
    "file": "src/locales/pt-BR/session.json",
    "line": null,
    "description": "toolMissing.*.body copy kept generic ('consulte a documentação oficial') per UI-SPEC's own flagged unresolved item — not independently re-verified against current official install docs",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-23T17:38:59.572Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "02",
    "file": "src/components/terminal/TerminalView.tsx",
    "line": null,
    "description": "TerminalSearchBar só abre via Ctrl+F/Cmd+F nesta fase — o ícone de busca do chrome header (TerminalPane) não existe em nenhum plano executado (01-06); adicionar o toggle por ícone quando TerminalPane for construído",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-23T17:54:39.675Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "02",
    "file": "src/components/session/SessionRow.tsx",
    "line": null,
    "description": "Archive row removal renders instantly (no 150ms fade+collapse per 02-UI-SPEC) — the transient animation needs a pending-removal state in SessionSidebar.tsx, which is out of this plan's declared file scope",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-23T18:24:13.726Z",
    "resolved_at": null
  },
  {
    "id": 4,
    "kind": "deviation",
    "phase": "02",
    "file": "src/components/terminal/TerminalView.tsx",
    "line": null,
    "description": "In React StrictMode dev-only double-invoke, the second (surviving) terminal instance's initial resize_session may not be retried after spawn_session resolves (only the first mount's promise chain retries) — cosmetic, dev-only; production builds mount once and are unaffected",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-23T18:24:13.863Z",
    "resolved_at": null
  },
  {
    "id": 5,
    "kind": "unrun-verify",
    "phase": "03",
    "file": "src/planning/injection.ts",
    "line": null,
    "description": "D6 backstop: busy-blocks/awaiting-prefills-without-stealing-Enter/idle-sends against a real live claude session not exercised in jsdom — deferred to /gsd-verify-work 3 (Plan 04)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-24T02:56:51.526Z",
    "resolved_at": null
  },
  {
    "id": 6,
    "kind": "unrun-verify",
    "phase": "04",
    "file": ".planning/phases/04-casa-persistente/04-07-PLAN.md",
    "line": null,
    "description": "TERM-04 manual verification (04-VALIDATION Manual-Only, installed build): trigger an awaiting state and a session exit against a real Tauri runtime to confirm the OS notification appears and the rail badge reflects awaiting>exited>count; badge works even when notifications are denied. Automated coverage (mocked plugin) is green; this is the real-OS half.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-07-24T06:26:03.468Z",
    "resolved_at": null
  }
]
````
