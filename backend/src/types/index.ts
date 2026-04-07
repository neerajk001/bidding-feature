export interface FinalizeResult {
  endedAuctionIds: string[]
  errors: string[]
} // this are the types

export interface SendWinnerEmailParams {
  to: string
  winnerName: string
  auctionTitle: string
  winningAmount: number
  claimToken: string
  size?: string | null
  isEscalation?: boolean
}

export interface PaymentResult {
  ok: boolean
  error?: string
}
