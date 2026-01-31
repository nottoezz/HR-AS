import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";

import { db } from "@/server/db";
import { env } from "@/env";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      role: string;
      employeeId: string | null;
    } & DefaultSession["user"];
  }
}

type TokenWithRole = {
  role?: string;
  employeeId?: string | null;
} & Record<string, unknown>;

export const authConfig = {
  adapter: PrismaAdapter(db),

  secret: env.AUTH_SECRET,
  trustHost: true,

  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },

  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await db.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            employeeId: true,
            passwordHash: true,
          },
        });

        if (!user?.passwordHash) return null;

        const isValid = await compare(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          email: user.email ?? undefined,
          name: user.name ?? undefined,
          role: String(user.role),
          employeeId: user.employeeId ?? null,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const t = token as TokenWithRole;
        const u = user as { id: string; role?: string; employeeId?: string | null };

        token.sub = u.id;
        t.role = u.role;
        t.employeeId = u.employeeId ?? null;
      }
      return token;
    },

    async session({ session, token }) {
      const t = token as TokenWithRole;

      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.role = t.role ?? "EMPLOYEE";
        session.user.employeeId = t.employeeId ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
