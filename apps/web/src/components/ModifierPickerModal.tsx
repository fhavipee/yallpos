import { useMemo, useState } from "react";
import { formatCOP } from "../lib/api";

type ModifierOption = {
  id: string;
  name: string;
  priceDelta: string | number;
  isActive?: boolean;
};

type ModifierGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: ModifierOption[];
};

type SelectedModifier = {
  name: string;
  priceDelta?: string;
};

export default function ModifierPickerModal({
  productName,
  groups,
  onClose,
  onConfirm,
}: {
  productName: string;
  groups: ModifierGroup[];
  onClose: () => void;
  onConfirm: (data: { modifiers: SelectedModifier[]; lineNotes?: string }) => void;
}) {
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>({});
  const [lineNotes, setLineNotes] = useState("");

  const activeGroups = useMemo(
    () => groups.filter((g) => (g.options ?? []).some((o) => o.isActive !== false)),
    [groups],
  );

  function toggle(group: ModifierGroup, optionId: string) {
    setSelectedByGroup((prev) => {
      const current = prev[group.id] ?? [];
      const exists = current.includes(optionId);
      if (exists) {
        return { ...prev, [group.id]: current.filter((id) => id !== optionId) };
      }
      if (group.maxSelect <= 1) {
        return { ...prev, [group.id]: [optionId] };
      }
      if (current.length >= group.maxSelect) {
        alert(`En "${group.name}" puedes elegir máximo ${group.maxSelect}.`);
        return prev;
      }
      return { ...prev, [group.id]: [...current, optionId] };
    });
  }

  function confirm() {
    for (const group of activeGroups) {
      const selected = selectedByGroup[group.id] ?? [];
      if (selected.length < group.minSelect) {
        alert(`En "${group.name}" debes elegir al menos ${group.minSelect}.`);
        return;
      }
      if (group.maxSelect > 0 && selected.length > group.maxSelect) {
        alert(`En "${group.name}" puedes elegir máximo ${group.maxSelect}.`);
        return;
      }
    }

    const modifiers = activeGroups.flatMap((group) => {
      const ids = selectedByGroup[group.id] ?? [];
      return group.options
        .filter((opt) => ids.includes(opt.id))
        .map((opt) => ({
          name: `${group.name}: ${opt.name}`,
          priceDelta: String(opt.priceDelta ?? 0),
        }));
    });

    onConfirm({
      modifiers,
      lineNotes: lineNotes.trim() || undefined,
    });
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>Modificadores</div>
            <div style={{ fontSize: 13, color: "var(--t-muted)" }}>{productName}</div>
          </div>
          <button type="button" onClick={onClose} style={closeBtnStyle}>×</button>
        </div>

        <div style={{ display: "grid", gap: 14, maxHeight: "55vh", overflow: "auto", paddingRight: 4 }}>
          {activeGroups.map((group) => {
            const selected = selectedByGroup[group.id] ?? [];
            return (
              <div key={group.id} style={{ border: "1px solid var(--t-border)", borderRadius: 12, padding: 12 }}>
                <div style={{ fontWeight: 700 }}>{group.name}</div>
                <div style={{ fontSize: 12, color: "var(--t-muted)", marginTop: 2 }}>
                  Elige {group.minSelect} a {group.maxSelect}
                </div>
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {group.options.filter((o) => o.isActive !== false).map((option) => {
                    const checked = selected.includes(option.id);
                    const inputType = group.maxSelect <= 1 ? "radio" : "checkbox";
                    return (
                      <label key={option.id} style={optionRowStyle}>
                        <input
                          type={inputType}
                          name={`modifier-${group.id}`}
                          checked={checked}
                          onChange={() => toggle(group, option.id)}
                        />
                        <span style={{ flex: 1 }}>
                          {option.name}
                          {Number(option.priceDelta ?? 0) > 0 ? ` (+${formatCOP(Number(option.priceDelta))})` : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Nota del producto</div>
            <textarea
              value={lineNotes}
              onChange={(e) => setLineNotes(e.target.value)}
              placeholder="Ej: sin cebolla, bien asada"
              style={textareaStyle}
            />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onClose} style={secondaryBtnStyle}>Cancelar</button>
          <button type="button" onClick={confirm} style={primaryBtnStyle}>Agregar</button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 60,
  padding: 16,
};

const modalStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 560,
  background: "var(--t-card)",
  borderRadius: 16,
  border: "1px solid var(--t-border)",
  padding: 16,
  boxSizing: "border-box",
};

const optionRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  fontSize: 14,
  cursor: "pointer",
};

const textareaStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 70,
  borderRadius: 10,
  border: "1px solid var(--t-border-strong)",
  padding: 10,
  boxSizing: "border-box",
  resize: "vertical",
  background: "var(--t-card)",
  color: "var(--t-fg)",
};

const closeBtnStyle: React.CSSProperties = {
  border: "none",
  background: "transparent",
  fontSize: 24,
  cursor: "pointer",
  lineHeight: 1,
  color: "var(--t-muted)",
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid var(--t-border-strong)",
  background: "var(--t-card)",
  cursor: "pointer",
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "none",
  background: "var(--t-primary)",
  color: "var(--t-primary-fg)",
  cursor: "pointer",
  fontWeight: 700,
};
