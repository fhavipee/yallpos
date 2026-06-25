import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function PwaInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem("yallpos_pwa_dismissed") === "1",
  );
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    setIsStandalone(
      window.matchMedia("(display-mode: standalone)").matches
      || (window.navigator as Navigator & { standalone?: boolean }).standalone === true,
    );

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (isStandalone || dismissed || !deferred) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    if (choice.outcome === "dismissed") {
      localStorage.setItem("yallpos_pwa_dismissed", "1");
      setDismissed(true);
    }
  }

  return (
    <div className="yall-pwa-banner">
      <div>
        <strong>Instalar YallPos</strong>
        <div style={{ fontSize: 12, color: "var(--t-muted)", marginTop: 2 }}>
          Acceso rápido desde la pantalla de inicio
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="yall-pwa-banner__btn" onClick={install}>
          Instalar
        </button>
        <button
          type="button"
          className="yall-pwa-banner__dismiss"
          onClick={() => {
            localStorage.setItem("yallpos_pwa_dismissed", "1");
            setDismissed(true);
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
