// Shell de decodificação/timer em torno do classificador puro
// (`src/pty/activity.ts`, ACT-03). Um `TextDecoder({stream:true})`
// persistente + um buffer rolante + um timer de quiescência POR SESSÃO
// (nunca compartilhado — Pitfall 4 de `03-RESEARCH.md`): sessões em
// background continuam sendo classificadas porque o registro acontece no
// mapa sempre-ativo `activityHandlers` de `channel.ts` (ACT-03, Pattern 2),
// não no mapa `bytesHandlers` roteado por foco que `focus-algorithm.ts`
// controla.
//
// Mesma disciplina de registro/limpeza simétrica de `focus-algorithm.ts`
// (`gainFocus`/`loseFocus`): `wireTerminalActivity` retorna uma função de
// cleanup que limpa o timer e desregistra o handler.

import { appendToRollingBuffer, classifyActivity, QUIESCENCE_MS, type TerminalActivity } from "../../pty/activity";
import { clearActivityHandler, setActivityHandler } from "../../pty/channel";

/**
 * Registra o consumidor sempre-ativo de bytes desta sessão e chama
 * `onChange` só em transições reais de estado (nunca por byte). Primeiro
 * byte após silêncio flipa IMEDIATAMENTE para `busy` (D-ACT03: "flip
 * imediato para ocupado ao primeiro byte de atividade"); sem novos bytes,
 * `idle` só chega após `QUIESCENCE_MS` de silêncio contínuo.
 *
 * Retorna a função de cleanup — limpa o timer pendente e chama
 * `clearActivityHandler(sessionId)`.
 */
export function wireTerminalActivity(
  sessionId: string,
  onChange: (activity: TerminalActivity) => void,
): () => void {
  // UM decoder persistente por sessão (Pitfall 2) — `{ stream: true }`
  // carrega bytes UTF-8 incompletos entre chamadas em vez de descartá-los.
  const decoder = new TextDecoder();
  let buffer = "";
  let current: TerminalActivity = "idle";
  let quiescenceTimer: ReturnType<typeof setTimeout> | null = null;

  function transition(next: TerminalActivity) {
    if (next === current) return; // gate — só re-invoca onChange em transição real
    current = next;
    onChange(next);
  }

  setActivityHandler(sessionId, (bytes) => {
    const text = decoder.decode(bytes, { stream: true });
    buffer = appendToRollingBuffer(buffer, text);

    const classified = classifyActivity(buffer);
    if (classified) {
      transition(classified);
      // CR-02: um marcador que já casou terminou seu trabalho — descarta
      // imediatamente o buffer para que ele nunca seja re-casado contra
      // chunks futuros. Sem isso, um marcador `awaiting` já RESPONDIDO
      // permanece dentro da janela rolante por até ROLLING_BUFFER_CAP
      // caracteres seguintes: como `classifyActivity` dá precedência a
      // `awaiting` sobre `busy`, toda classificação nessa janela continua
      // retornando `awaiting` mesmo com output genuinamente busy chegando
      // depois — e como o estado (`current`) já era `awaiting`, `transition`
      // nem dispara de novo (gate de "sem mudança"), então o buffer nunca
      // seria limpo por um mecanismo baseado só em detectar a transição de
      // saída. `resolveInjection` trata `awaiting` como `prefill`
      // (escreve no PTY), violando o invariante T-03-03 ("busy ⇒ blocked,
      // zero injeção") pela duração inteira dessa janela. Limpar aqui, logo
      // após qualquer match confirmado, garante que o texto do marcador
      // nunca sobrevive além do byte que o completou.
      buffer = "";
    } else {
      // Qualquer byte novo que não caia num dos marcadores ainda significa
      // "atividade acabou de acontecer" — flip imediato para busy, deixando
      // a quiescência decidir idle depois.
      transition("busy");
    }

    if (quiescenceTimer) clearTimeout(quiescenceTimer);
    quiescenceTimer = setTimeout(() => transition("idle"), QUIESCENCE_MS);
  });

  return () => {
    if (quiescenceTimer) clearTimeout(quiescenceTimer);
    clearActivityHandler(sessionId);
  };
}
