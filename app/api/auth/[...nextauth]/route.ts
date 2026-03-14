import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import { UpstashRedisAdapter } from "@next-auth/upstash-redis-adapter"
import redis from "@/lib/redis"

const handler = NextAuth({
  adapter: UpstashRedisAdapter(redis),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user && user) {
        (session.user as any).id = user.id;
      }
      return session;
    }
  },
  secret: process.env.NEXTAUTH_SECRET,
})

export { handler as GET, handler as POST }
