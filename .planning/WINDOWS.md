---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-07-23T17:38:59.572Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 02 | deviation | src/locales/pt-BR/session.json |  | toolMissing.*.body copy kept generic ('consulte a documentação oficial') per UI-SPEC's own flagged unresolved item — not independently re-verified against current official install docs | open |  | 2026-07-23T17:38:59.572Z |  |

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
  }
]
````
