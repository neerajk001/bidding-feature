/**
 * Runtime proxy for public backend API routes.
 * Uses BACKEND_URL at request time so production works when the env is set in the container.
 * /api/admin/* is handled by app/api/admin/[[...path]]. /api/auth/session, callback, signin etc. are NextAuth.
 */
import { NextRequest, NextResponse } from 'next/server'

const getApiBase = () => {
  const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
  return `${backendUrl.replace(/\/$/, '')}/api`
}

// NextAuth handles these under /api/auth/ - we must not proxy them (more specific route wins)
const NEXTAUTH_SEGMENTS = new Set(['session', 'signin', 'signout', 'callback', 'csrf', 'providers', 'getcsrf'])

async function getRequestBody(request: NextRequest): Promise<ArrayBuffer | string | undefined> {
  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('multipart/form-data')) {
    return request.arrayBuffer()
  }
  const text = await request.text()
  return text.length > 0 ? text : undefined
}

function shouldProxy(path: string[] | undefined): boolean {
  if (!path || path.length === 0) return false
  if (path[0] === 'admin') return false // handled by app/api/admin/[[...path]]
  if (path[0] === 'auth' && path[1] && NEXTAUTH_SEGMENTS.has(path[1])) return false // NextAuth
  return true
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
  const { path } = await ctx.params
  if (!shouldProxy(path)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const pathSegments = path && path.length > 0 ? path : []
  const backendPath = pathSegments.join('/')
  const apiBase = getApiBase()
  const url = `${apiBase}/${backendPath}${request.nextUrl.search}`

  const headers = new Headers()
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('Content-Type', contentType)

  try {
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
  } catch (err) {
    console.error('Backend proxy error:', err)
    return NextResponse.json(
      { error: 'Backend unreachable', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 502 }
    )
  }
}
