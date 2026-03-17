import { NextRequest, NextResponse } from 'next/server'

function getApiBase(): string {
  const backendUrl =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '')

  if (!backendUrl) {
    throw new Error(
      'BACKEND_URL or NEXT_PUBLIC_API_URL must be set (server env). Auth API proxy cannot reach the backend.'
    )
  }

  return `${backendUrl.replace(/\/$/, '')}/api`
}

export async function getRequestBody(request: NextRequest): Promise<ArrayBuffer | string | undefined> {
  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('multipart/form-data')) {
    return request.arrayBuffer()
  }

  const text = await request.text()
  return text.length > 0 ? text : undefined
}

export async function proxyAuthRequest(
  request: NextRequest,
  backendPath: string,
  body?: ArrayBuffer | string
): Promise<NextResponse> {
  const headers = new Headers()
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('Content-Type', contentType)

  try {
    const apiBase = getApiBase()
    const url = `${apiBase}/auth/${backendPath}${request.nextUrl.search}`
    const res = await fetch(url, {
      method: request.method,
      headers,
      body,
    })

    const responseBody = await res.text()

    try {
      const json = JSON.parse(responseBody)
      return NextResponse.json(json, { status: res.status })
    } catch {
      if (!res.ok) {
        return NextResponse.json(
          {
            error: responseBody || `Request failed with status ${res.status}`,
            status: res.status,
          },
          { status: res.status }
        )
      }

      return new NextResponse(responseBody, {
        status: res.status,
        headers: { 'Content-Type': res.headers.get('Content-Type') || 'text/plain' },
      })
    }
  } catch (err) {
    console.error('Auth backend proxy error:', err)
    return NextResponse.json(
      { error: 'Backend unreachable', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 502 }
    )
  }
}
