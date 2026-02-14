import { type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { isAdminEmail } from '@/lib/auth/admin'

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: { params: { prompt: 'select_account' } }
    })
  ],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/admin/login'
  },
  callbacks: {
    async signIn({ user }) {
      return isAdminEmail(user.email)
    },
    async jwt({ token, user }) {
      if (user?.email) {
        ;(token as typeof token & { isAdmin?: boolean }).isAdmin = isAdminEmail(user.email)
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        ;(session.user as typeof session.user & { isAdmin?: boolean }).isAdmin = Boolean(
          (token as typeof token & { isAdmin?: boolean }).isAdmin
        )
      }
      return session
    }
  }
}
