import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error: 'This test endpoint has been disabled',
      message: 'Please use the web UI at /test-otp for Clerk phone verification',
      web_ui_url: '/test-otp'
    },
    { status: 410 }
  )
}
