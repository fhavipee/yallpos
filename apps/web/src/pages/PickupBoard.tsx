import { useEffect, useMemo, useRef, useState } from "react";
import { api, setBranchId } from "../lib/api";
import { formatPickupDisplay, formatPickupLabel, formatPickupSpeech, isAutoOrderCode, isPhysicalLocator } from "../lib/pickupCode";

type PickupOrder = {
  ticketId: string;
  invoiceId: string;
  pickupCode?: string;
  pickupName?: string;
  pickupPhone?: string;
  kitchenStatus: "new" | "preparing" | "ready";
  itemsSummary: string;
};

type DeliveredEntry = {
  invoiceId: string;
  pickupCode?: string;
  pickupName?: string;
};

export default function PickupBoard({ branchId, kiosk = false }: { branchId: string; kiosk?: boolean }) {
  const params = new URLSearchParams(window.location.search);
  const readyLimit = kiosk ? clampParam(params.get("ready"), 1, 12, 8) : 12;
  const preparingLimit = kiosk ? clampParam(params.get("preparing"), 1, 12, 8) : 12;
  const deliveredLimit = kiosk ? clampParam(params.get("delivered"), 1, 12, 6) : 6;
  const announceMs = kiosk ? clampParam(params.get("announceMs"), 1000, 15000, 4000) : 4000;
  const announceNameDefault = params.get("announceName") !== "0";
  const [announceName, setAnnounceName] = useState(() => {
    const stored = localStorage.getItem("pickupAnnounceName");
    if (stored === "0") return false;
    if (stored === "1") return true;
    return announceNameDefault;
  });
  const [orders, setOrders] = useState<PickupOrder[]>([]);
  const [now, setNow] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [announceActive, setAnnounceActive] = useState(false);
  const [recentDelivered, setRecentDelivered] = useState<DeliveredEntry[]>([]);
  const seenReadyRef = useRef<Set<string>>(new Set());
  const readySnapshotRef = useRef<Map<string, DeliveredEntry>>(new Map());
  const hydratedReadyRef = useRef(false);

  useEffect(() => {
    localStorage.setItem("pickupAnnounceName", announceName ? "1" : "0");
  }, [announceName]);

  async function load() {
    try {
      const res = await api.get("/v1/pos/pickup-queue");
      const nextOrders = res.data as PickupOrder[];
      const readyIds = nextOrders.filter((o) => o.kitchenStatus === "ready").map((o) => o.invoiceId);
      const nextReadyMap = new Map(
        nextOrders
          .filter((o) => o.kitchenStatus === "ready")
          .map((o) => [
            o.invoiceId,
            { invoiceId: o.invoiceId, pickupCode: o.pickupCode, pickupName: o.pickupName } satisfies DeliveredEntry,
          ]),
      );

      if (!hydratedReadyRef.current) {
        seenReadyRef.current = new Set(readyIds);
        readySnapshotRef.current = nextReadyMap;
        hydratedReadyRef.current = true;
      } else {
        const newReadyOrders = nextOrders.filter(
          (order) => order.kitchenStatus === "ready" && !seenReadyRef.current.has(order.invoiceId),
        );
        const hasNewReady = newReadyOrders.length > 0;
        if (hasNewReady) {
          setAnnounceActive(true);
          playReadyTone();
          announceReadyOrders(newReadyOrders, announceName);
          window.setTimeout(() => setAnnounceActive(false), announceMs);
        }

        const deliveredEntries: DeliveredEntry[] = [];
        for (const [invoiceId, snapshot] of readySnapshotRef.current.entries()) {
          if (!nextReadyMap.has(invoiceId)) {
            deliveredEntries.push(snapshot);
          }
        }
        if (deliveredEntries.length > 0) {
          setRecentDelivered((prev) => [...deliveredEntries, ...prev].slice(0, deliveredLimit));
        }

        seenReadyRef.current = new Set(readyIds);
        readySnapshotRef.current = nextReadyMap;
      }

      setOrders(nextOrders);
    } catch {
      setOrders([]);
    }
  }

  useEffect(() => {
    setBranchId(branchId);
    load();
  }, [branchId]);

  useEffect(() => {
    const poll = window.setInterval(load, 5000);
    const clock = window.setInterval(() => setNow(new Date()), 30000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [branchId]);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      return;
    }
    await document.exitFullscreen();
  }

  const readyOrders = useMemo(
    () => orders.filter((o) => o.kitchenStatus === "ready").slice(0, readyLimit),
    [orders, readyLimit],
  );
  const preparingOrders = useMemo(
    () => orders.filter((o) => o.kitchenStatus !== "ready").slice(0, preparingLimit),
    [orders, preparingLimit],
  );
  const newOrders = useMemo(
    () => preparingOrders.filter((o) => o.kitchenStatus === "new"),
    [preparingOrders],
  );
  const inProgressOrders = useMemo(
    () => preparingOrders.filter((o) => o.kitchenStatus === "preparing"),
    [preparingOrders],
  );

  return (
    <div
      style={{
        background: announceActive ? "#14532d" : "#0f172a",
        color: "#e2e8f0",
        margin: -20,
        padding: 24,
        minHeight: "calc(100vh - 60px)",
        transition: "background 250ms ease",
      }}
    >
      {announceActive && (
        <div
          style={{
            marginBottom: 18,
            padding: "14px 18px",
            borderRadius: 16,
            background: "#22c55e",
            color: "#052e16",
            fontSize: 24,
            fontWeight: 900,
            textAlign: "center",
            letterSpacing: 1,
          }}
        >
          NUEVO PEDIDO LISTO PARA RETIRAR
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, color: "#fff", fontSize: 34 }}>Retiro de Pedidos</h2>
          <div style={{ fontSize: 16, color: "var(--t-muted)", marginTop: 6 }}>
            Consulta tu numero y acercate al mostrador cuando aparezca en verde.
          </div>
          {kiosk && (
            <div style={{ fontSize: 12, color: "var(--t-muted)", marginTop: 8 }}>
              Config URL: <code>?view=pickup-board&amp;ready={readyLimit}&amp;preparing={preparingLimit}&amp;delivered={deliveredLimit}&amp;announceMs={announceMs}&amp;announceName={announceName ? 1 : 0}</code>
            </div>
          )}
          {!kiosk && orders.length > 0 && (
            <div style={{ fontSize: 13, color: "var(--t-muted)", marginTop: 8 }}>
              {readyOrders.length} listo(s) · {preparingOrders.length} en preparación
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => setAnnounceName((v) => !v)}
              title="Incluir el nombre del cliente en el aviso por voz"
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${announceName ? "#22c55e" : "#334155"}`,
                background: announceName ? "#14532d" : "#1e293b",
                color: announceName ? "#bbf7d0" : "#e2e8f0",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {announceName ? "🔊 Nombre + número" : "🔇 Solo número"}
            </button>
            <button
              onClick={load}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #334155",
                background: "#1e293b",
                color: "#e2e8f0",
                cursor: "pointer",
              }}
            >
              Actualizar
            </button>
            <button
              onClick={toggleFullscreen}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: "1px solid #334155",
                background: isFullscreen ? "#22c55e" : "#1e293b",
                color: "#e2e8f0",
                cursor: "pointer",
              }}
            >
              {isFullscreen ? "Salir TV" : "Modo TV"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 18 }}>
        <div style={{ display: "grid", gap: 18 }}>
        <Section title={`Listos para retirar${readyOrders.length ? ` (${readyOrders.length})` : ""}`} subtitle="Acercate al mostrador" accent="#22c55e">
          {readyOrders.length === 0 ? (
            <EmptyState text="Aun no hay pedidos listos." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
              {readyOrders.map((order) => (
                <BigTicket
                  key={order.ticketId}
                  code={order.pickupCode}
                  label={order.pickupName || "Cliente"}
                  detail={order.itemsSummary}
                  color="#22c55e"
                  darkText
                />
              ))}
            </div>
          )}
        </Section>

        <Section title="Entregados hace poco" subtitle="Ultimos llamados completados" accent="#94a3b8">
          {recentDelivered.length === 0 ? (
            <EmptyState text="Aun no hay pedidos entregados recientemente." />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              {recentDelivered.map((entry) => (
                <DeliveredTicket
                  key={entry.invoiceId}
                  code={entry.pickupCode}
                  label={entry.pickupName || "Cliente"}
                />
              ))}
            </div>
          )}
        </Section>
        </div>

        <Section
          title={`Preparando${preparingOrders.length ? ` (${preparingOrders.length})` : ""}`}
          subtitle={newOrders.length && inProgressOrders.length ? `${newOrders.length} en cola · ${inProgressOrders.length} preparando` : "Tu pedido esta en cocina"}
          accent="#3b82f6"
        >
          {preparingOrders.length === 0 ? (
            <EmptyState text="Sin pedidos en preparacion." />
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {preparingOrders.map((order) => (
                <SmallTicket
                  key={order.ticketId}
                  code={order.pickupCode}
                  label={order.pickupName || "Cliente"}
                  detail={order.itemsSummary}
                  status={order.kitchenStatus === "preparing" ? "Preparando" : "En cola"}
                />
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function playReadyTone() {
  try {
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    for (const [index, freq] of [880, 1174, 1568].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + index * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.18 + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + index * 0.18);
      osc.stop(now + index * 0.18 + 0.16);
    }

    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    // Ignorar si el navegador bloquea audio sin interacción previa.
  }
}

function announceReadyOrders(orders: PickupOrder[], announceName: boolean) {
  try {
    if (!("speechSynthesis" in window) || orders.length === 0) return;
    window.speechSynthesis.cancel();

    const voices = window.speechSynthesis.getVoices();
    const esVoice =
      voices.find((voice) => voice.lang.toLowerCase().startsWith("es-co")) ??
      voices.find((voice) => voice.lang.toLowerCase().startsWith("es")) ??
      null;

    for (const order of orders.slice(0, 2)) {
      const utterance = new SpeechSynthesisUtterance(buildAnnounceText(order, announceName));
      utterance.lang = esVoice?.lang ?? "es-CO";
      utterance.rate = 0.95;
      utterance.pitch = 1;
      if (esVoice) utterance.voice = esVoice;
      window.speechSynthesis.speak(utterance);
    }
  } catch {
    // Ignorar si el navegador no soporta TTS o requiere interacción previa.
  }
}

function buildAnnounceText(order: PickupOrder, announceName: boolean): string {
  const code = formatPickupSpeech(order.pickupCode);
  const prefix = isAutoOrderCode(order.pickupCode) ? "Pedido" : "Localizador";
  const name = order.pickupName?.trim();
  const hasName = announceName && Boolean(name) && name!.toLowerCase() !== "cliente";

  if (hasName && order.pickupCode) {
    return `${prefix} ${code}, ${name}, acercarse al mostrador.`;
  }
  if (hasName) {
    return `${name}, acercarse al mostrador.`;
  }
  return `${prefix} ${code}, acercarse al mostrador.`;
}

function formatPickupCode(code?: string) {
  return formatPickupSpeech(code);
}

function clampParam(value: string | null, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function Section({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#111827",
        border: `1px solid ${accent}44`,
        borderRadius: 20,
        padding: 18,
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>{title}</div>
        <div style={{ fontSize: 14, color: "var(--t-muted)", marginTop: 4 }}>{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function BigTicket({
  code,
  label,
  detail,
  color,
  darkText,
}: {
  code?: string;
  label: string;
  detail: string;
  color: string;
  darkText?: boolean;
}) {
  return (
    <div
      style={{
        background: color,
        color: darkText ? "#052e16" : "#fff",
        borderRadius: 24,
        padding: 20,
        minHeight: 220,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div style={{ fontSize: 18, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1, letterSpacing: 2 }}>
        {formatPickupDisplay(code)}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>{detail}</div>
    </div>
  );
}

function SmallTicket({
  code,
  label,
  detail,
  status,
}: {
  code?: string;
  label: string;
  detail: string;
  status: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 14,
        alignItems: "center",
        background: "#1e293b",
        borderRadius: 16,
        padding: 16,
      }}
    >
      <div style={{ fontSize: 34, fontWeight: 900, color: "#fff", minWidth: 96 }}>
        {formatPickupDisplay(code)}
      </div>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{label}</div>
        <div style={{ fontSize: 13, color: "var(--t-muted)", marginTop: 4 }}>{detail}</div>
      </div>
      <div
        style={{
          padding: "8px 12px",
          borderRadius: 999,
          background: "#0ea5e9",
          color: "#fff",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {status}
      </div>
    </div>
  );
}

function DeliveredTicket({ code, label }: { code?: string; label: string }) {
  return (
    <div
      style={{
        background: "#334155",
        borderRadius: 16,
        padding: 16,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 34, fontWeight: 900, color: "#e2e8f0", lineHeight: 1.1 }}>
        {formatPickupDisplay(code)}
      </div>
      <div style={{ fontSize: 13, color: "#cbd5e1", marginTop: 8 }}>{label}</div>
      <div style={{ fontSize: 11, color: "var(--t-muted)", marginTop: 4 }}>Entregado</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      style={{
        border: "1px dashed #334155",
        borderRadius: 16,
        padding: 32,
        textAlign: "center",
        color: "var(--t-muted)",
        fontSize: 16,
      }}
    >
      {text}
    </div>
  );
}
