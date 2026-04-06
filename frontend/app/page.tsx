import PublicShell from '@/components/public/PublicShell'
import LandingHero from '@/components/landing/LandingHero'
import AuctionGrid from '@/components/landing/AuctionGrid'
import type { AuctionSummary } from '@/components/landing/types'

// Keep homepage data fresh without forcing every request to bypass cache.
export const revalidate = 20

function parseTimestamp(value?: string | null): number {
  if (!value) return Number.NaN
  const ts = new Date(value).getTime()
  return Number.isNaN(ts) ? Number.NaN : ts
}

function getStartTimestamp(auction: AuctionSummary): number {
  return parseTimestamp(auction.bidding_start_time)
}

function isLiveByTime(auction: AuctionSummary, nowTs: number): boolean {
  const startTs = parseTimestamp(auction.bidding_start_time)
  const endTs = parseTimestamp(auction.bidding_end_time)
  if (Number.isNaN(startTs) || Number.isNaN(endTs)) return false
  return nowTs >= startTs && nowTs <= endTs
}

async function fetchAuctionsFromApi(): Promise<AuctionSummary[]> {
  const base =
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '')
  if (!base) {
    console.warn('HomePage: BACKEND_URL / NEXT_PUBLIC_API_URL not set, auctions will be empty')
    return []
  }
  const url = `${base.replace(/\/$/, '')}/api/auctions?includeEnded=true&view=home&limit=20`
  try {
    const res = await fetch(url, { next: { revalidate: 20 } })
    const data = (await res.json()) as { auctions?: AuctionSummary[] }
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

  const nowTs = Date.now()

  const sortedNonEnded = allAuctions
    .filter((auction: AuctionSummary) => auction.status !== 'ended')
    .slice()
    .sort((a: AuctionSummary, b: AuctionSummary) => {
      const aStart = getStartTimestamp(a)
      const bStart = getStartTimestamp(b)
      if (Number.isNaN(aStart) && Number.isNaN(bStart)) return 0
      if (Number.isNaN(aStart)) return 1
      if (Number.isNaN(bStart)) return -1
      return aStart - bStart
    })

  // 1. Prefer auctions that are actually live by clock window.
  const liveAuction = sortedNonEnded.find((auction: AuctionSummary) => isLiveByTime(auction, nowTs)) || null

  if (liveAuction) {
    displayActiveDetail = liveAuction
    displayActivePhase = {
      exists: true,
      auction_id: liveAuction.id,
      phase: 'live' as const,
      cta: 'Place Bid'
    }
  }

  // 2. Fallback to nearest future auction by start time.
  if (!displayActiveDetail) {
    const upcoming = sortedNonEnded.find((auction: AuctionSummary) => {
      const startTs = parseTimestamp(auction.bidding_start_time)
      return !Number.isNaN(startTs) && startTs > nowTs
    })

    if (upcoming) {
      displayActiveDetail = upcoming

      const registrationEndTs = parseTimestamp(upcoming.registration_end_time)
      const isRegistrationOpen = !Number.isNaN(registrationEndTs) && nowTs < registrationEndTs
      if (isRegistrationOpen) {
        displayActivePhase = {
          exists: true,
          auction_id: upcoming.id,
          phase: 'registration' as const,
          cta: 'Register Now'
        }
      }

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
                <li><strong>Registration:</strong> You must register before the registration window closes. Only registered bidders can place bids.</li>
                <li><strong>Verification:</strong> Registration is allowed only after account verification as required by the platform.</li>
                <li><strong>Bidding window:</strong> Bids are accepted only between the published bidding start and end time.</li>
                <li><strong>Minimum increment:</strong> Every new bid must be at least the current highest bid plus the configured minimum increment.</li>
                <li><strong>Size-based lots:</strong> For auctions with sizes, winners are determined separately by size.</li>
                <li><strong>Binding bids:</strong> All bids are final and legally binding. Do not bid unless you intend to complete payment if you win.</li>
                <li><strong>Winner payment:</strong> Winners receive a secure payment link and must complete payment within 12 hours.</li>
                <li><strong>Payment method:</strong> Winner payments are processed through Razorpay checkout. Manual transfer proof is not required for successful online payments.</li>
                <li><strong>Non-payment:</strong> If payment is not completed within the allowed window, the win is forfeited and the lot may be offered to the next eligible bidder.</li>
                <li><strong>Shipping and fulfillment:</strong> Shipping is included where stated, and dispatch is typically within 2-3 working days after payment confirmation.</li>
                <li><strong>No cancellation:</strong> Bids and completed purchases cannot be cancelled, returned, or exchanged unless required by applicable law.</li>
              </ol>
              <p className="text-gray-600 text-sm mt-8">
                By participating, you agree to these auction rules and platform terms. Contact support before bidding if anything is unclear.
              </p>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  )
}

