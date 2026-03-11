import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const supabase = createClient(
    'https://cdngdscyhbwnukeducqo.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkbmdkc2N5aGJ3bnVrZWR1Y3FvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI4NTExMCwiZXhwIjoyMDg1ODYxMTEwfQ.p4yneq1sNKS8X1kLAX5Ro9NN4VlqEek1_X9pOIgQqqs'
)

async function run() {
    const { data: auction } = await supabase.from('auctions').select('id').limit(1).single()
    const { data: bidder } = await supabase.from('bidders').select('id').limit(1).single()

    const fakeAuctionId = auction.id
    const fakeBidderId = bidder.id

    const id1 = '00000000-0000-0000-0000-000000000001'
    const id2 = '00000000-0000-0000-0000-000000000002'

    // Insert first winner (Size S)
    const { data: d1, error: e1 } = await supabase.from('winners').insert({
        id: id1,
        auction_id: fakeAuctionId,
        bidder_id: fakeBidderId,
        winning_amount: 100,
        size: 'S'
    })

    // Insert second winner (Same auction, Size M)
    const { data: d2, error: e2 } = await supabase.from('winners').insert({
        id: id2,
        auction_id: fakeAuctionId,
        bidder_id: fakeBidderId,
        winning_amount: 150,
        size: 'M'
    })

    fs.writeFileSync('out.json', JSON.stringify({
        e1: e1?.message || 'Success',
        e2: e2?.message || 'Success',
        details1: e1?.details,
        details2: e2?.details,
        code1: e1?.code,
        code2: e2?.code
    }))

    // Cleanup
    await supabase.from('winners').delete().eq('id', id1)
    await supabase.from('winners').delete().eq('id', id2)
}
run()
