import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    {
      error: 'Phone verification has moved to Clerk. Use Clerk sign-in to verify your phone.'
    },
    { status: 410 }
  )
}
