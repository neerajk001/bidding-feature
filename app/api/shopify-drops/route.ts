import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const revalidate = 60 // Revalidate every 60 seconds

// Public GET endpoint - only returns active drops
export async function GET() {
  try {
    const { data: drops, error } = await supabaseAdmin
      .from('shopify_drops')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch shopify drops' },
        { status: 500 }
      )
    }

    return NextResponse.json({ drops: drops || [] })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
