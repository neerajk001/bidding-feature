// Basic Realtime Subscription Example
// Add this to any React component

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'

function MyComponent({ auctionId }: { auctionId: number }) {
  
  useEffect(() => {
    // Subscribe to new bids for specific auction
    const channel = supabase
      .channel(`auction-${auctionId}-bids`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',              // Listen for new inserts only
          schema: 'public',
          table: 'bids',
          filter: `auction_id=eq.${auctionId}`  // Filter by auction_id
        },
        (payload) => {
          console.log('New bid received:', payload.new)
          
          // payload.new contains the new bid data:
          // { id, auction_id, bidder_id, amount, created_at }
          
          // Update your UI here:
          // - Show notification
          // - Update highest bid display
          // - Add to bid history list
        }
      )
      .subscribe()

    // Cleanup: Unsubscribe when component unmounts
    return () => {
      supabase.removeChannel(channel)
    }
  }, [auctionId])

  return <div>Your UI here</div>
}

// ============================================
// ADVANCED: Subscribe to multiple events
// ============================================

function AdvancedExample({ auctionId }: { auctionId: number }) {
  
  useEffect(() => {
    const channel = supabase
      .channel(`auction-${auctionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bids',
          filter: `auction_id=eq.${auctionId}`
        },
        (payload) => {
          console.log('New bid:', payload.new)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'auctions',
          filter: `id=eq.${auctionId}`
        },
        (payload) => {
          console.log('Auction updated:', payload.new)
          // Handle auction status changes (e.g., ended)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [auctionId])

  return <div>Your UI here</div>
}

export default MyComponent
