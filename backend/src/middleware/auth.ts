import { Request, Response, NextFunction } from 'express'
import { getToken } from 'next-auth/jwt'
import { env } from '../config/env'
import { supabaseAdmin } from '../config/supabase'

// Cache for admin emails from database
let adminEmailsCache: string[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 60000 // 1 minute

async function getAdminEmailsFromDb(): Promise<string[]> {
  try {
    // Return cache if still valid
    const now = Date.now()
    if (adminEmailsCache && (now - cacheTimestamp) < CACHE_TTL) {
      return adminEmailsCache
    }

    // Fetch from database
    const { data, error } = await supabaseAdmin
      .from('admin_settings')
      .select('value')
      .eq('key', 'admin_emails')
      .single()

    if (!error && data?.value && Array.isArray(data.value)) {
      adminEmailsCache = data.value.map((email: string) => email.toLowerCase())
      cacheTimestamp = now
      return adminEmailsCache
    }

    return []
  } catch (error) {
    console.error('Error fetching admin emails from DB:', error)
    return []
  }
}

export async function isAdminEmail(email?: string | null): Promise<boolean> {
  if (!email) return false
  
  const normalizedEmail = email.toLowerCase()
  
  // Check env first (always valid)
  if (env.adminEmails.length > 0 && env.adminEmails.includes(normalizedEmail)) {
    return true
  }
  
  // Check database
  const dbEmails = await getAdminEmailsFromDb()
  if (dbEmails.length > 0 && dbEmails.includes(normalizedEmail)) {
    return true
  }
  
  return false
}

// NextAuth JWT cookie names (frontend proxy sends Bearer token when rewrites would omit cookies)
const SESSION_COOKIE_NAMES = ['next-auth.session-token', '__Secure-next-auth.session-token']

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    let token: { email?: string } | null = null

    const authHeader = req.headers.authorization
    if (authHeader?.startsWith('Bearer ')) {
      const jwt = authHeader.slice(7).trim()
      if (jwt) {
        const syntheticCookies: Record<string, string> = {}
        SESSION_COOKIE_NAMES.forEach((name) => {
          syntheticCookies[name] = jwt
        })
        token = await getToken({
          req: { headers: {}, cookies: syntheticCookies } as any,
          secret: env.nextAuthSecret
        })
      }
    }

    if (!token) {
      token = await getToken({
        req: { headers: req.headers, cookies: req.cookies } as any,
        secret: env.nextAuthSecret
      })
    }

    const email = token?.email as string | undefined

    if (!token || !(await isAdminEmail(email))) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    return next()
  } catch (error) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
}
