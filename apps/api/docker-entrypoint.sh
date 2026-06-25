#!/bin/sh
set -e

echo "▶ YallPos API — prisma generate"
npx prisma generate

echo "▶ YallPos API — migraciones"
npx prisma migrate deploy

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "▶ Seed piloto Restaurante de Yall"
  npx prisma db seed || echo "⚠️  Seed omitido o falló (¿DB ya poblada?)"
fi

echo "▶ Iniciando API en puerto ${PORT:-3000}"
exec "$@"
