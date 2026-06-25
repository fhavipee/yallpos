/**
 * Menú oficial — Restaurante de Yall (El Poblado, Medellín)
 * Sincronizar con POST /v1/pilot/sync-menu
 * Editar precios en la pestaña Menú o aquí y volver a sincronizar.
 */
export const PILOT_YALL = {
  tenant: {
    name: "Restaurante de Yall",
    slug: "restaurante-yall",
  },
  company: {
    name: "Restaurante de Yall",
    razonSocial: "Restaurante de Yall",
    nit: "290329032903",
    dv: null as string | null,
    vertical: "restaurant" as const,
    email: "facturacion@restaurantedeyall.co",
    phone: "+57 300 123 4567",
    address: "Calle 10 #43-50, El Poblado",
    city: "Medellín",
    department: "Antioquia",
  },
  user: {
    email: "admin@restaurantedeyall.co",
    password: "yall2025",
    name: "Admin Yall",
  },
  waiterUser: {
    email: "mesero@restaurantedeyall.co",
    password: "mesero2025",
    name: "Mesero Piloto",
  },
  branch: {
    name: "Restaurante de Yall — Principal",
  },
  fiscal: {
    prefix: "YALL",
    fromNumber: 1,
    toNumber: 5000,
    validFrom: "2025-01-01",
    validTo: "2027-12-31",
    technicalKey: "pendiente-resolucion-dian",
  },
  certificate: {
    status: "pending" as "pending" | "ready",
    note: "Esperando certificado digital de la Cámara de Comercio / DIAN",
  },
  menu: [
    {
      cat: "Entradas",
      course: "appetizer",
      color: "#f59e0b",
      items: [
        ["Patacones con hogao", 14000, "7703001001"],
        ["Empanadas antioqueñas (3)", 12000, "7703001002"],
        ["Nachos Yall", 18000, "7703001003"],
        ["Croquetas de yuca", 15000, "7703001004"],
        ["Tabla de quesos", 22000, "7703001005"],
      ] as [string, number, string][],
    },
    {
      cat: "Sopas",
      course: "appetizer",
      color: "#eab308",
      items: [
        ["Sopa del día", 10000, "7703001101"],
        ["Ajiaco santafereño", 16000, "7703001102"],
      ] as [string, number, string][],
    },
    {
      cat: "Platos fuertes",
      course: "main",
      color: "#ef4444",
      items: [
        ["Bandeja Paisa Yall", 42000, "7703002001"],
        ["Hamburguesa Yall", 32000, "7703002002"],
        ["Churrasco argentino", 48000, "7703002003"],
        ["Pollo al curry", 34000, "7703002004"],
        ["Salmón a la plancha", 52000, "7703002005"],
        ["Costillas BBQ", 45000, "7703002006"],
        ["Pescado frito", 38000, "7703002007"],
        ["Lomo de cerdo", 36000, "7703002008"],
      ] as [string, number, string][],
    },
    {
      cat: "Parrilla",
      course: "main",
      color: "#dc2626",
      items: [
        ["Picada Yall (2 pax)", 68000, "7703002101"],
        ["Chorizo santandereano", 18000, "7703002102"],
        ["Churrasco 300g", 52000, "7703002103"],
      ] as [string, number, string][],
    },
    {
      cat: "Pasta & arroz",
      course: "main",
      color: "#f97316",
      items: [
        ["Pasta carbonara", 28000, "7703002201"],
        ["Risotto de hongos", 30000, "7703002202"],
        ["Arroz con camarones", 36000, "7703002203"],
      ] as [string, number, string][],
    },
    {
      cat: "Ensaladas",
      course: "appetizer",
      color: "#22c55e",
      items: [
        ["Ensalada César", 22000, "7703002301"],
        ["Ensalada de la casa", 18000, "7703002302"],
      ] as [string, number, string][],
    },
    {
      cat: "Acompañamientos",
      course: "main",
      color: "#84cc16",
      items: [
        ["Papas a la francesa", 8000, "7703002401"],
        ["Arroz blanco", 5000, "7703002402"],
        ["Ensalada mixta", 6000, "7703002403"],
      ] as [string, number, string][],
    },
    {
      cat: "Bebidas",
      course: "drink",
      color: "#3b82f6",
      items: [
        ["Gaseosa", 5500, "7703003001"],
        ["Limonada natural", 9000, "7703003002"],
        ["Limonada de coco", 10000, "7703003003"],
        ["Jugo natural", 8000, "7703003004"],
        ["Agua", 4000, "7703003005"],
        ["Café americano", 5000, "7703003006"],
        ["Cerveza nacional", 8000, "7703003007"],
        ["Cerveza artesanal", 14000, "7703003008"],
      ] as [string, number, string][],
    },
    {
      cat: "Cocteles",
      course: "drink",
      color: "#6366f1",
      items: [
        ["Mojito clásico", 22000, "7703003101"],
        ["Margarita", 24000, "7703003102"],
        ["Gin tonic", 26000, "7703003103"],
        ["Cóctel de la casa", 28000, "7703003104"],
      ] as [string, number, string][],
    },
    {
      cat: "Postres",
      course: "dessert",
      color: "#a855f7",
      items: [
        ["Tres leches", 12000, "7703004001"],
        ["Brownie con helado", 14000, "7703004002"],
        ["Helado artesanal", 10000, "7703004003"],
        ["Cheesecake de maracuyá", 15000, "7703004004"],
      ] as [string, number, string][],
    },
  ],
};

export type PilotMenuItem = [name: string, price: number, barcode: string];
export type PilotMenuGroup = {
  cat: string;
  course: string;
  color: string;
  items: PilotMenuItem[];
};
