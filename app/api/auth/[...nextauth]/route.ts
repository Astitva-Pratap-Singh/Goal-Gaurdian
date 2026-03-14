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
  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true
      }
    },
    callbackUrl: {
      name: `__Secure-next-auth.callback-url`,
      options: {
        sameSite: 'none',
        path: '/',
        secure: true
      }
    },
    csrfToken: {
      name: `__Host-next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true
      }
    },
    pkceCodeVerifier: {
      name: `__Secure-next-auth.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
        maxAge: 900
      }
    },
    state: {
      name: `__Secure-next-auth.state`,
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
        maxAge: 900
      }
    },
    nonce: {
      name: `__Secure-next-auth.nonce`,
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true
      }
    }
  },
  callbacks: {
    session({ session, user }) {
      if (session.user && user) {
        (session.user as any).id = user.id;
      }
      return session;
    }
  },
  debug: process.env.NODE_ENV === 'development',
  secret: process.env.NEXTAUTH_SECRET || "fallback_secret_for_development",
})

export { handler as GET, handler as POST }
