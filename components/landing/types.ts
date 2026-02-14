export interface AuctionSummary {
    id: string
    title: string
    product_id: string
    status: string
    registration_end_time: string
    bidding_start_time: string
    bidding_end_time: string
    min_increment: number
    banner_image?: string | null
    current_highest_bid?: number | null
    total_bids?: number | null
    highest_bidder_name?: string | null
    winner_name?: string | null
    winning_amount?: number | null
    winner_declared_at?: string | null
}

export interface ActiveAuctionResponse {
    exists: boolean
    auction_id?: string
    phase?: 'registration' | 'live'
    cta?: string
}
