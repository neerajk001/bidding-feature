import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  try {
    const { data: winners, error } = await supabaseAdmin
      .from('winners')
      .select(`
        id,
        auction_id,
        bidder_id,
        winning_amount,
        created_at,
        bidder:bidders(name, phone, email),
        auction:auctions(title, product_id)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({
      success: true,
      winners: winners || []
    })
  } catch (error: any) {
    console.error('Winners API error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch winners',
        message: error.message 
      },
      { status: 500 }
    )
  }
}
