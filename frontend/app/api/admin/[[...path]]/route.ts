/**
 * Proxy for /api/admin/* so the backend receives the session.
 * Next.js rewrites send the request from the server without browser cookies,
 * so the backend gets 401. This route runs on the Next.js server, has access
 * to the request cookies, and forwards the session token to the backend.
 */
import { NextRequest, NextResponse } from 'next/server'

const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const apiBase = `${backendUrl.replace(/\/$/, '')}/api`

// NextAuth session cookie names (dev vs prod HTTPS)
const SESSION_COOKIE_NAMES = ['next-auth.session-token', '__Secure-next-auth.session-token']

function getSessionToken(request: NextRequest): string | null {
  for (const name of SESSION_COOKIE_NAMES) {
    const value = request.cookies.get(name)?.value
    if (value) return value
  }
  return null
}

async function getRequestBody(request: NextRequest): Promise<ArrayBuffer | string | undefined> {
  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('multipart/form-data')) {
    return request.arrayBuffer()
  }
  const text = await request.text()
  return text.length > 0 ? text : undefined
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, undefined, ctx)
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, await getRequestBody(request), ctx)
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, await getRequestBody(request), ctx)
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, await getRequestBody(request), ctx)
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  return proxy(request, undefined, ctx)
}

async function proxy(
  request: NextRequest,
  body: ArrayBuffer | string | undefined,
  ctx: { params: Promise<{ path?: string[] }> }
) {
  const token = getSessionToken(request)
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { path } = await ctx.params
  const pathSegments = path && path.length > 0 ? path : []
  const backendPath = pathSegments.length ? pathSegments.join('/') : ''
  const url = `${apiBase}/admin/${backendPath}${request.nextUrl.search}`

  const headers = new Headers()
  headers.set('Authorization', `Bearer ${token}`)
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('Content-Type', contentType)

  const res = await fetch(url, {
    method: request.method,
    headers,
    body: body ?? undefined,
  })

  const responseBody = await res.text()
  try {
    const json = JSON.parse(responseBody)
    return NextResponse.json(json, { status: res.status })
  } catch {
    return new NextResponse(responseBody, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') || 'text/plain' },
    })
  }
}
