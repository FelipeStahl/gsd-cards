# RELEASE.md — Maintainer Handoff

> This document lists the Manual-Only steps required before GSD Cards can ship a real,
> signed, auto-updating release. None of these steps are performed or claimed done by an
> autonomous GSD execution session — the ed25519 signing keypair is the maintainer's
> release identity and must never be generated, held, or hinted at as real inside an
> agentic session (05-RESEARCH.md "Chave de assinatura", T-05-07).
>
> Everything headless-authorable (bundle config, `plugins.updater` config shape,
> `release.yml` CI workflow) is already done — see `src-tauri/tauri.conf.json` and
> `.github/workflows/release.yml`. What follows is what only a human, on their own
> machine, with access to the GitHub repo's secret store, can complete.

## 1. Generate the real ed25519 signing keypair

Run on the maintainer's own machine (never in CI, never in an agentic session):

```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/gsd-cards.key
```

This produces:
- A **private key** (and, if you set a password, an encrypted private key) — keep this
  file OFF the repo, never commit it, never paste it into any file tracked by git.
- A **public key** (base64 string) printed to stdout / saved alongside the private key.

## 2. Replace the placeholder pubkey in tauri.conf.json

Open `src-tauri/tauri.conf.json` and replace the current placeholder value at
`plugins.updater.pubkey`:

```json
"plugins": {
  "updater": {
    "pubkey": "UEFOU0lHTl9QTEFDRUhPTERFUl9OT1RfQV9SRUFMX0tFWV9SRVBMQUNFX1ZJQV9UQVVSSV9TSUdORVJfR0VORVJBVEU="
  }
}
```

with the real public key printed by `tauri signer generate` in step 1. This is the only
part of the signing material that is safe to commit — the public key has no value to an
attacker on its own (it can only *verify* signatures, never produce them).

## 3. Register CI signing secrets

In the GitHub repo: **Settings → Secrets and variables → Actions → New repository
secret**, add:

| Secret name | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | The private key content (or path contents) generated in step 1 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password you chose when generating the key (empty string if you generated without a password) |

`.github/workflows/release.yml` reads both exclusively through the GitHub Actions
`secrets` context inside the `tauri-apps/tauri-action@v1` step's `env:` block — never via
a `run:` step, never echoed, never logged. Do not change that pattern when maintaining
the workflow.

## 4. Version bump procedure

There is no automation for version bumps in this phase. A release version bump touches
all three of the following files together, keeping them in sync:

- `package.json` → `"version"`
- `src-tauri/Cargo.toml` → `[package] version`
- `src-tauri/tauri.conf.json` → `"version"`

After bumping, `git tag vX.Y.Z && git push origin vX.Y.Z` triggers `release.yml` (tag
pattern `v*`), which builds, signs, and publishes a draft GitHub Release with installers
for Windows, macOS (aarch64 + x86_64), and Linux, plus the `latest.json` update manifest.

## 5. OS code-signing (best-effort, optional)

Apple notarization and a Windows EV code-signing certificate are **not** part of the v1
scope — this is a community open-source project with one part-time maintainer, and EV
certificates cost money the project doesn't have. Unsigned installers are the accepted
tradeoff:

- **Windows:** users see a SmartScreen "unknown publisher" warning and must click
  "More info → Run anyway." This is the same tradeoff already documented for other
  unsigned distribution paths in this project (see `.planning/WINDOWS.md` precedent).
- **macOS:** unsigned/un-notarized apps trigger Gatekeeper's "cannot be opened because
  the developer cannot be verified" dialog; users must right-click → Open, or clear the
  quarantine attribute (`xattr -d com.apple.quarantine`).

If a future maintainer wants to add proper code signing, that is a separate scope
addition (a paid Apple Developer account + Windows EV cert), not something this phase
blocks on.

## 6. What is verified where

| Claim | Verified by |
|---|---|
| `tauri.conf.json` is valid JSON and passes `cargo check` with the placeholder pubkey | This session (headless, automated) |
| `release.yml` is valid YAML, references secrets only via `env:`/`secrets.*`, never echoes them | This session (headless, automated) |
| Real Windows/macOS/Linux installers actually build and run | The `release.yml` CI matrix, on a real tag push (never exercised headless — 05-RESEARCH.md Pitfall 4) |
| A real signed update round-trip (check → download → verify → install → relaunch) | The maintainer's own machine or a real CI release, only after steps 1-3 above are complete — never claimed done by this session |

Do not treat a green headless config-validation run as evidence that packaging or
auto-update actually work end-to-end. Those are Manual-Only claims, gated on the steps
above.
