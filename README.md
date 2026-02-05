# HR Administration System

Simple HR admin system built with the T3 stack  
Employees departments and role based access control

This README only covers setup seeding and running the app

# IMPORTANT!
make sure you set the .env vars before building
or simply rename `.env.example` to `.env` for demo build
---

## Quick start (recommended)
note: docker also included

From the `repo root` directory:

```bash
chmod +x ./run.sh   # first time only
./run.sh            # sets up deps, DB, and starts dev server
```

To run a production-like preview:

```bash
./run.sh --preview
```


---

## Requirements

- Node.js 18+
- npm
- Docker optional but recommended

---

## Tech

- Next.js App Router
- TypeScript
- Tailwind
- tRPC
- Prisma with SQLite
- NextAuth

---

## Setup without Docker 

Install deps

```bash
npm install
```

Create `.env`

```env
DATABASE_URL="file:./db.sqlite"
NEXTAUTH_SECRET="your-secret"
NEXTAUTH_URL="http://localhost:3000"
```

Run database and seed

```bash
npx prisma migrate dev
npm run db:seed
```

Start dev server

```bash
npm run dev
```

App runs at  
http://localhost:3000

---

## Default admin account

Created by the seed script

- email `hradmin@test.com`
- password `TestPass1234`
- role HR admin

---

## Setup with Docker
Build and run

```bash
docker compose up --build
```

App runs at  
http://localhost:3000

SQLite database is stored inside the container

Stop containers

```bash
docker compose down
```

---

## Prisma Studio optional

```bash
npx prisma studio
```
