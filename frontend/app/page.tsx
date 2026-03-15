import PublicShell from '@/components/public/PublicShell'
import LandingHero from '@/components/landing/LandingHero'
import AuctionGrid from '@/components/landing/AuctionGrid'

// Disable caching for real-time auction updates
export const dynamic = 'force-dynamic'
export const revalidate = 0

/** Auction shape returned by GET /api/auctions */
interface ApiAuction {
  id: string
  status: string
  bidding_start_time: string
  bidding_end_time: string
  title?: string
  product_id?: string
  banner_image?: string | null
  min_increment?: number
  base_price?: number | null
  current_highest_bid?: number | null
  highest_bidder_name?: string | null
  total_bids?: number
}

async function fetchAuctionsFromApi(): Promise<ApiAuction[]> {
  const base =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '')
  if (!base) {
    console.warn('HomePage: BACKEND_URL / NEXT_PUBLIC_API_URL not set, auctions will be empty')
    return []
  }
  const url = `${base.replace(/\/$/, '')}/api/auctions?includeEnded=true`
  try {
    const res = await fetch(url, { cache: 'no-store' })
    const data = (await res.json()) as { auctions?: ApiAuction[] }
    if (!res.ok) return []
    return Array.isArray(data?.auctions) ? data.auctions : []
  } catch (err) {
    console.error('HomePage: failed to fetch auctions from API', err)
    return []
  }
}

export default async function HomePage() {
  const allAuctionsRaw = await fetchAuctionsFromApi()

  // Ensure allAuctions is an array
  const allAuctions = Array.isArray(allAuctionsRaw) ? allAuctionsRaw : []

  console.log('Homepage Debug:', {
    allAuctionsCount: allAuctions.length,
    statuses: allAuctions.map((a: { id: string; status: string; bidding_end_time: string }) => ({ io: a.id, st: a.status, end: a.bidding_end_time }))
  })

  // Determine what to show in Hero
  let displayActiveDetail = null
  let displayActivePhase = null
  let displayEndedDetail = null
  let displayNextUpcoming = null

  // 1. Find a Live Auction (Status='live')
  // We prefer one that is currently in bidding window, but if not, logic handles it.
  const liveAuction = allAuctions.find((a: { status: string }) => a.status === 'live')

  if (liveAuction) {
    displayActiveDetail = liveAuction

    // Determine phase
    const now = new Date().toISOString()
    const isRegistration = now < liveAuction.bidding_start_time

    displayActivePhase = {
      exists: true,
      auction_id: liveAuction.id,
      phase: (isRegistration ? 'registration' : 'live') as 'registration' | 'live',
      cta: isRegistration ? 'Register Now' : 'Place Bid'
    }
  }

  // 2. Fallback: If no Live auction, look for Upcoming (Drafts/Upcoming)
  // (In our system status='live' handles active. Upcoming usually means future live).
  // If we found a live auction, we don't look for upcoming as primary.
  if (!displayActiveDetail) {
    const upcoming = allAuctions.find((a: { status: string; bidding_start_time: string }) =>
      a.status === 'upcoming' ||
      (a.status === 'draft' && new Date(a.bidding_start_time) > new Date())
    )
    if (upcoming) {
      displayNextUpcoming = upcoming
    }
  }

  // 3. Recently Ended
  // We calculate this always to pass as backup or if needed
  const endedAuctions = allAuctions.filter((auction: { status: string }) => auction.status === 'ended')
  const getTimeValue = (value?: string | null) => {
    if (!value) return 0
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 0 : date.getTime()
  }

  const recentEndedAuction = endedAuctions
    .slice()
    .sort((a: { bidding_end_time?: string | null }, b: { bidding_end_time?: string | null }) => getTimeValue(b.bidding_end_time) - getTimeValue(a.bidding_end_time))[0] || null

  // If no active auction, we show the ended auction
  if (!displayActiveDetail && !displayNextUpcoming) {
    displayEndedDetail = recentEndedAuction
  }

  return (
    <PublicShell>
      <LandingHero
        activeAuction={displayActivePhase}
        activeDetail={displayActiveDetail}
        endedDetail={displayEndedDetail}
        nextUpcomingAuction={displayNextUpcoming}
      />

      <AuctionGrid
        auctions={allAuctions}
        activeDetail={displayActiveDetail}
      />

      <div className="lg:hidden px-4 pb-8">
        <a
          href="#auction-calendar"
          className="inline-flex w-full items-center justify-center px-4 py-3 border-2 border-gray-200 rounded-lg text-sm font-semibold text-gray-800 bg-white hover:bg-gray-50 transition-colors"
        >
          Explore all auctions
        </a>
      </div>

      <section id="auction-rules" className="py-12 lg:py-24 bg-cream border-t border-secondary/20 scroll-mt-24">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            <span className="uppercase tracking-widest text-xs font-semibold text-secondary font-display">Guidelines</span>
            <h2 className="text-3xl lg:text-5xl font-bold font-display text-black mt-2 mb-6 lg:mb-8 leading-tight">Auction Rules</h2>
            <div className="prose prose-lg text-gray-700 font-body space-y-6">
              <p className="leading-relaxed">
                Please read and follow these rules when participating in our exclusive heritage auctions.
              </p>
              <ol className="list-decimal list-inside space-y-4 pl-2">
                <li><strong>Registration:</strong> You must register before the registration window closes to participate in bidding. Only registered bidders can place bids once the auction goes live.</li>
                <li><strong>Bidding window:</strong> Bidding is open only during the published start and end times. Bids placed outside this window are not accepted.</li>
                <li><strong>Minimum increment:</strong> Each new bid must meet or exceed the current highest bid plus the minimum increment stated for that auction.</li>
                <li><strong>Binding bids:</strong> All bids are final and binding. By placing a bid, you agree to purchase the lot at your bid amount if you win.</li>
                <li><strong>Winners:</strong> The highest bidder at the close of the auction wins the lot. In multi-size lots, each size has a separate winner.</li>
                <li><strong>Payment deadline:</strong> Payment must be completed within 12 hours of winning, or the bid will be cancelled.</li>
                <li><strong>Payment methods:</strong> UPI: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm">9096068280-2@ybl</code>. GPay: Scanner will be provided at the time of payment. The winner must share details of payment completed (e.g. UTR or screenshot).</li>
                <li><strong>Non-payment:</strong> If payment is not done within the 12-hour window, the product will be offered to the second-highest bidder.</li>
                <li><strong>No cancellation:</strong> Once a bid is placed, it cannot be cancelled, returned, or exchanged.</li>
                <li><strong>Shipping:</strong> Shipping charges are included. The product will be dispatched within 2–3 working days. Pan-India shipping is available.</li>
                <li><strong>Winner announcement:</strong> The winner’s Instagram ID will be announced on LIVE. A screenshot will be taken for record.</li>
              </ol>
              <p className="text-gray-600 text-sm mt-8">
                By participating, you agree to these rules and our general terms. Contact us for any clarifications before bidding.
              </p>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
