import { createClient } from '@supabase/supabase-js'
import { env } from './env'

export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  global: {
    fetch: (url, options = {}) => {
      return fetch(url, {
        ...options,
        signal: AbortSignal.timeout(15000)
      }).catch((err: any) => {
        if (err?.name === 'AbortError') {
          console.error('Supabase request timeout:', url)
        } else if (err?.code === 'ENOTFOUND' || err?.cause?.code === 'ENOTFOUND') {
          console.error('Supabase DNS lookup failed. Check network connection or Supabase project status.')
        } else {
          console.error('Supabase fetch error:', err?.message || err)
        }
        throw err
      })
    }
  }
})
