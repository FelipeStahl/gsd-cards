// Guarda de regressão contra a evolução de formato do gsd-core (mitigação do
// bloqueio registrado em `STATE.md`: "fragilidade do parser vs. evolução do
// gsd-core — mitigar com fixtures versionadas").
//
// Este teste NUNCA executa o CLI oráculo — nenhum processo externo é
// disparado a partir daqui, nenhuma leitura de argumentos de linha de
// comando. Ele só lê o snapshot versionado, já normalizado, exposto por
// `./__fixtures__/oracle/snapshot.ts` — gerado manualmente por
// `npm run fixtures:refresh` (ver `scripts/refresh-fixtures.mjs`). Isso
// mantém o CI simples e determinístico, sem exigir Node + a instalação local
// do gsd-core no runner (recomendação da Open Question #2 de `01-RESEARCH.md`).
//
// Quando o gsd-core mudar de formato, um desenvolvedor roda
// `npm run fixtures:refresh` de novo; se o `disk_status` que o oráculo
// produz para alguma fase divergir do que `deriveDiskStatus` (nosso parser
// TS) produz a partir dos mesmos sinais, o diff do snapshot aparece em code
// review — a quebra é detectada ali, nunca como um bug report de usuário
// meses depois.

import { describe, expect, it } from "vitest";

import { deriveDiskStatus, type PhaseDirSignals, type VerificationStatus } from "./status";
import snapshot from "./__fixtures__/oracle/snapshot";

describe("oracle-drift — snapshot versionado do oráculo canônico", () => {
  it("o snapshot tem pelo menos uma fase (guarda contra um fixture vazio silenciosamente sem valor)", () => {
    expect(snapshot.phases.length).toBeGreaterThan(0);
  });

  for (const phase of snapshot.phases) {
    it(`fase ${phase.number}: disk_status "${phase.disk_status}" do oráculo bate com deriveDiskStatus`, () => {
      // `disk_status !== "no_directory"` é a mesma regra que a própria
      // `deriveDiskStatus` usa internamente (só devolve "no_directory" quando
      // `!dirExists`) — reconstrói o sinal `dirExists` sem precisar gravá-lo
      // redundantemente no snapshot normalizado.
      const dirExists = phase.disk_status !== "no_directory";

      const signals: PhaseDirSignals = {
        planCount: phase.plan_count,
        summaryCount: phase.summary_count,
        hasResearch: phase.has_research,
        hasContext: phase.has_context,
        // `isActive` é volátil (mtime) por design — normalizado fora do
        // snapshot (ver `refresh-fixtures.mjs`) e, de qualquer forma, nunca
        // influencia `deriveDiskStatus` (só afeta `toBoardBadge`).
        isActive: false,
        verificationStatus: phase.verification_status as VerificationStatus,
      };

      expect(deriveDiskStatus(dirExists, signals)).toBe(phase.disk_status);
    });
  }
});
