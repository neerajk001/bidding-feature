import { NextRequest, NextResponse } from 'next/server'

// ⚠️ THIS ENDPOINT IS DISABLED
// Use the web UI at /test-otp for real Firebase phone verification
// This ensures proper Firebase authentication flow

export async function POST(request: NextRequest) {
  return NextResponse.json(
    {
      error: 'This test endpoint has been disabled',
      message: 'Please use the web UI at /test-otp for phone verification with Firebase',
      web_ui_url: '/test-otp',
      hint: 'Visit http://localhost:3001/test-otp to verify phone numbers'
    },
    { status: 410 } // 410 Gone - endpoint permanently removed
  )
}
