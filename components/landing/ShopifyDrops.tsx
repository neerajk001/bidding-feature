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
    <section className="py-24 bg-cream" id="shopify-drops">
      <div className="container mx-auto px-4">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-8 mb-12">
          <div className="flex flex-col gap-2">
            <span className="uppercase tracking-widest text-xs font-semibold text-secondary font-display">Shopify Drops</span>
            <h2 className="text-4xl font-bold font-display text-text-primary">New drops to check out and buy.</h2>
            <p className="text-text-secondary max-w-lg leading-relaxed">
              Limited-run collections curated for direct purchase while the auction house prepares the next lot.
            </p>
          </div>
          <a href={shopifyStoreUrl} className="inline-flex items-center justify-center px-6 py-3 rounded-full font-semibold text-sm transition-colors bg-secondary text-text hover:bg-secondary/80 shadow-md hover:shadow-lg hover:-translate-y-0.5" {...shopifyLinkProps}>
            Check it out and buy
          </a>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-8">
          {shopifyDrops.length > 0 ? (
            shopifyDrops.map((drop) => (
              <div className="bg-white border border-secondary/20 rounded-2xl p-4 flex flex-col transition-all hover:-translate-y-1 hover:shadow-xl hover:border-primary group" key={drop.id}>
                {drop.image_url && (
                  <div className="w-full h-[380px] rounded-xl overflow-hidden mb-4 relative bg-zinc-50">
                    <img
                      src={drop.image_url}
                      alt={drop.title}
                      className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                )}
                <div className="flex justify-between items-center mb-2">
                  <span className="px-3 py-1 rounded-full text-[0.7rem] font-medium bg-gray-100 text-gray-600">Shopify drop</span>
                  <span className="font-bold text-gray-900">{drop.price}</span>
                </div>
                <h3 className="text-lg font-display text-gray-900 mb-1">{drop.title}</h3>
                <p className="text-sm text-stone-600 mb-4 line-clamp-2 leading-relaxed">{drop.description}</p>
                <a href={drop.link_url} className="mt-auto self-start text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary/80 font-display" target="_blank" rel="noreferrer">
                  Check it out and buy
                </a>
              </div>
            ))
          ) : (
            <div className="col-span-full text-center py-12 text-gray-500">
              <p>No drops available at the moment. Check back soon!</p>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
