
import PublicShell from '@/components/public/PublicShell'
import LandingHero from '@/components/landing/LandingHero'
import AuctionGrid from '@/components/landing/AuctionGrid'
import { getAuctions, getActiveAuctionState, getAuctionDetail } from '@/lib/auctions/queries'
import { supabaseAdmin } from '@/lib/supabase/admin'

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

  let activeDetail: any = null
  let activeAuctionPhase: any = null

  // Resolve active auction details
  // Note: getActiveAuctionState returns { exists: boolean, auction_id?: string, phase?: 'live'|'registration', cta?: string }
  // We need to type cast or check properly.
  // The 'queries.ts' I wrote returns object { exists, ... }

  const state = activeState as any

  if (state && state.exists && state.auction_id) {
    const detail = await getAuctionDetail(state.auction_id)
    if (detail) {
      activeDetail = detail
      activeAuctionPhase = state
    }
  }

  // Fallback if no active auction found (e.g. no live/registration phase)
  // We still want to show *something* in the hero, typically the next upcoming auction or just a placeholder.
  // Original logic: "Fallback to first non-ended auction if no active one"
  if (!activeDetail && allAuctions.length > 0) {
    const fallback = allAuctions.find((a: any) => a.status !== 'ended')
    if (fallback) {
      activeDetail = fallback
      // activeAuctionPhase remains null, so hero will show generic "Upcoming" or whatever logic is inside LandingHero
    }
  }

  const endedAuctions = allAuctions.filter((auction: any) => auction.status === 'ended')
  const getTimeValue = (value?: string | null) => {
    if (!value) return 0
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? 0 : date.getTime()
  }
  const recentEndedAuction = endedAuctions
    .slice()
    .sort((a: any, b: any) => getTimeValue(b.bidding_end_time) - getTimeValue(a.bidding_end_time))[0] || null
  const heroEndedAuction = activeDetail ? null : recentEndedAuction

  return (
    <PublicShell>
      <LandingHero
        activeAuction={activeAuctionPhase}
        activeDetail={activeDetail}
        endedDetail={heroEndedAuction}
      />

      <AuctionGrid
        auctions={allAuctions}
        activeDetail={activeDetail}
      />

      <section className="landing-section landing-section-alt" id="shopify-drops">
        <div className="container">
          <div className="landing-section-header">
            <div className="section-heading">
              <span className="eyebrow">Shopify Drops</span>
              <h2 className="landing-section-title">New drops to check out and buy.</h2>
              <p className="landing-section-subtitle">
                Limited-run collections curated for direct purchase while the auction house prepares the next lot.
              </p>
            </div>
            <a href={shopifyStoreUrl} className="btn btn-primary" {...shopifyLinkProps}>
              Check it out and buy
            </a>
          </div>

          <div className="landing-drops-grid">
            {shopifyDrops.length > 0 ? (
              shopifyDrops.map((drop: any) => (
                <div className={`drop-card drop-card-${drop.tone}`} key={drop.id}>
                  {drop.image_url && (
                    <div style={{ marginBottom: '1rem', borderRadius: '12px', overflow: 'hidden', height: '180px', position: 'relative' }}>
                      <img 
                        src={drop.image_url} 
                        alt={drop.title} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                  )}
                  <div className="drop-card-top">
                    <span className="pill pill-neutral">Shopify drop</span>
                    <span className="drop-card-price">{drop.price}</span>
                  </div>
                  <h3>{drop.title}</h3>
                  <p>{drop.description}</p>
                  <a href={drop.link_url} className="drop-card-link" target="_blank" rel="noreferrer">
                    Check it out and buy
                  </a>
                </div>
              ))
            ) : (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: '#6b7280' }}>
                <p>No drops available at the moment. Check back soon!</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="container">
          <div className="landing-section-header">
            <div className="section-heading">
              <span className="eyebrow">Heritage Promise</span>
              <h2 className="landing-section-title">A premium auction house for collectors.</h2>
              <p className="landing-section-subtitle">
                Our process protects provenance, delivers concierge support, and keeps bidding transparent.
              </p>
            </div>
          </div>

          <div className="landing-heritage-grid">
            {heritagePillars.map((pillar) => (
              <div className="heritage-card" key={pillar.title}>
                <h4>{pillar.title}</h4>
                <p>{pillar.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicShell>
  )
}
