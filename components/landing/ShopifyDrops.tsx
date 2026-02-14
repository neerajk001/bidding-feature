'use client'

interface Drop {
    id: string
    title: string
    description: string
    price: string
    image_url: string
    link_url: string
    tone: string
}

interface ShopifyDropsProps {
    shopifyDrops: Drop[]
    shopifyStoreUrl: string
    shopifyLinkProps: { target?: string; rel?: string }
}

export default function ShopifyDrops({ shopifyDrops, shopifyStoreUrl, shopifyLinkProps }: ShopifyDropsProps) {
    return (
        <section className="landing-section landing-section-alt" id="shopify-drops">
            <style jsx global>{`
          .landing-drops-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 1.5rem;
            margin-top: 2rem;
          }

          .drop-card {
            background: #fff;
            border: 1px solid rgba(120, 93, 72, 0.15);
            border-radius: 16px;
            padding: 1rem;
            display: flex;
            flex-direction: column;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
          }

          .drop-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 10px 20px rgba(0,0,0,0.08);
          }

          .drop-card-image {
            width: 100%;
            height: 380px; /* Taller portrait height for fashion items */
            border-radius: 12px;
            overflow: hidden;
            margin-bottom: 1rem;
            position: relative;
            background: #f9f9f9;
          }

          .drop-card-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: top; /* Focus on top of the garment */
            transition: transform 0.5s ease;
          }

          .drop-card:hover .drop-card-image img {
            transform: scale(1.03);
          }

          .drop-card-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 0.5rem;
          }

          .drop-card h3 {
            font-size: 1.1rem;
            font-family: var(--font-display);
            margin-bottom: 0.25rem;
            color: #2a1a12;
          }

          .drop-card p {
            font-size: 0.9rem;
            color: #6b4b3f;
            margin-bottom: 1rem;
            line-height: 1.4;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
          }

          .drop-card-price {
            font-weight: 700;
            color: #2a1a12;
          }

          .drop-card-link {
            margin-top: auto;
            align-self: flex-start;
            font-size: 0.85rem;
            font-weight: 600;
            color: #8b5e3c;
            text-decoration: underline;
            text-underline-offset: 4px;
          }
          
          .drop-card-link:hover {
            color: #6d4c41;
          }
        `}</style>
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
                        shopifyDrops.map((drop) => (
                            <div className={`drop-card drop-card-${drop.tone || 'neutral'}`} key={drop.id}>
                                {drop.image_url && (
                                    <div className="drop-card-image">
                                        <img
                                            src={drop.image_url}
                                            alt={drop.title}
                                        />
                                    </div>
                                )}
                                <div className="drop-card-top">
                                    <span className="pill pill-neutral" style={{ fontSize: '0.7rem', padding: '0.25rem 0.75rem', borderRadius: '999px', background: '#f3f4f6', color: '#4b5563' }}>Shopify drop</span>
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
    )
}
