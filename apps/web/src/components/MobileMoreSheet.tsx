import type { AppTab } from "./MobileBottomNav";

type Props = {
  open: boolean;
  onClose: () => void;
  items: { id: AppTab; label: string }[];
  onSelect: (tab: AppTab) => void;
  userName?: string;
};

export default function MobileMoreSheet({ open, onClose, items, onSelect, userName }: Props) {
  if (!open) return null;

  return (
    <div className="yall-more-sheet" onClick={onClose} role="presentation">
      <div className="yall-more-sheet__panel" onClick={(e) => e.stopPropagation()}>
        <div className="yall-more-sheet__header">
          <div>
            <strong>Más opciones</strong>
            {userName && (
              <div className="yall-more-sheet__user">{userName}</div>
            )}
          </div>
          <button type="button" className="yall-more-sheet__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="yall-more-sheet__list">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className="yall-more-sheet__item"
              onClick={() => {
                onSelect(item.id);
                onClose();
              }}
            >
              <span className="yall-more-sheet__item-label">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
