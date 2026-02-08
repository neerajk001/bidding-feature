-- Run this in Supabase SQL Editor to set up proper foreign key relationships

-- 1. Add foreign key from bids.bidder_id to bidders.id (if not exists)
ALTER TABLE bids 
ADD CONSTRAINT fk_bids_bidder 
FOREIGN KEY (bidder_id) 
REFERENCES bidders(id) 
ON DELETE CASCADE;

-- 2. Add foreign key from bids.auction_id to auctions.id (if not exists)
ALTER TABLE bids 
ADD CONSTRAINT fk_bids_auction 
FOREIGN KEY (auction_id) 
REFERENCES auctions(id) 
ON DELETE CASCADE;

-- 3. Add foreign key from bidders.auction_id to auctions.id (if not exists)
ALTER TABLE bidders 
ADD CONSTRAINT fk_bidders_auction 
FOREIGN KEY (auction_id) 
REFERENCES auctions(id) 
ON DELETE CASCADE;

-- 4. (Optional) Add foreign key from bidders.user_id to users.id if users table exists
-- Uncomment if you want this:
-- ALTER TABLE bidders 
-- ADD CONSTRAINT fk_bidders_user 
-- FOREIGN KEY (user_id) 
-- REFERENCES users(id) 
-- ON DELETE SET NULL;

-- 5. Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_bids_bidder_id ON bids(bidder_id);
CREATE INDEX IF NOT EXISTS idx_bids_auction_id ON bids(auction_id);
CREATE INDEX IF NOT EXISTS idx_bidders_auction_id ON bidders(auction_id);
CREATE INDEX IF NOT EXISTS idx_bidders_user_id ON bidders(user_id);

-- Verify the foreign keys were created
SELECT 
    tc.table_name, 
    tc.constraint_name, 
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
AND tc.table_name IN ('bids', 'bidders');
