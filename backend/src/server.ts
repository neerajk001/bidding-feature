import express, { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { env } from './config/env'
import { captureRawBody } from './middleware/rawBody'
import { apiRateLimiter } from './middleware/rateLimit'
import { initializeCronJobs } from './services/cron.service'

// Import routes
import healthRoutes from './routes/health.routes'
import auctionRoutes from './routes/auction.routes'
import authRoutes from './routes/auth.routes'
import bidderRoutes from './routes/bidder.routes'
import cronRoutes from './routes/cron.routes'
import winnerRoutes from './routes/winner.routes'
import adminRoutes from './routes/admin.routes'

const app = express()

// Basic middleware
app.use(cors({ origin: true, credentials: true }))
app.use(cookieParser())

// Capture raw body for Razorpay webhook (must be before express.json())
app.use(captureRawBody)

// Body parsing middleware
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))

// API router
const api = express.Router()
api.use(apiRateLimiter)

// Mount route modules
api.use(healthRoutes)
api.use(auctionRoutes)
api.use(authRoutes)
api.use(bidderRoutes)
api.use(cronRoutes)
api.use(winnerRoutes)

// Mount admin routes under /admin
api.use('/admin', adminRoutes)

// Mount API router
app.use('/api', api)

// 404 handler - always return JSON
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' })
})

// Global error handler - always return JSON
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Backend error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: err?.message || undefined
  })
})

// Start server
const port = env.port
app.listen(port, () => {
  console.log(`Backend listening on port ${port}`)
  
  // Initialize cron jobs for winner emails and payment checks
  initializeCronJobs()
})
