import { Request, Response, NextFunction } from 'express'

// Capture raw body for Razorpay webhook (signature verification requires unmodified body)
export function captureRawBody(req: Request, res: Response, next: NextFunction) {
  if (req.originalUrl === '/api/winner/webhook' && req.method === 'POST') {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      (req as any).rawBody = Buffer.concat(chunks)
      next()
    })
  } else {
    next()
  }
}
