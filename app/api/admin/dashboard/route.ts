import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  try {
    // Get total auctions by status
    const { data: auctions, error: auctionsError } = await supabaseAdmin
      .from('auctions')
      .select('status')

    if (auctionsError) throw auctionsError

    const totalAuctions = auctions?.length || 0
    const liveAuctions = auctions?.filter(a => a.status === 'live').length || 0
    const draftAuctions = auctions?.filter(a => a.status === 'draft').length || 0
    const endedAuctions = auctions?.filter(a => a.status === 'ended').length || 0

    // Get total bidders
    const { count: totalBidders, error: biddersError } = await supabaseAdmin
      .from('bidders')
      .select('id', { count: 'exact', head: true })

    if (biddersError) throw biddersError

    // Get total bids
    const { count: totalBids, error: bidsError } = await supabaseAdmin
      .from('bids')
      .select('id', { count: 'exact', head: true })

    if (bidsError) throw bidsError

    // Get recent winners (from ended auctions)
    const { count: recentWinners, error: winnersError } = await supabaseAdmin
      .from('winners')
      .select('id', { count: 'exact', head: true })

    if (winnersError) throw winnersError

    return NextResponse.json({
      success: true,
      stats: {
        totalAuctions,
        liveAuctions,
        draftAuctions,
        endedAuctions,
        totalBidders: totalBidders || 0,
        totalBids: totalBids || 0,
        recentWinners: recentWinners || 0
      }
    })
  } catch (error: any) {
    console.error('Dashboard API error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to fetch dashboard stats',
        message: error.message 
      },
      { status: 500 }
    )
  }
}
