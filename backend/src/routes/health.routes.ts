import express, { Request, Response } from 'express'
import { supabaseAdmin } from '../config/supabase'
import { env } from '../config/env'

const router = express.Router()

router.get('/health', async (_req: Request, res: Response) => {
  const hasEnv = Boolean(env.supabaseUrl && env.supabaseServiceRoleKey)

  if (!hasEnv) {
    return res.status(200).json({
      ok: false,
      backend: 'running',
      supabase: 'not_configured',
      message: 'Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to backend/.env or frontend/.env.local'
    })
  }

  try {
    const { error } = await supabaseAdmin.from('auctions').select('id').limit(1)
    if (error) {
      return res.status(200).json({
        ok: false,
        backend: 'running',
        supabase: 'error',
        message: error.message,
        hint: 'Check Supabase URL, service role key, and that the auctions table exists.'
      })
    }
    return res.status(200).json({
      ok: true,
      backend: 'running',
      supabase: 'connected'
    })
  } catch (err: any) {
    return res.status(200).json({
      ok: false,
      backend: 'running',
      supabase: 'error',
      message: err?.message || 'Supabase request failed',
      hint: 'Check network and Supabase project status.'
    })
  }
})

export default router
