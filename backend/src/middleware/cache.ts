import { Response } from 'express'

export function setNoCache(res: Response) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Expires', '0')
  res.setHeader('Surrogate-Control', 'no-store')
}

export function setShortPublicCache(
  res: Response,
  maxAgeSeconds: number,
  staleWhileRevalidateSeconds: number = maxAgeSeconds * 2
) {
  const safeMaxAge = Math.max(0, Math.floor(maxAgeSeconds))
  const safeSwr = Math.max(0, Math.floor(staleWhileRevalidateSeconds))
  res.setHeader('Cache-Control', `public, max-age=${safeMaxAge}, stale-while-revalidate=${safeSwr}`)
}
