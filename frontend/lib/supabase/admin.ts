import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

let _adminInstance: SupabaseClient | null = null

function getAdminClient(): SupabaseClient {
  if (_adminInstance) return _adminInstance
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Supabase admin: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  }
  _adminInstance = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      fetch: (url, options = {}) => {
        return fetch(url, {
          ...options,
          signal: AbortSignal.timeout(15000), // 15 second timeout for admin operations
        }).catch((err: unknown) => {
          const e = err as { name?: string; code?: string; cause?: { code?: string }; message?: string }
          if (e.name === 'AbortError') {
            console.error('Supabase request timeout:', url)
          } else if (e.code === 'ENOTFOUND' || e.cause?.code === 'ENOTFOUND') {
            console.error('Supabase DNS lookup failed. Check network connection or Supabase project status.')
          } else {
            console.error('Supabase fetch error:', e.message)
          }
          throw err
        })
      },
    }
  })
  return _adminInstance
}

/** Lazy-initialized admin client so build can run without env vars (e.g. in CI). */
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getAdminClient() as unknown as Record<string | symbol, unknown>)[prop]
  }
})
