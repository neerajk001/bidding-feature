import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Admin client with service role key - bypasses RLS
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  global: {
    fetch: (url, options = {}) => {
      return fetch(url, {
        ...options,
        signal: AbortSignal.timeout(15000), // 15 second timeout for admin operations
      }).catch((err) => {
        if (err.name === 'AbortError') {
          console.error('Supabase request timeout:', url)
        } else if (err.code === 'ENOTFOUND' || err.cause?.code === 'ENOTFOUND') {
          console.error('Supabase DNS lookup failed. Check network connection or Supabase project status.')
        } else {
          console.error('Supabase fetch error:', err.message)
        }
        throw err
      })
    },
  }
})
