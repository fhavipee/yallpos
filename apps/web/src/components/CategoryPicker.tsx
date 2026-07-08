import { useIsTablet } from "../lib/useMediaQuery";

export type CategoryOption = {
  id: string;
  name: string;
  color?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  /** image = mostrar imagen en móvil · description = solo nombre en móvil */
  mobileDisplay?: "image" | "description" | string | null;
};

type Props = {
  categories: CategoryOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  allLabel?: string;
};

export function categoryShowsImageOnMobile(category: Pick<CategoryOption, "mobileDisplay" | "imageUrl">): boolean {
  return category.mobileDisplay !== "description" && Boolean(category.imageUrl);
}

export default function CategoryPicker({
  categories,
  selectedId,
  onSelect,
  allLabel = "Todos",
}: Props) {
  const isMobile = useIsTablet();

  return (
    <div className="yall-chip-row">
      <Chip active={!selectedId} color="#2563eb" onClick={() => onSelect("")}>
        {allLabel}
      </Chip>
      {categories.map((c) => (
        <Chip
          key={c.id}
          active={selectedId === c.id}
          color={c.color ?? "#64748b"}
          onClick={() => onSelect(c.id)}
        >
          {renderChipContent(c, isMobile)}
        </Chip>
      ))}
    </div>
  );
}

function renderChipContent(category: CategoryOption, isMobile: boolean) {
  const showImage = category.imageUrl && (!isMobile || categoryShowsImageOnMobile(category));

  if (showImage) {
    return (
      <span className="yall-cat-chip-inner">
        <img src={category.imageUrl!} alt="" className="yall-cat-chip-thumb" loading="lazy" />
        <span className="yall-cat-chip-label">{category.name}</span>
      </span>
    );
  }

  return category.name;
}

function Chip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="yall-cat-chip"
      data-active={active ? "true" : undefined}
      onClick={onClick}
      style={{
        ["--chip-accent" as string]: color,
        background: active ? color : undefined,
        color: active ? "#fff" : undefined,
      }}
    >
      {children}
    </button>
  );
}
