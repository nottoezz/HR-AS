# HR Administration System

This project is a simple HR Administration System built using the T3 Stack.  
It provides employee and department management with role-based access control.

This README focuses only on installing the project, setting up the database, seeding initial data, and running the application.  
Additional documentation can be added later.

---

## Requirements

- Node.js 18 or newer
- npm
- SQLite (managed automatically by Prisma)

---

## Tech Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- tRPC
- Prisma ORM (SQLite)
- NextAuth

---

## Installation

Install project dependencies:

```bash
npm install
```

---

## Environment Setup

Create a `.env` file in the project root with the following values:

```env
DATABASE_URL="file:./db.sqlite"
NEXTAUTH_SECRET="your-secret"
NEXTAUTH_URL="http://localhost:3000"
```

---

## Database Setup

This project uses Prisma with SQLite.

### Run Migrations

Run the initial database migrations:

```bash
npx prisma migrate dev
```

This will:

- Create the SQLite database
- Apply all Prisma migrations

---

## Database Seeding

A Prisma seed script is included to create an initial HR Administrator account.

### Seeded Admin Account

- Email: `hradmin@test.com`
- Password: `TestPass1234`
- Role: HR Administrator

Run the seed script after migrations:

```bash
npx prisma db seed
```

---

## Running the Application

Start the development server:

```bash
npm run dev
```

The application will be available at:

```
http://localhost:3000
```

---

## Prisma Studio (Optional)

To inspect and manage the database using Prisma Studio:

```bash
npx prisma studio
```