export type HabilitationCheckItem = {
  id: string;
  label: string;
  ok: boolean;
  hint: string;
  blocking: boolean;
};

export type HabilitationChecklist = {
  ready: boolean;
  progress: number;
  blockingCount: number;
  items: HabilitationCheckItem[];
  nextSteps: string[];
};

export function buildHabilitationChecklist(input: {
  certLoaded: boolean;
  certValid: boolean;
  certExpiresInDays?: number;
  fiscalEnv: string;
  testSetId?: string | null;
  softwareId?: string | null;
  softwarePin?: string | null;
  hasResolution: boolean;
  technicalKeyOk: boolean;
  nitOk: boolean;
  certPathConfigured: boolean;
  certFileExists: boolean;
}): HabilitationChecklist {
  const items: HabilitationCheckItem[] = [
    {
      id: "cert_path",
      label: "Ruta certificado (.p12) en FISCAL_CERT_PATH",
      ok: input.certPathConfigured,
      hint: "apps/api/.env → FISCAL_CERT_PATH=./certs/certificado.p12",
      blocking: true,
    },
    {
      id: "cert_file",
      label: "Archivo .p12 presente en servidor",
      ok: input.certFileExists,
      hint: "Copie el certificado a apps/api/certs/ y reinicie la API",
      blocking: true,
    },
    {
      id: "cert_loaded",
      label: "Certificado cargado y contraseña correcta",
      ok: input.certLoaded,
      hint: "Verifique FISCAL_CERT_PASSWORD. Use POST /v1/fiscal/certificate/reload",
      blocking: true,
    },
    {
      id: "cert_valid",
      label: "Certificado vigente",
      ok: input.certValid,
      hint: input.certExpiresInDays != null && input.certExpiresInDays < 30
        ? `Vence en ${input.certExpiresInDays} días — renueve pronto`
        : "Renueve el certificado en Cámara de Comercio si está vencido",
      blocking: true,
    },
    {
      id: "company_nit",
      label: "NIT empresa configurado",
      ok: input.nitOk,
      hint: "Configuración → Empresa o seed piloto",
      blocking: true,
    },
    {
      id: "resolution",
      label: "Resolución DE POS activa",
      ok: input.hasResolution,
      hint: "Configuración → Resolución DE POS con prefijo y rango",
      blocking: true,
    },
    {
      id: "technical_key",
      label: "Clave técnica DIAN real (no placeholder)",
      ok: input.technicalKeyOk,
      hint: "Actualice technicalKey cuando llegue la resolución oficial",
      blocking: true,
    },
    {
      id: "test_set",
      label: "FISCAL_TEST_SET_ID configurado",
      ok: !!input.testSetId,
      hint: "Obtenga el Set de Prueba en el portal DIAN MUISCA",
      blocking: true,
    },
    {
      id: "software",
      label: "Software ID y PIN DIAN",
      ok: !!(input.softwareId && input.softwarePin),
      hint: "FISCAL_SOFTWARE_ID y FISCAL_SOFTWARE_PIN en .env",
      blocking: true,
    },
    {
      id: "fiscal_env",
      label: "Entorno FISCAL_ENV=habilitacion",
      ok: input.fiscalEnv === "habilitacion",
      hint: "Cambie de simulacion a habilitacion solo cuando todo lo anterior esté OK",
      blocking: false,
    },
  ];

  const blocking = items.filter((i) => i.blocking);
  const blockingOk = blocking.filter((i) => i.ok).length;
  const ready = blocking.every((i) => i.ok);

  const nextSteps: string[] = [];
  if (!input.certFileExists) nextSteps.push("1. Copiar certificado .p12 a apps/api/certs/");
  if (!input.certLoaded) nextSteps.push("2. Configurar FISCAL_CERT_PASSWORD y reiniciar API");
  if (!input.testSetId) nextSteps.push("3. Registrar software en DIAN y obtener Test Set ID");
  if (!input.technicalKeyOk) nextSteps.push("4. Actualizar clave técnica con resolución real");
  if (ready && input.fiscalEnv !== "habilitacion") {
    nextSteps.push("5. Cambiar FISCAL_ENV=habilitacion y enviar set de prueba");
  }
  if (ready && input.fiscalEnv === "habilitacion") {
    nextSteps.push("5. Panel Piloto → Enviar set habilitación → validar respuesta DIAN");
    nextSteps.push("6. Tras aprobación: FISCAL_ENV=produccion");
  }

  return {
    ready,
    progress: Math.round((blockingOk / blocking.length) * 100),
    blockingCount: blocking.length - blockingOk,
    items,
    nextSteps,
  };
}
