-- ================================================
-- AUCTION SYSTEM - INITIAL DATABASE SETUP
-- Run this in Supabase SQL Editor
-- ================================================

-- 1. Create a unified users table
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Ensure bidders table has user_id column
ALTER TABLE bidders 
ADD COLUMN IF NOT EXISTS user_id UUID;

-- 3. Set up all foreign key constraints
ALTER TABLE bidders 
ADD CONSTRAINT IF NOT EXISTS fk_bidders_auction 
FOREIGN KEY (auction_id) 
REFERENCES auctions(id) 
ON DELETE CASCADE;

ALTER TABLE bidders 
ADD CONSTRAINT IF NOT EXISTS fk_bidders_user 
FOREIGN KEY (user_id) 
REFERENCES users(id) 
ON DELETE SET NULL;

ALTER TABLE bids 
ADD CONSTRAINT IF NOT EXISTS fk_bids_auction 
FOREIGN KEY (auction_id) 
REFERENCES auctions(id) 
ON DELETE CASCADE;

ALTER TABLE bids 
ADD CONSTRAINT IF NOT EXISTS fk_bids_bidder 
FOREIGN KEY (bidder_id) 
REFERENCES bidders(id) 
ON DELETE CASCADE;

-- 4. Create winners table if not exists
CREATE TABLE IF NOT EXISTS winners (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  bidder_id UUID NOT NULL REFERENCES bidders(id) ON DELETE CASCADE,
  winning_amount NUMERIC NOT NULL CHECK (winning_amount > 0),
  declared_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(auction_id)
);

-- 5. Create all performance indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_bidders_auction_id ON bidders(auction_id);
CREATE INDEX IF NOT EXISTS idx_bidders_user_id ON bidders(user_id);
CREATE INDEX IF NOT EXISTS idx_bidders_email ON bidders(email);
CREATE INDEX IF NOT EXISTS idx_bids_auction_id ON bids(auction_id);
CREATE INDEX IF NOT EXISTS idx_bids_bidder_id ON bids(bidder_id);
CREATE INDEX IF NOT EXISTS idx_bids_amount ON bids(amount DESC);
CREATE INDEX IF NOT EXISTS idx_winners_auction_id ON winners(auction_id);
CREATE INDEX IF NOT EXISTS idx_winners_bidder_id ON winners(bidder_id);

-- 6. Add data validation constraints
ALTER TABLE bids 
ADD CONSTRAINT IF NOT EXISTS check_bids_amount_positive 
CHECK (amount > 0);

ALTER TABLE auctions 
ADD CONSTRAINT IF NOT EXISTS check_auctions_status_valid 
CHECK (status IN ('draft', 'live', 'ended'));

-- 7. Ensure unique bidder per auction
CREATE UNIQUE INDEX IF NOT EXISTS idx_bidders_unique_per_auction 
ON bidders(auction_id, email);

