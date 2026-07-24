// Affordance de inline-edit para renomear uma sessão (SESS-05,
// 04-05-PLAN.md) — sub-componente de `SessionRow`, nunca standalone (a
// própria row decide QUANDO mostrar isto no lugar do label estático). Sem
// `ConfirmDialog`: renomear é reversível/de baixo risco, mesma disciplina de
// "sem confirmação" do Archive (`04-UI-SPEC.md` ## Rename Session).
//
// Enter/clique em Check confirma (`onConfirm`); Esc/clique em X cancela
// (`onCancel`) sem tocar o nome atual. O valor digitado é texto do usuário —
// SEMPRE renderizado como filho de texto React vinculado (nunca via
// innerHTML bruto, nunca interpolado em nenhum comando).

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface RenameSessionControlProps {
  /** Valor inicial do input — nome atual da sessão, ou "" se ainda sem nome customizado. */
  initialValue: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function RenameSessionControl({ initialValue, onConfirm, onCancel }: RenameSessionControlProps) {
  const { t } = useTranslation("session");
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus + seleção do texto ao montar (04-UI-SPEC.md ## Rename Session
  // passo 1) — o usuário pode digitar imediatamente por cima do nome atual.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      onConfirm(value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  }

  // Nunca deixa o clique dentro do controle borbulhar para o `onClick` da
  // row (que ativaria/focaria a sessão em vez de editar o nome).
  function stopRowActivate(event: MouseEvent) {
    event.stopPropagation();
  }

  return (
    <span
      onClick={stopRowActivate}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--spacing-xs)",
        flex: 1,
        minWidth: 0,
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={t("rename.placeholder")}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        style={{
          height: 28,
          flex: 1,
          minWidth: 0,
          fontFamily: "var(--font-family-mono)",
          fontSize: "var(--font-size-body)",
          lineHeight: "var(--line-height-body)",
          color: "var(--color-foreground)",
          backgroundColor: "var(--color-dominant)",
          border: "1px solid var(--color-accent)",
          borderRadius: 4,
          padding: "0 var(--spacing-xs)",
        }}
      />
      <button
        type="button"
        onClick={() => onConfirm(value)}
        aria-label={t("rename.confirm")}
        title={t("rename.confirm")}
        style={{
          width: 20,
          height: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-accent)",
          flexShrink: 0,
        }}
      >
        <Check size={16} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        aria-label={t("rename.cancel")}
        title={t("rename.cancel")}
        style={{
          width: 20,
          height: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-foreground)",
          opacity: 0.7,
          flexShrink: 0,
        }}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </span>
  );
}
