/**
 * Safely parse a Response body as JSON.
 * Avoids "Unexpected token 'I', \"Internal S\"... is not valid JSON" when the server
 * returns plain text (e.g. "Internal Server Error") or HTML instead of JSON.
 */
export async function parseJsonFromResponse<T = unknown>(response: Response): Promise<T> {
  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()
  if (!text.trim()) {
    return {} as T
  }
  if (!contentType.includes('application/json')) {
    throw new Error(
      response.ok
        ? `Server returned non-JSON (${contentType})`
        : `Request failed (${response.status}): ${text.slice(0, 200)}`
    )
  }
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(
      response.ok
        ? 'Invalid JSON from server'
        : `Request failed (${response.status}): ${text.slice(0, 200)}`
    )
  }
}

/**
 * Fetch a URL and return parsed JSON. Throws with a clear message if the response
 * is not JSON (e.g. 500 HTML or "Internal Server Error" text).
 */
export async function fetchApi<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<{ ok: boolean; status: number; data: T }> {
  const response = await fetch(url, options)
  const data = await parseJsonFromResponse<T>(response)
  return { ok: response.ok, status: response.status, data }
}
