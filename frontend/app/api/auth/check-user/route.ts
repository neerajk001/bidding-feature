import { NextRequest } from 'next/server'
import { getRequestBody, proxyAuthRequest } from '../_shared'

export async function POST(request: NextRequest) {
  return proxyAuthRequest(request, 'check-user', await getRequestBody(request))
}
