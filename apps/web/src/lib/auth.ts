import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@repo/database";
import NextAuth from "next-auth";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  providers: [
    // TODO: add real providers, e.g.:
    // GitHub({ clientId: process.env.AUTH_GITHUB_ID, clientSecret: process.env.AUTH_GITHUB_SECRET }),
  ],
});
