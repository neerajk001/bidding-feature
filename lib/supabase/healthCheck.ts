import { supabaseAdmin } from './admin'

let lastHealthCheck: { success: boolean; timestamp: number; error?: string } = {
  success: true,
  timestamp: Date.now(),
}

/**
 * Check if Supabase is reachable and healthy
 * Caches the result for 5 minutes to avoid excessive checks
 */
export async function checkSupabaseHealth(): Promise<{ success: boolean; error?: string }> {
  const now = Date.now()
  const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

  // Return cached result if recent enough
  if (now - lastHealthCheck.timestamp < CACHE_DURATION) {
    return { success: lastHealthCheck.success, error: lastHealthCheck.error }
  }

  try {
    // Simple query to check connection
    const { error } = await supabaseAdmin
      .from('auctions')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (error) {
      lastHealthCheck = {
        success: false,
        timestamp: now,
        error: `Supabase query error: ${error.message}`,
      }
      console.error('Supabase health check failed:', error)
      return { success: false, error: error.message }
    }

    lastHealthCheck = { success: true, timestamp: now }
    return { success: true }
  } catch (err: any) {
    const errorMessage = err?.cause?.code === 'ENOTFOUND'
      ? 'Cannot reach Supabase server. Please check your network connection or verify your Supabase project is active.'
      : err?.message || 'Unknown connection error'

    lastHealthCheck = {
      success: false,
      timestamp: now,
      error: errorMessage,
    }

    console.error('Supabase health check failed:', {
      message: err?.message,
      code: err?.code || err?.cause?.code,
      details: err?.toString(),
    })

    return { success: false, error: errorMessage }
  }
}

/**
 * Get the last known health status without making a new check
 */
export function getLastHealthStatus() {
  return lastHealthCheck
}
