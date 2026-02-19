
import PublicShell from '@/components/public/PublicShell'
import LandingHero from '@/components/landing/LandingHero'
import AuctionGrid from '@/components/landing/AuctionGrid'
import ShopifyDrops from '@/components/landing/ShopifyDrops'
import { getAuctions, getActiveAuctionState, getAuctionDetail } from '@/lib/auctions/queries'
import { supabaseAdmin } from '@/lib/supabase/admin'

// Disable caching for real-time auction updates
export const dynamic = 'force-dynamic'
export const revalidate = 0

const shopifyStoreUrl = process.env.NEXT_PUBLIC_SHOPIFY_STORE_URL || 'https://induheritage.com'
const shopifyLinkProps = shopifyStoreUrl.startsWith('http')
  ? { target: '_blank', rel: 'noreferrer' }
  : {}

const heritagePillars = [
  {
    title: 'Verified Provenance',
    description: 'Every lot is authenticated and documented before bidding opens.',
  },
  {
    title: 'Concierge Support',
    description: 'Personal bidding guidance, sizing help, and styling notes.',
  },
  {
    title: 'White-Glove Delivery',
    description: 'Premium packaging with insured, trackable delivery across India.',
  },
] as const

async function getShopifyDrops() {
  try {
    const { data: drops, error } = await supabaseAdmin
      .from('shopify_drops')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) {
      console.error('Error fetching shopify drops:', error)
      return []
    }

    return drops || []
  } catch (error) {
    console.error('Error fetching shopify drops:', error)
    return []
  }
}

export default async function HomePage() {
  const [activeState, allAuctionsRaw, shopifyDrops] = await Promise.all([
    getActiveAuctionState(),
    getAuctions(true),
    getShopifyDrops()
  ])

  // Ensure allAuctions is an array
  const allAuctions = Array.isArray(allAuctionsRaw) ? allAuctionsRaw : []

  console.log('Homepage Debug:', {
    activeState,
    allAuctionsCount: allAuctions.length,
    statuses: allAuctions.map((a: any) => ({ io: a.id, st: a.status, end: a.bidding_end_time })),
    dropsCount: shopifyDrops?.length
  })

  // Determine what to show in Hero
  // Priority: 
  // 1. Live Auction (activeState.exists && phase='live')
  // 2. Registration Auction (activeState.exists && phase='registration')
  // 3. Upcoming Auction (status='upcoming' or 'draft' but usually filtered out)
  // 4. Recently Ended Auction

  let displayActiveDetail = null
  let displayActivePhase = null
  let displayEndedDetail = null
  let displayNextUpcoming = null

  if (activeState && (activeState as any).exists && (activeState as any).auction_id) {
    const detail = await getAuctionDetail((activeState as any).auction_id)
    if (detail) {
      displayActiveDetail = detail
      displayActivePhase = activeState
    }
  }

  // If no active auction (Live or Registration), look for next upcoming
  if (!displayActiveDetail) {
    const upcoming = allAuctions.find((a: any) =>
      a.status === 'upcoming' ||
      (a.status === 'draft' && new Date(a.bidding_start_time) > new Date())
    )
    if (upcoming) {
      displayNextUpcoming = upcoming
      // We pass this as 'activeDetail' to Hero but with 'upcoming' phase implicit?
      // Actually LandingHero props: activeAuction, activeDetail, endedDetail, nextUpcomingAuction
      // It seems 'activeDetail' is for Live/Registration. 
      // 'nextUpcomingAuction' should be passed separately if needed.
    }
  }

  // Calculate most recent ended auction
  const endedAuctions = allAuctions.filter((auction: any) => auction.status === 'ended')
  const getTimeValue = (value?: string | null) => {
    if (!value) return 0
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 0 : date.getTime()
  }

  const recentEndedAuction = endedAuctions
    .slice()
    .sort((a: any, b: any) => getTimeValue(b.bidding_end_time) - getTimeValue(a.bidding_end_time))[0] || null

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

      <ShopifyDrops
        shopifyDrops={shopifyDrops}
        shopifyStoreUrl={shopifyStoreUrl}
        shopifyLinkProps={shopifyLinkProps}
      />

      <section className="py-24 bg-cream border-t border-secondary/20">
        <div className="container mx-auto px-4">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 mb-16">
            <div className="flex flex-col gap-2">
              <span className="uppercase tracking-widest text-xs font-semibold text-secondary font-display">Heritage Promise</span>
              <h2 className="text-4xl lg:text-5xl font-bold font-display text-black max-w-2xl leading-tight">A premium auction house for collectors.</h2>
              <p className="text-lg text-gray-600 max-w-xl leading-relaxed mt-4">
                Our process protects provenance, delivers concierge support, and keeps bidding transparent.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {heritagePillars.map((pillar) => (
              <div className="bg-white border border-secondary/20 rounded-2xl p-8 flex flex-col gap-4 hover:border-primary transition-colors group" key={pillar.title}>
                <h4 className="text-xl font-display font-bold text-black group-hover:text-primary transition-colors">{pillar.title}</h4>
                <p className="text-gray-600 leading-relaxed">{pillar.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
