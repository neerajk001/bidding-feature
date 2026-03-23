import express, { Request, Response } from 'express'
import { runWinnerPaymentCheck } from '../services/cron.service'

const router = express.Router()

router.post('/cron/check-winner-payments', async (req: Request, res: Response) => {
  const secret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET
  const provided = req.headers['x-cron-secret'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '')

  if (secret && provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const result = await runWinnerPaymentCheck('http-route')
    return res.json({ ok: true, ...result })
  } catch (e) {
    console.error('Cron check-winner-payments error:', e)
    return res.status(500).json({ error: 'Cron failed' })
  }
})

export default router
