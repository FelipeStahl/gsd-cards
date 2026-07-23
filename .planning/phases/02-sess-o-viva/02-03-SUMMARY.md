---
phase: 02-sess-o-viva
plan: 03
subsystem: sessions
tags: [tauri, rust, which, fs-scope, claude-code, session-discovery, dependency-detection]

requires:
  - phase: 02-sess-o-viva/02-01
    provides: TreeGuard/pty.rs scaffolding and PtyManager state shape reused as structural analogs
  - phase: 01-espelho-fiel
    provides: project.rs canonicalize+is_contained+allow_directory scope-grant pattern, phase-scan.ts defensive-scan pattern
provides:
  - check_claude_on_path Tauri command (which::which-based, global, cross-platform)
  - has_gsd_core additive field on ValidatedProject (project-root OR home OR PATH detection)
  - register_sessions_scope Tauri command (narrow fs-scope grant to ~/.claude/projects/<encoded>/ only)
  - encode_project_path (verified Claude Code path-encoding rule: separators -> "-")
  - listSessions (discover.ts) — shallow *.jsonl scan, id + mtime only, degrades to []
  - jsonl-signals.ts pure helpers (extractSessionId, sortByLastModifiedDesc)
affects: [02-04, 02-05, 02-06]

tech-stack:
  added: []
  patterns:
    - "resolve_on_path(bin_name) extracted as a pure parametrized helper so both which-present and which-absent branches are testable without depending on `claude` actually being installed on the test/CI machine"
    - "dir_has_gsd_core(dir) extracted as a pure helper (no AppHandle) so has_gsd_core's directory-existence logic is unit-testable via std::env::temp_dir()"
    - "register_sessions_scope grants fs scope to a path that may not exist yet — Tauri's allow_directory only registers a glob ACL pattern, no I/O/existence check — the [] degradation lives entirely on the TS side (discover.ts)"

key-files:
  created:
    - src-tauri/src/dependencies.rs
    - src-tauri/src/sessions.rs
    - src/dependencies/check.ts
    - src/dependencies/check.test.ts
    - src/sessions/discover.ts
    - src/sessions/discover.test.ts
    - src/sessions/jsonl-signals.ts
    - src/sessions/jsonl-signals.test.ts
  modified:
    - src-tauri/src/project.rs
    - src-tauri/src/lib.rs
    - src/planning/read.ts

key-decisions:
  - "has_gsd_core computed as project-root .claude/gsd-core/ OR home .claude/gsd-core/ OR `which gsd-tools` — no official gsd-core doctor/health-check command exists, so this is directory-existence inference (02-RESEARCH.md Pattern 5), documented inline in project.rs"
  - "hasGsdCore added to the TS ValidatedProject interface in read.ts (not in the plan's files_modified list) so check.ts's deriveToolMissingState has typed access to the field the Rust side already serializes via camelCase rename — additive, no behavior change to existing callers"
  - "register_sessions_scope does not canonicalize/require existence of the encoded sessions subfolder — Tauri's allow_directory is a pure ACL-pattern registration with no filesystem I/O, so a brand-new project with zero sessions still gets scope granted safely; discover.ts's readDir failure is what produces the [] degradation"

patterns-established:
  - "Pure-function extraction for OS/global-state Tauri commands (resolve_on_path, dir_has_gsd_core) so unit tests can cover both branches deterministically without mocking which::which or AppHandle"

requirements-completed: [PROJ-04, SESS-01]

coverage:
  - id: D1
    description: "check_claude_on_path detects `claude` on PATH via which::which and returns None when absent, without ever attempting to install anything"
    requirement: "PROJ-04"
    verification:
      - kind: unit
        ref: "src-tauri/src/dependencies.rs#dependencies::tests::resolves_path_for_a_binary_known_to_be_on_path"
        status: pass
      - kind: unit
        ref: "src-tauri/src/dependencies.rs#dependencies::tests::returns_none_for_a_binary_that_does_not_exist"
        status: pass
      - kind: unit
        ref: "src-tauri/src/dependencies.rs#dependencies::tests::check_claude_on_path_returns_dependency_status_without_panicking"
        status: pass
    human_judgment: false
  - id: D2
    description: "has_gsd_core additive field on ValidatedProject, true when gsd-core is installed project-locally, in the user's home, or resolves via `which gsd-tools`"
    requirement: "PROJ-04"
    verification:
      - kind: unit
        ref: "src-tauri/src/project.rs#project::tests::dir_has_gsd_core_true_when_subpath_exists"
        status: pass
      - kind: unit
        ref: "src-tauri/src/project.rs#project::tests::dir_has_gsd_core_false_when_missing"
        status: pass
    human_judgment: false
  - id: D3
    description: "check.ts wraps check_claude_on_path and derives a 3-variant tool-missing state (claude-missing / gsd-core-missing / both-missing / none) for the UI, with zero auto-install logic"
    verification:
      - kind: unit
        ref: "src/dependencies/check.test.ts#deriveToolMissingState (função pura, sem mock)"
        status: pass
    human_judgment: false
  - id: D4
    description: "encode_project_path reproduces the verified Claude Code encoding rule (/home/user/gsd-cards -> -home-user-gsd-cards, each path separator becomes a dash)"
    requirement: "SESS-01"
    verification:
      - kind: unit
        ref: "src-tauri/src/sessions.rs#sessions::tests::encode_project_path_matches_verified_claude_code_rule"
        status: pass
    human_judgment: false
  - id: D5
    description: "register_sessions_scope grants plugin-fs read scope ONLY to ~/.claude/projects/<encoded-current-project>/, never the parent directory, mitigating T-02-01 (session leakage across projects)"
    requirement: "SESS-01"
    verification:
      - kind: unit
        ref: "src-tauri/Cargo.toml build + cargo test sessions:: (encode_project_path suite, register_sessions_scope compiles and is registered in generate_handler!)"
        status: pass
    human_judgment: false
  - id: D6
    description: "listSessions lists only *.jsonl at the root level of the encoded folder, filters out subagents/ and non-.jsonl files, extracts only id + mtime, and degrades to [] when the folder doesn't exist"
    requirement: "SESS-01"
    verification:
      - kind: unit
        ref: "src/sessions/discover.test.ts#listSessions > lista só *.jsonl do nível raiz, filtrando subagents/ e arquivos não-.jsonl"
        status: pass
      - kind: unit
        ref: "src/sessions/discover.test.ts#listSessions > degrada a [] quando a pasta codificada não existe (projeto novo sem sessões)"
        status: pass
      - kind: unit
        ref: "src/sessions/discover.test.ts#listSessions > pula uma entrada cujo stat falha, sem abortar a listagem inteira (D-15)"
        status: pass
    human_judgment: false
  - id: D7
    description: "jsonl-signals.ts provides pure id-extraction and mtime-sort helpers that never read .jsonl file content"
    verification:
      - kind: unit
        ref: "src/sessions/jsonl-signals.test.ts (extractSessionId, sortByLastModifiedDesc suites)"
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-07-23
status: complete
---

# Phase 02 Plan 03: Detecção de dependências + escopo estreito de sessões Summary

**check_claude_on_path (which::which) + has_gsd_core aditivo em ValidatedProject, e register_sessions_scope concedendo leitura só a `~/.claude/projects/<encoded-do-projeto>/`, com listSessions filtrando subagents/ e não-.jsonl**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-23T17:11:04Z (commit anterior, 02-02 finalizado)
- **Completed:** 2026-07-23T17:19:21Z
- **Tasks:** 2
- **Files modified:** 11 (8 novos, 3 modificados)

## Accomplishments

- `check_claude_on_path` detecta `claude` no PATH via `which::which`, testável nos dois branches (presente/ausente) sem depender do binário real estar instalado na máquina de CI (extraído como `resolve_on_path` parametrizado)
- `has_gsd_core: bool` aditivo em `ValidatedProject`, calculado como projeto-local OR home-do-usuário OR `which gsd-tools` — nenhuma das três é obrigatória
- `register_sessions_scope` concede escopo de leitura do `plugin-fs` SÓ para `~/.claude/projects/<encoded-do-projeto-atual>/`, nunca para o diretório pai — mitigando vazamento de sessões de outros projetos (T-02-01)
- `encode_project_path` reproduz a regra verificada `/home/user/gsd-cards` → `-home-user-gsd-cards`
- `listSessions` lista só `*.jsonl` do nível raiz, filtra `subagents/` e arquivos não-`.jsonl`, extrai só `id`+`lastModified`, e degrada a `[]` sem lançar quando a pasta não existe (projeto novo)

## Task Commits

Each task was committed atomically:

1. **Task 1: Detecção de Claude CLI + gsd-core (PROJ-04)** - `90bcc34` (feat)
2. **Task 2: Escopo estreito + descoberta de sessões (SESS-01)** - `4442d25` (feat)

_Note: no TDD tasks in this plan — both were `type="auto"`._

## Files Created/Modified

- `src-tauri/src/dependencies.rs` - `DependencyStatus`, `check_claude_on_path` command, `resolve_on_path` testable helper
- `src-tauri/src/sessions.rs` - `encode_project_path`, `SessionsError`, `register_sessions_scope` command
- `src-tauri/src/project.rs` - additive `has_gsd_core: bool` on `ValidatedProject`, `dir_has_gsd_core`/`has_gsd_core_installed` helpers
- `src-tauri/src/lib.rs` - registers `dependencies::check_claude_on_path` and `sessions::register_sessions_scope` in `generate_handler!`
- `src/dependencies/check.ts` - `checkClaudeOnPath` wrapper + `deriveToolMissingState` (3-variant state for Plan 04's UI)
- `src/dependencies/check.test.ts` - covers both invoke-mocked paths and the pure `deriveToolMissingState` classifier
- `src/sessions/discover.ts` - `listSessions(encodedDir)` — shallow scan, per-entry defensive stat, `[]` degradation
- `src/sessions/discover.test.ts` - subagents/ + non-.jsonl filtering, missing-dir degradation, per-entry stat failure
- `src/sessions/jsonl-signals.ts` - `extractSessionId`, `sortByLastModifiedDesc` (pure, no file content read)
- `src/sessions/jsonl-signals.test.ts` - id extraction + mtime sort, including null-mtime ordering and non-mutation
- `src/planning/read.ts` - additive `hasGsdCore` field mirroring the Rust struct (typed access for `check.ts`)

## Decisions Made

- `has_gsd_core` modeled as directory-existence OR PATH-resolution inference (no official gsd-core "doctor" command exists) — documented inline in `project.rs`, matching 02-RESEARCH.md Pattern 5 and Assumption A3
- Added `hasGsdCore` to the TS `ValidatedProject` interface in `read.ts` even though it wasn't in the plan's `files_modified` list — additive mirroring of the Rust struct's camelCase-serialized field was necessary for `check.ts`'s `deriveToolMissingState` to have typed access; no behavior change to any existing caller
- `register_sessions_scope` does not require the encoded sessions subfolder to exist — `allow_directory` is a pure ACL-pattern registration (no I/O), confirmed by reading `tauri-2.11.5/src/scope/fs.rs` directly; the `[]` degradation for "no sessions yet" lives entirely in `discover.ts`, not in the Rust command

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `hasGsdCore` to the TS `ValidatedProject` interface in `read.ts`**
- **Found during:** Task 1 (writing `check.ts`)
- **Issue:** `project.rs` gained `has_gsd_core: bool` (serialized as `hasGsdCore` via `#[serde(rename_all = "camelCase")]`), but the TS-side `ValidatedProject` interface in `read.ts` (not listed in this plan's `files_modified`) would silently drop the field from the type system, leaving `check.ts`'s intended "combine `claudePath` + `hasGsdCore`" helper without typed access to a field the backend already returns
- **Fix:** Added `hasGsdCore: boolean` to the `ValidatedProject` interface in `read.ts`, mirroring the Rust struct exactly — purely additive, no existing caller's behavior changes
- **Files modified:** `src/planning/read.ts`
- **Verification:** `npm run typecheck` passes; existing `read.test.ts` suite (5 tests covering `validateProjectRoot`) still passes unchanged
- **Committed in:** `90bcc34` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary for `check.ts`'s combined tool-missing state to type-check against real backend data; no scope creep — the field itself was already planned for `project.rs`, this only extends its TS mirror.

## Issues Encountered

None — both tasks compiled/passed verification on the first implementation pass, no debugging required.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `check_claude_on_path` + `has_gsd_core` are ready for Plan 04's dependency-missing UI screen (three-variant `ToolMissingState` already exported from `check.ts`)
- `register_sessions_scope` + `listSessions` are ready for Plan 04/05's sidebar session list — the encoded-dir string returned by `register_sessions_scope` is exactly what `listSessions(encodedDir)` expects as input
- No blockers identified for subsequent plans in this phase

---
*Phase: 02-sess-o-viva*
*Completed: 2026-07-23*

## Self-Check: PASSED

All 12 created/modified files confirmed present on disk (`src-tauri/src/dependencies.rs`, `src-tauri/src/sessions.rs`, `src/dependencies/check.ts`, `src/dependencies/check.test.ts`, `src/sessions/discover.ts`, `src/sessions/discover.test.ts`, `src/sessions/jsonl-signals.ts`, `src/sessions/jsonl-signals.test.ts`, `src-tauri/src/project.rs`, `src-tauri/src/lib.rs`, `src/planning/read.ts`, this SUMMARY.md). Both task commits (`90bcc34`, `4442d25`) confirmed present in `git log --oneline --all`.
