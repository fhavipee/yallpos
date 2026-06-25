import { useEffect, useRef, useState } from "react";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onSubmit: (pin: string) => void | Promise<void>;
  error?: string | null;
  busy?: boolean;
};

export default function PinPromptModal({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  onCancel,
  onSubmit,
  error,
  busy,
}: Props) {
  const [pin, setPin] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setPin("");
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length < 4 || busy) return;
    await onSubmit(pin);
  }

  return (
    <div className="yall-pin-modal" onClick={onCancel} role="presentation">
      <form
        className="yall-pin-modal__panel"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h3 className="yall-pin-modal__title">{title}</h3>
        {description && <p className="yall-pin-modal__desc">{description}</p>}
        <input
          ref={inputRef}
          className="yall-pin-modal__input"
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="••••"
          aria-label="PIN"
        />
        {error && <p className="yall-pin-modal__error">{error}</p>}
        <div className="yall-pin-modal__actions">
          <button type="button" className="yall-pin-modal__btn yall-pin-modal__btn--ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            type="submit"
            className="yall-pin-modal__btn yall-pin-modal__btn--primary"
            disabled={busy || pin.length < 4}
          >
            {busy ? "Verificando…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
