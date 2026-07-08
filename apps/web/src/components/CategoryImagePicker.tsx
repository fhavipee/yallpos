import { CATEGORY_IMAGES } from "../lib/categoryImages";

type Props = {
  value: string;
  onChange: (path: string) => void;
};

export default function CategoryImagePicker({ value, onChange }: Props) {
  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))",
          gap: 10,
          maxHeight: 280,
          overflowY: "auto",
          padding: 4,
        }}
      >
        <button
          type="button"
          onClick={() => onChange("")}
          style={tileStyle(!value)}
          title="Sin imagen"
        >
          <span style={{
            width: "100%",
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--t-subtle)",
            borderRadius: 8,
            fontSize: 11,
            color: "var(--t-muted)",
          }}
          >
            Sin imagen
          </span>
          <span style={labelStyle}>Ninguna</span>
        </button>
        {CATEGORY_IMAGES.map((img) => (
          <button
            key={img.id}
            type="button"
            onClick={() => onChange(img.path)}
            style={tileStyle(value === img.path)}
            title={img.label}
          >
            <img src={img.path} alt={img.label} style={{ width: "100%", height: 56, objectFit: "cover", borderRadius: 8 }} />
            <span style={labelStyle}>{img.label}</span>
          </button>
        ))}
      </div>
      {value && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--t-muted)" }}>
          Seleccionada: <strong>{CATEGORY_IMAGES.find((i) => i.path === value)?.label ?? "Personalizada"}</strong>
        </div>
      )}
    </div>
  );
}

function tileStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: 6,
    borderRadius: 10,
    border: active ? "2px solid #2563eb" : "1px solid var(--t-border)",
    background: active ? "rgba(37,99,235,0.08)" : "var(--t-card)",
    cursor: "pointer",
    textAlign: "center",
  };
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  lineHeight: 1.2,
  color: "var(--t-fg)",
  fontWeight: 600,
};
