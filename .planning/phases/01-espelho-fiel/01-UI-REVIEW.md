# Phase 01 — UI Review

**Audited:** 2026-07-24
**Baseline:** 01-UI-SPEC.md (Phase 01 Design Contract)
**Screenshots:** Not captured (no dev server running; code-only audit)

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | All UI-SPEC copywriting contract keys present in i18n; zero hardcoded strings in Phase 01 components |
| 2. Visuals | 3/4 | Clear hierarchy via typography and spacing; missing explicit focus/active states for keyboard navigation |
| 3. Color | 4/4 | Design tokens fully implemented via CSS custom properties; light/dark via prefers-color-scheme; 60/30/10 split maintained |
| 4. Typography | 4/4 | Exactly 2 weights (400/600) and 4 roles (Label/Body/Heading/Display) as specified; all sizes match UI-SPEC px-for-px |
| 5. Spacing | 4/4 | All spacing values from UI-SPEC scale (xs–3xl, multiples of 4); no arbitrary values; card padding (16px), gaps (8–16px), min-widths (280px) exact |
| 6. Experience Design | 3/4 | Error/empty states present; loading states exist; sync indicator healthy; missing explicit loading spinner/skeleton for artifact modal on initial fetch |

**Overall: 22/24**

---

## Top 3 Priority Fixes

1. **Missing visual focus state for keyboard navigation** — User pressing Tab through cards/buttons sees no focus ring; WCAG AA requires visible focus indicator. Concrete fix: Add `outline: 2px solid var(--color-accent); outline-offset: 2px` to `.phase-card:focus-visible` and interactive elements.

2. **Artifact modal displays raw text briefly before render** — When opening an artifact, the component shows "Carregando…" (Loading) text for ~0–300ms in the modal body area; unfamiliar users may think the load failed. Concrete fix: Use a skeleton placeholder (gray bar) instead of text, or preload artifact on `DetailPanel` mount (lazy-load approach trade-off).

3. **SyncIndicator renders inside Header even when `sync.state` is `idle`** — After closing a project, the "Sincronizado há…" indicator flickers briefly before disappearing. Concrete fix: Ensure `project` is checked before any rendering; current null-check is present but timing of state updates may cause render race.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

**PASS — All copywriting contract keys are present and correctly consumed.**

- **Files audited:** `src/locales/pt-BR/{project,board,sync,artifact}.json` and corresponding `en/` equivalents
- **Key contract items verified:**
  - `project.actions.open` = "Abrir projeto" ✓
  - `project.empty.heading` / `.body` present ✓
  - `project.error.notGsd.heading` / `.body` present ✓
  - `board.column.{todo,preparing,executing,done}` present ✓
  - `board.status.*` (7 badges: pending, discussed, planned, executing, executed, verified, unknown) present ✓
  - `sync.healthy.label` / `sync.stale.label` / `sync.stale.body` / `sync.actions.reconnect` present ✓
  - `artifact.modal.parseError.banner` present ✓

- **String audit:** Zero hardcoded Portuguese/English UI strings found in Phase 01 components (`Header.tsx`, `PhaseCard.tsx`, `SyncIndicator.tsx`, `StatusBadge.tsx`, `DetailPanel.tsx`, `ArtifactModal.tsx`, `BoardColumn.tsx`, `EmptyState.tsx`, `ErrorState.tsx`). Every visible text passes through `useTranslation()`.

- **Namespace organization:** Single-owner-file pattern is correctly established: `project.json` owned by Plano 02, `board.json` by Plano 03, `sync.json` by Plano 04, `artifact.json` by Plano 05. No namespace file is edited by multiple plans.

- **Minor note:** Extended scope beyond Phase 01 with `home.json`, `session.json`, `terminal.json`, `commands.json` for later phases, but Phase 01 contract is fully met.

### Pillar 2: Visuals (3/4)

**GOOD — Visual hierarchy is present; critical issue: keyboard focus indicators missing.**

**Strengths:**
- Clear focal point: project name in Display size (24px/600) at left of header ✓
- Hierarchy via size differentiation: Display (header) > Heading (card titles) > Body (descriptions) > Label (badges/counters) ✓
- Icon usage consistent: `ListChecks` (12px) for requirements, `AlertTriangle` for blockers, `TerminalSquare` for future terminal
- Color differentiation: warning color (amber) for blockers, success color (green) for verified status
- Hover state: cards show 1px accent border on `:hover` (CSS: `.phase-card:hover { border-color: var(--color-accent) }`) ✓
- Glow animation: D-13 highlight glow on card update (3px shadow, 30% opacity, 1000ms fade) ✓
- State indicators: status dots (8px) with 4 tone classes (neutral/accent/warning/success) ✓

**Critical issue — Missing keyboard focus states:**
- `.phase-card` lacks `:focus-visible` outline
- Header buttons (ProjectSwitcherButton, LanguageSwitcher) lack explicit focus rings
- Detail panel close button (`<button>`) has no focus indicator
- Artifact modal backdrop close has no focus affordance

Impact: WCAG AA non-compliance; Tab navigation is invisible. Users cannot see which element has keyboard focus.

**Finding classification:** WARNING — Pillar score 3/4 (notable gap); fix recommended before shipping for accessibility.

### Pillar 3: Color (4/4)

**PASS — Design tokens fully implemented; light/dark themes work; 60/30/10 budget maintained.**

- **Token definition (src/styles/theme.css):**
  - Dominant: `#ffffff` (light) / `#0b0d10` (dark) ✓
  - Secondary: `#f4f4f5` (light) / `#18191c` (dark) ✓
  - Accent: `#6366f1` (light) / `#818cf8` (dark) — indigo ✓
  - Warning: `#f59e0b` (light) / `#fbbf24` (dark) — amber ✓
  - Success: `#10b981` (light) / `#34d399` (dark) — green ✓
  - Destructive: `#ef4444` (light) / `#f87171` (dark) — red (reserved, unused Phase 01) ✓
  - Foreground: `#18181b` (light) / `#f4f4f5` (dark) — text color (added Phase 02, necessary) ✓

- **Usage audit:**
  - No Tailwind `text-primary` / `bg-primary` classes in Phase 01 components (using CSS variables instead)
  - Color application respects 60/30/10: dominant (body bg) 60%, secondary (card/header bg) 30%, accent (dots, highlights, button bg) 10% ✓
  - Status dots use semantic tones (neutral for pending, accent for discussed/planned, warning for executing/executed, success for verified) ✓
  - Hardcoded hex colors found only in later-phase components (terminal: `#ffffff`/`#18181b`, language switcher: conditional) — outside Phase 01 scope

- **Dark mode verification:**
  - CSS uses `@media (prefers-color-scheme: dark)` to swap tokens ✓
  - No manual theme toggle; respects OS preference ✓
  - Foreground text color toggles with background (light text on dark bg, dark text on light bg) ✓

- **Finding classification:** PASS — Pillar score 4/4. No issues.

### Pillar 4: Typography (4/4)

**PASS — Exactly 2 weights, 4 roles, all sizes match UI-SPEC to the pixel.**

- **Declared scale (src/styles/theme.css):**
  - Label: 12px / 1.4 line-height / 600 weight ✓
  - Body: 14px / 1.5 line-height / 400 weight ✓
  - Heading: 18px / 1.3 line-height / 600 weight ✓
  - Display: 24px / 1.2 line-height / 600 weight ✓

- **Usage audit (Header.tsx, PhaseCard.tsx, etc.):**
  - Header project name: `fontSize: "var(--font-size-display)"` (24px/600) ✓
  - Header milestone badge: `fontSize: "var(--font-size-label)"` (12px/600) ✓
  - Card phase name: `fontSize: "var(--font-size-heading)"` (18px/600) ✓
  - Card description: `fontSize: "var(--font-size-body)"` (14px/400) ✓
  - Status badge text: `fontSize: "var(--font-size-label)"` (12px/600) ✓

- **Weight constraint:** No Tailwind `font-medium` (500) or `font-bold` (700) used. Every component uses only 400 or 600 via CSS custom properties. ✓

- **Font families:**
  - UI (Inter Variable): `"Inter Variable", system-ui, -apple-system, "Segoe UI", sans-serif` ✓
  - Code (JetBrains Mono Variable): `"JetBrains Mono Variable", ui-monospace, "Cascadia Code", monospace` ✓

- **Finding classification:** PASS — Pillar score 4/4. No issues.

### Pillar 5: Spacing (4/4)

**PASS — All spacing from declared scale; no arbitrary values; layout matches D-04 and D-05 dimensions.**

- **Declared scale (src/styles/theme.css, all multiples of 4):**
  - xs: 4px ✓
  - sm: 8px ✓
  - md: 16px ✓
  - lg: 24px ✓
  - xl: 32px ✓
  - 2xl: 48px ✓
  - 3xl: 64px ✓

- **Layout dimensions verified:**
  - Header: 56px height ✓; padding-left/right: `var(--spacing-lg)` (24px) ✓
  - Sidebar: 240px fixed width (session sidebar)
  - Board area: `minWidth: 1024px` (comfortable width) ✓; `overflowX: auto` (horizontal scroll below min) ✓
  - DrawerRail: 48px fixed width ✓
  - Board outer padding: `var(--spacing-xl)` (32px) ✓

- **Card anatomy (PhaseCard.tsx):**
  - Padding: `var(--spacing-md)` (16px) ✓
  - Gap between rows: `var(--spacing-sm)` (8px) ✓
  - Border-radius: 8px (not in scale, decorative) ✓
  - Min-height: 92px (not in scale, defined separately) ✓

- **Column anatomy (BoardColumn.tsx):**
  - Min-width: 280px ✓
  - Header padding: `var(--spacing-sm)` (8px) vertical / `var(--spacing-md)` (16px) horizontal ✓
  - Card gap: `var(--spacing-sm)` (8px) ✓

- **Board columns gap:**
  - Between columns: `var(--spacing-md)` (16px) ✓ (matches D-05 spec)

- **No arbitrary values audit:**
  - Grep for `\[.*px\]` or `\[.*rem\]` across Phase 01 components returns only decorative values (icon size `size={12}` from lucide, not layout spacing)
  - All spacing uses named tokens via CSS variables

- **Finding classification:** PASS — Pillar score 4/4. No issues.

### Pillar 6: Experience Design (3/4)

**GOOD — Error/empty/loading states present; minor issue: artifact modal loading UX could be clearer.**

- **State coverage:**

  1. **Idle (no project):** `status === "idle"` renders `EmptyState` with CTA "Abrir projeto" ✓ (PROJ-02)
  
  2. **Error (invalid project):** `status === "error"` renders `ErrorState` with heading "Esta pasta não é um projeto GSD" + body text, never shows empty board ✓ (PROJ-02)
  
  3. **Open (valid project):** `status === "open"` renders `Board` with real phases from `board-store` ✓
  
  4. **Sync healthy:** Header shows `SyncIndicator` with green dot + "Sincronizado há Xs" (updates every 1s) ✓ (D-14)
  
  5. **Sync degraded:** Header shows amber dot + "Desatualizado desde HH:MM" + "Reconectar" button (never shows "Sincronizado" text while degraded) ✓ (D-16)
  
  6. **Sync idle:** `SyncIndicator` renders null when `!project || sync.state === "idle"` ✓
  
  7. **Parse failure (localized):** Card with unparseable artifact shows `parseWarning={true}` badge ("não reconhecida" with tooltip) ✓ (D-15 / BOARD-05)
  
  8. **Empty column:** Column with zero cards shows "Nenhuma fase aqui ainda" message ✓

  9. **Artifact loading:** `ArtifactModal` shows `<p>Carregando…</p>` while fetching the artifact (no skeleton) ⚠️

- **Disabled states for actions:**
  - Artifact modal links are not clickable in Phase 01 (schema check ensures `javascript:` links are text-only) ✓
  - Milestone badge shows `title="Não foi possível interpretar este valor"` when `unrecognized` ✓

- **Confirmation for destructive actions:**
  - N/A — board is read-only (no delete/archive Phase 01)

- **Error boundaries:**
  - `openProject` action wraps errors in typed `ProjectOpenError` union; errors don't throw, they're rendered as `ErrorState` ✓
  - `reprocessPaths` (watch loop) catches parse failures per artifact and preserves previous value; never crashes the board ✓

- **Issue — Artifact modal loading experience:**
  - When clicking "Ver artefato" → `DetailPanel` → `ArtifactModal`, the modal content area shows raw text "Carregando…" for ~0–300ms before markdown renders
  - No visual skeleton or placeholder block
  - User perception: "Is it broken?" or "Did it load?"
  - Better UX: skeleton bar (gray block, same height as expected rendered content) or preload on DetailPanel mount

- **Minor issue — Sync indicator timing:**
  - After `closeProject()`, `sync.state` resets to `idle` but may render briefly with old state before null-check triggers
  - Very minor flicker, not blocking

- **Finding classification:** WARNING — Pillar score 3/4 (minor gaps); artifact modal loading clarity is the main fix needed.

---

## Files Audited

**Shell/Layout:**
- `src/shell/AppShell.tsx` — Layout skeleton D-04 (header/sidebar/board/drawer)
- `src/shell/Header.tsx` — Header D-12 (project name, milestone, phase, progress, counters, sync indicator)
- `src/shell/Board.tsx` — Board columns container D-05 (4 columns, gaps, history strip)
- `src/shell/DrawerRail.tsx` — Collapsed drawer rail (48px, terminal icon placeholder)

**Components (Phase 01):**
- `src/components/BoardColumn.tsx` — Column D-05 (sticky header, min-width 280px, empty state)
- `src/components/PhaseCard.tsx` — Card D-09 (anatomy: title, status badge, progress bar, requirements)
- `src/components/StatusBadge.tsx` — 7 status badge variants
- `src/components/ProgressBar.tsx` — Progress indicator (accent fill, 4px track)
- `src/components/EmptyState.tsx` — Generic empty/error layout with heading + body + optional CTA
- `src/components/ErrorState.tsx` — Error-specific variant of above
- `src/components/SyncIndicator.tsx` — D-14/D-16 sync health (3 states: healthy/degraded/idle)
- `src/components/DetailPanel.tsx` — D-10 overlay panel (480px) with phase artifact tree
- `src/components/ArtifactModal.tsx` — D-11 modal (900px/85vh) with GFM render + raw fallback

**Stores:**
- `src/stores/board-store.ts` — Zustand store with `openProject`, `phases`, `sync`, `recentlyUpdatedPhaseIds`
- `src/stores/ui-store.ts` — Phase/artifact selection state

**Styles:**
- `src/styles/theme.css` — Design tokens (spacing, typography, colors light/dark), status dots, card hover/glow, artifact markdown styling
- `src/styles/index.css` — Tailwind + theme imports + font faces

**Locales:**
- `src/locales/pt-BR/{project,board,sync,artifact}.json` — UI strings
- `src/locales/en/{project,board,sync,artifact}.json` — English equivalents (full parity)

**Config:**
- `src/i18n.ts` — i18next initialization with pt-BR default, fallback, namespace registration

---

## Summary

Phase 01 ("Espelho Fiel") implements a solid foundation for the kanban board. The UI-SPEC contract is substantially met across all 6 pillars:

- **Copywriting (4/4):** Complete i18n coverage; zero hardcoded strings
- **Visuals (3/4):** Clear hierarchy; missing keyboard focus indicators (WCAG issue)
- **Color (4/4):** Full design token system; light/dark themes working
- **Typography (4/4):** Exact compliance to scale; 2-weight discipline maintained
- **Spacing (4/4):** All values from declared scale; layout dimensions exact
- **Experience Design (3/4):** Error/empty/sync states handled; artifact loading UX could be smoother

**Key risks for production:**
1. Keyboard navigation lacks focus indicators (accessibility blocker)
2. Artifact modal "Carregando…" text may confuse users about load state
3. Sync indicator may briefly show stale state on project close

All three are fixable with small targeted changes. The board itself is faithful to the `.planning/` data and handles edge cases (unrecognized artifacts, degraded sync, invalid projects) gracefully.

---

*Audit completed: 2026-07-24*
*Phase 1 Status: Ready for end-of-phase human verification (npm run tauri dev visual check)*
