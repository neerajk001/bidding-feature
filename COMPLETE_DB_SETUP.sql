-- ================================================
-- COMPLETE DATABASE SETUP FOR AUCTION SYSTEM
-- Run this in Supabase SQL Editor
-- ================================================

-- ============================================
-- 1. DROP EXISTING CONSTRAINTS (if any exist)
-- ============================================
-- This prevents errors if constraints already exist

ALTER TABLE IF EXISTS bidders DROP CONSTRAINT IF EXISTS fk_bidders_auction;
ALTER TABLE IF EXISTS bidders DROP CONSTRAINT IF EXISTS fk_bidders_user;
ALTER TABLE IF EXISTS bids DROP CONSTRAINT IF EXISTS fk_bids_auction;
ALTER TABLE IF EXISTS bids DROP CONSTRAINT IF EXISTS fk_bids_bidder;
ALTER TABLE IF EXISTS winners DROP CONSTRAINT IF EXISTS fk_winners_auction;
ALTER TABLE IF EXISTS winners DROP CONSTRAINT IF EXISTS fk_winners_bidder;

-- ============================================
-- 2. ADD FOREIGN KEY CONSTRAINTS
-- ============================================

-- Bidders table foreign keys
ALTER TABLE bidders 
ADD CONSTRAINT fk_bidders_auction 
FOREIGN KEY (auction_id) 
REFERENCES auctions(id) 
ON DELETE CASCADE;

ALTER TABLE bidders 
ADD CONSTRAINT fk_bidders_user 
FOREIGN KEY (user_id) 
REFERENCES users(id) 
ON DELETE SET NULL;

-- Bids table foreign keys
ALTER TABLE bids 
ADD CONSTRAINT fk_bids_auction 
FOREIGN KEY (auction_id) 
REFERENCES auctions(id) 
ON DELETE CASCADE;

ALTER TABLE bids 
ADD CONSTRAINT fk_bids_bidder 
FOREIGN KEY (bidder_id) 
REFERENCES bidders(id) 
ON DELETE CASCADE;

-- Winners table foreign keys
ALTER TABLE winners 
ADD CONSTRAINT fk_winners_auction 
FOREIGN KEY (auction_id) 
REFERENCES auctions(id) 
ON DELETE CASCADE;

ALTER TABLE winners 
ADD CONSTRAINT fk_winners_bidder 
FOREIGN KEY (bidder_id) 
REFERENCES bidders(id) 
ON DELETE CASCADE;

-- ============================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- ============================================

-- Auctions indexes
CREATE INDEX IF NOT EXISTS idx_auctions_product_id ON auctions(product_id);
CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);
CREATE INDEX IF NOT EXISTS idx_auctions_bidding_end_time ON auctions(bidding_end_time);

-- Bidders indexes
CREATE INDEX IF NOT EXISTS idx_bidders_auction_id ON bidders(auction_id);
CREATE INDEX IF NOT EXISTS idx_bidders_user_id ON bidders(user_id);
CREATE INDEX IF NOT EXISTS idx_bidders_email ON bidders(email);
CREATE INDEX IF NOT EXISTS idx_bidders_phone ON bidders(phone);

-- Users indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

-- Bids indexes
CREATE INDEX IF NOT EXISTS idx_bids_auction_id ON bids(auction_id);
CREATE INDEX IF NOT EXISTS idx_bids_bidder_id ON bids(bidder_id);
CREATE INDEX IF NOT EXISTS idx_bids_amount ON bids(amount DESC);
CREATE INDEX IF NOT EXISTS idx_bids_created_at ON bids(created_at DESC);

-- Winners indexes
CREATE INDEX IF NOT EXISTS idx_winners_auction_id ON winners(auction_id);
CREATE INDEX IF NOT EXISTS idx_winners_bidder_id ON winners(bidder_id);

-- ============================================
-- 4. ADD UNIQUE CONSTRAINTS
-- ============================================

-- Ensure one winner per auction
CREATE UNIQUE INDEX IF NOT EXISTS idx_winners_unique_auction 
ON winners(auction_id);

-- Ensure bidder registers only once per auction
CREATE UNIQUE INDEX IF NOT EXISTS idx_bidders_unique_per_auction 
ON bidders(auction_id, email);

-- ============================================
-- 5. ADD CHECK CONSTRAINTS FOR DATA VALIDATION
-- ============================================

-- Ensure positive bid amounts
ALTER TABLE bids 
DROP CONSTRAINT IF EXISTS check_bids_amount_positive;

ALTER TABLE bids 
ADD CONSTRAINT check_bids_amount_positive 
CHECK (amount > 0);

-- Ensure positive winning amounts
ALTER TABLE winners 
DROP CONSTRAINT IF EXISTS check_winners_amount_positive;

ALTER TABLE winners 
ADD CONSTRAINT check_winners_amount_positive 
CHECK (winning_amount > 0);

-- Ensure positive min_increment in auctions
ALTER TABLE auctions 
DROP CONSTRAINT IF EXISTS check_auctions_min_increment_positive;

ALTER TABLE auctions 
ADD CONSTRAINT check_auctions_min_increment_positive 
CHECK (min_increment > 0);

-- Ensure positive base_price when set in auctions
ALTER TABLE auctions 
DROP CONSTRAINT IF EXISTS check_auctions_base_price_positive;

ALTER TABLE auctions 
ADD CONSTRAINT check_auctions_base_price_positive 
CHECK (base_price IS NULL OR base_price > 0);

-- Ensure valid auction status
ALTER TABLE auctions 
DROP CONSTRAINT IF EXISTS check_auctions_status_valid;

ALTER TABLE auctions 
ADD CONSTRAINT check_auctions_status_valid 
CHECK (status IN ('draft', 'live', 'ended'));

-- ============================================
-- 6. ENABLE ROW LEVEL SECURITY (Optional)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bidders ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE winners ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access (modify as needed)
DROP POLICY IF EXISTS "Allow public read access to live auctions" ON auctions;
CREATE POLICY "Allow public read access to live auctions" 
ON auctions FOR SELECT 
USING (status = 'live');

DROP POLICY IF EXISTS "Allow service role full access to auctions" ON auctions;
CREATE POLICY "Allow service role full access to auctions" 
ON auctions 
USING (true) 
WITH CHECK (true);

-- Add similar policies for other tables as needed
DROP POLICY IF EXISTS "Allow service role full access to bidders" ON bidders;
CREATE POLICY "Allow service role full access to bidders" 
ON bidders 
USING (true) 
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role full access to bids" ON bids;
CREATE POLICY "Allow service role full access to bids" 
ON bids 
USING (true) 
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role full access to users" ON users;
CREATE POLICY "Allow service role full access to users" 
ON users 
USING (true) 
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role full access to winners" ON winners;
CREATE POLICY "Allow service role full access to winners" 
ON winners 
USING (true) 
WITH CHECK (true);

-- ============================================
-- 7. VERIFY SETUP
-- ============================================

-- Check all foreign keys
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
AND tc.table_name IN ('auctions', 'bidders', 'bids', 'users', 'winners')
ORDER BY tc.table_name;

-- Check all indexes
SELECT 
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename IN ('auctions', 'bidders', 'bids', 'users', 'winners')
ORDER BY tablename, indexname;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Database setup complete!';
    RAISE NOTICE '✅ Foreign keys created';
    RAISE NOTICE '✅ Indexes created';
    RAISE NOTICE '✅ Constraints added';
    RAISE NOTICE '✅ RLS enabled';
END $$;
