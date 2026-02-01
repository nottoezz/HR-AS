#!/bin/sh
set -e
cd /app

echo "Running database migrations..."
npx prisma migrate deploy

echo "Seeding database..."
npm run db:seed

echo "Starting application..."
exec npm run start
