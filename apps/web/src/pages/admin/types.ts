export type AdminTab =
  | "overview"
  | "branch"
  | "company"
  | "categories"
  | "products"
  | "taxes"
  | "daily-menu"
  | "floor"
  | "staff"
  | "shifts"
  | "users"
  | "roles"
  | "kds"
  | "cash"
  | "inventory"
  | "modifiers"
  | "operations"
  | "fiscal"
  | "customers"
  | "payments"
  | "onboarding"
  | "audit";

export type AdminNavGroup = {
  title: string;
  tabs: { id: AdminTab; label: string; desc: string }[];
};

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    title: "General",
    tabs: [
      { id: "overview", label: "Resumen", desc: "Checklist pre-producción" },
      { id: "branch", label: "Sucursal", desc: "Sede y multi-sucursal" },
      { id: "company", label: "Empresa", desc: "Datos legales y contacto" },
    ],
  },
  {
    title: "Catálogo",
    tabs: [
      { id: "categories", label: "Categorías", desc: "Organización del menú" },
      { id: "products", label: "Productos", desc: "Precios, IVA, barcode" },
      { id: "taxes", label: "Impuestos", desc: "IVA e impoconsumo" },
      { id: "modifiers", label: "Modificadores", desc: "Extras y opciones" },
      { id: "daily-menu", label: "Menú del día", desc: "Publicación diaria" },
    ],
  },
  {
    title: "Operación",
    tabs: [
      { id: "floor", label: "Mesas", desc: "Áreas y capacidad" },
      { id: "staff", label: "Personal", desc: "Meseros y cocina" },
      { id: "shifts", label: "Asistencia", desc: "Programar turnos y horas" },
      { id: "users", label: "Usuarios", desc: "Login y asignación" },
      { id: "roles", label: "Roles", desc: "Permisos custom" },
      { id: "kds", label: "KDS", desc: "Estaciones y rutas" },
      { id: "cash", label: "Cajas", desc: "Puntos de cobro" },
    ],
  },
  {
    title: "Infraestructura",
    tabs: [
      { id: "inventory", label: "Inventario", desc: "Bodegas y stock" },
      { id: "operations", label: "Operaciones", desc: "Impresoras, alertas, mesero" },
      { id: "payments", label: "Pagos", desc: "Métodos habilitados" },
    ],
  },
  {
    title: "Fiscal y sistema",
    tabs: [
      { id: "customers", label: "Clientes", desc: "Adquirientes, genérico y fidelización" },
      { id: "fiscal", label: "Fiscal / DIAN", desc: "Certificado y resoluciones" },
      { id: "onboarding", label: "Onboarding", desc: "Plantillas y wizard" },
      { id: "audit", label: "Auditoría", desc: "Historial de cambios" },
    ],
  },
];

/** @deprecated use ADMIN_NAV_GROUPS */
export const ADMIN_TABS = ADMIN_NAV_GROUPS.flatMap((g) => g.tabs);

export type SetupChecklistItem = {
  id: string;
  label: string;
  ok: boolean;
  blocking: boolean;
  count?: number;
  note?: string;
};

export type SetupStatus = {
  branch: { id: string; name: string; type: string; address?: string; timezone?: string; isActive: boolean };
  company: Record<string, unknown>;
  counts: Record<string, number>;
  checklist: SetupChecklistItem[];
  blockingPending: string[];
  optionalPending: string[];
  readyForProduction: boolean;
  readyForDian: boolean;
  fiscalSimulation?: boolean;
};

export const CHECKLIST_TAB_MAP: Record<string, AdminTab> = {
  company: "company",
  areas: "floor",
  tables: "floor",
  categories: "categories",
  products: "products",
  staff: "staff",
  waiters: "staff",
  users: "users",
  roles: "roles",
  waiter_user: "users",
  kds_stations: "kds",
  kds_routing: "kds",
  cash_registers: "cash",
  warehouses: "inventory",
  fiscal_resolution: "fiscal",
  payment_methods: "payments",
  kiosk_pin: "operations",
  printers: "operations",
  kitchen_printer: "operations",
  fiscal_cert: "fiscal",
};

export const STAFF_ROLES = [
  { value: "waiter", label: "Mesero" },
  { value: "cashier", label: "Cajero" },
  { value: "kitchen", label: "Cocina" },
  { value: "manager", label: "Gerente" },
  { value: "baker", label: "Panadero" },
];

export const USER_ROLES = [
  { value: "owner", label: "Propietario" },
  { value: "manager", label: "Gerente" },
  { value: "cashier", label: "Cajero" },
  { value: "waiter", label: "Mesero" },
  { value: "kitchen", label: "Cocina" },
  { value: "baker", label: "Panadero" },
];

export const PAYMENT_METHODS = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "qr", label: "QR / Nequi" },
  { value: "credit", label: "Crédito" },
  { value: "voucher", label: "Voucher" },
  { value: "mixed", label: "Mixto" },
];

export const CONSUMPTION_TAX_TYPES = [
  { value: "none", label: "Sin impoconsumo" },
  { value: "inc_8", label: "Impoconsumo 8%" },
  { value: "inc_4", label: "Impoconsumo 4%" },
  { value: "inc_16", label: "Impoconsumo 16%" },
];

export const TAX_TYPES = [
  { value: "iva_19", label: "IVA 19%" },
  { value: "iva_5", label: "IVA 5%" },
  { value: "exento", label: "Exento" },
  { value: "no_gravado", label: "No gravado" },
];

export const PRODUCT_TYPES = [
  { value: "standard", label: "Estándar" },
  { value: "combo", label: "Combo" },
  { value: "recipe", label: "Receta" },
  { value: "weight_based", label: "Por peso" },
];

export const COURSES = [
  { value: "appetizer", label: "Entrada" },
  { value: "main", label: "Plato fuerte" },
  { value: "drink", label: "Bebida" },
  { value: "dessert", label: "Postre" },
];

export const PRODUCT_UNITS = [
  { value: "und", label: "Unidad" },
  { value: "kg", label: "Kilogramo" },
  { value: "g", label: "Gramo" },
  { value: "lb", label: "Libra" },
];

export const DOC_TYPES = [
  { value: "pos_equivalent", label: "Documento equivalente POS" },
  { value: "invoice", label: "Factura electrónica" },
  { value: "credit_note", label: "Nota crédito" },
  { value: "debit_note", label: "Nota débito" },
];

export const TIMEZONES = [
  { value: "America/Bogota", label: "Colombia (Bogotá)" },
  { value: "America/Lima", label: "Perú (Lima)" },
  { value: "America/Mexico_City", label: "México (CDMX)" },
];

export const BRANCH_TYPES = [
  { value: "restaurant", label: "Restaurante" },
  { value: "bakery", label: "Panadería" },
  { value: "cafe", label: "Café" },
  { value: "store", label: "Tienda" },
];
