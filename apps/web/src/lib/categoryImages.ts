export type CategoryImageOption = {
  id: string;
  label: string;
  path: string;
  keywords: string[];
};

/** Imágenes incluidas en la app — sin URL externa. */
export const CATEGORY_IMAGES: CategoryImageOption[] = [
  { id: "entradas", label: "Entradas", path: "/category-images/entradas.svg", keywords: ["entrada", "aperitivo", "antojito", "starter"] },
  { id: "sopas", label: "Sopas", path: "/category-images/sopas.svg", keywords: ["sopa", "caldo", "crema", "consome"] },
  { id: "platos-fuertes", label: "Platos fuertes", path: "/category-images/platos-fuertes.svg", keywords: ["plato", "fuerte", "principal", "main", "bandeja"] },
  { id: "parrilla", label: "Parrilla / BBQ", path: "/category-images/parrilla.svg", keywords: ["parrilla", "bbq", "asado", "churrasco", "costilla", "carne"] },
  { id: "mariscos", label: "Mariscos", path: "/category-images/mariscos.svg", keywords: ["marisco", "pescado", "salmon", "salón", "camarón", "ceviche"] },
  { id: "pastas", label: "Pastas", path: "/category-images/pastas.svg", keywords: ["pasta", "spaghetti", "lasaña", "risotto"] },
  { id: "arroz", label: "Arroces", path: "/category-images/arroz.svg", keywords: ["arroz", "paella", "wok"] },
  { id: "ensaladas", label: "Ensaladas", path: "/category-images/ensaladas.svg", keywords: ["ensalada", "verde", "bowl"] },
  { id: "postres", label: "Postres", path: "/category-images/postres.svg", keywords: ["postre", "dulce", "torta", "helado", "brownie"] },
  { id: "bebidas", label: "Bebidas", path: "/category-images/bebidas.svg", keywords: ["bebida", "gaseosa", "jugo", "refresco", "limonada"] },
  { id: "cocteles", label: "Cócteles", path: "/category-images/cocteles.svg", keywords: ["coctel", "cocktail", "bar", "cerveza", "vino"] },
  { id: "cafe", label: "Café", path: "/category-images/cafe.svg", keywords: ["café", "cafe", "capuchino", "espresso", "té", "te"] },
  { id: "desayunos", label: "Desayunos", path: "/category-images/desayunos.svg", keywords: ["desayuno", "brunch", "huevo", "arepa"] },
  { id: "menu-del-dia", label: "Menú del día", path: "/category-images/menu-del-dia.svg", keywords: ["menú del día", "menu del dia", "ejecutivo", "almuerzo"] },
  { id: "vegetariano", label: "Vegetariano", path: "/category-images/vegetariano.svg", keywords: ["vegetar", "vegano", "veggie", "plant"] },
  { id: "ninos", label: "Niños", path: "/category-images/ninos.svg", keywords: ["niño", "nino", "kids", "infantil"] },
  { id: "rapido", label: "Comida rápida", path: "/category-images/rapido.svg", keywords: ["rápida", "rapida", "hamburguesa", "perro", "hot dog", "pizza"] },
  { id: "general", label: "General", path: "/category-images/general.svg", keywords: [] },
];

const pathSet = new Set(CATEGORY_IMAGES.map((i) => i.path));

export function isBuiltinCategoryImage(url?: string | null): boolean {
  if (!url) return false;
  return pathSet.has(url) || CATEGORY_IMAGES.some((i) => url.endsWith(i.path));
}

export function suggestCategoryImage(name: string): string | undefined {
  const n = name.trim().toLowerCase();
  if (!n) return undefined;
  const match = CATEGORY_IMAGES.find((img) =>
    img.keywords.some((k) => n.includes(k)) || n.includes(img.label.toLowerCase()),
  );
  return match?.path ?? CATEGORY_IMAGES.find((i) => i.id === "general")?.path;
}

export function categoryImageLabel(url?: string | null): string | undefined {
  if (!url) return undefined;
  return CATEGORY_IMAGES.find((i) => i.path === url || url.endsWith(i.path))?.label;
}
