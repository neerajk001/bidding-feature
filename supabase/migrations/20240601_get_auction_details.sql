
-- Function to get auction details and lazily finalize if needed
CREATE OR REPLACE FUNCTION get_auction_details(p_auction_id UUID)
RETURNS JSON AS $$
DECLARE
  v_auction_id UUID;
  v_title TEXT;
  v_status TEXT;
  v_reg_end TIMESTAMPTZ;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_min_inc NUMERIC;
  v_base_price NUMERIC;
  v_banner TEXT;
  v_reel TEXT;
  v_gallery TEXT[];
  v_sizes TEXT[];
  v_product_id TEXT;
  
  v_current_bid NUMERIC;
  v_bid_size TEXT;
  v_bidder_id UUID;
  v_bidder_name TEXT;
  
  v_total_bids BIGINT;
  
  v_winner_amount NUMERIC;
  v_winner_declared TIMESTAMPTZ;
  v_winner_name TEXT;
  
  v_now TIMESTAMPTZ := now();
BEGIN
  -- 1. Get Auction Data
  SELECT id, title, status, registration_end_time, bidding_start_time, bidding_end_time, 
         min_increment, base_price, banner_image, reel_url, gallery_images, available_sizes, product_id
  INTO v_auction_id, v_title, v_status, v_reg_end, v_start_time, v_end_time, 
       v_min_inc, v_base_price, v_banner, v_reel, v_gallery, v_sizes, v_product_id
  FROM auctions 
  WHERE id = p_auction_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Auction not found');
  END IF;

  -- 2. Lazy Finalization Check
  IF v_status = 'live' AND v_end_time < v_now THEN
    -- Find highest bid
    SELECT amount, bidder_id
    INTO v_winner_amount, v_bidder_id
    FROM bids 
    WHERE auction_id = p_auction_id 
    ORDER BY amount DESC, created_at DESC 
    LIMIT 1;

    IF v_winner_amount IS NOT NULL THEN
      -- Insert winner
      INSERT INTO winners (auction_id, bidder_id, winning_amount, declared_at)
      VALUES (p_auction_id, v_bidder_id, v_winner_amount, v_now)
      ON CONFLICT (auction_id) DO NOTHING;
    END IF;

    -- Update status
    UPDATE auctions SET status = 'ended' WHERE id = p_auction_id;
    v_status := 'ended';
  END IF;

  -- 3. Get Highest Bid stats
  SELECT amount, size, bidder_id 
  INTO v_current_bid, v_bid_size, v_bidder_id
  FROM bids 
  WHERE auction_id = p_auction_id 
  ORDER BY amount DESC, created_at DESC 
  LIMIT 1;
  
  IF v_bidder_id IS NOT NULL THEN
      SELECT name INTO v_bidder_name FROM bidders WHERE id = v_bidder_id;
  END IF;

  -- 4. Get Total Bids
  SELECT count(*) INTO v_total_bids FROM bids WHERE auction_id = p_auction_id;

  -- 5. Get Winner Info (if ended)
  IF v_status = 'ended' THEN
      -- Try to fetch from winners table
      SELECT w.winning_amount, w.declared_at, b.name
      INTO v_winner_amount, v_winner_declared, v_winner_name
      FROM winners w
      LEFT JOIN bidders b ON w.bidder_id = b.id
      WHERE w.auction_id = p_auction_id;
  END IF;

  -- 6. Build Response JSON
  RETURN json_build_object(
    'id', v_auction_id,
    'title', v_title,
    'product_id', v_product_id,
    'status', v_status,
    'registration_end_time', v_reg_end,
    'bidding_start_time', v_start_time,
    'bidding_end_time', v_end_time,
    'banner_image', v_banner,
    'gallery_images', v_gallery,
    'reel_url', v_reel,
    'min_increment', v_min_inc,
    'base_price', v_base_price,
    'available_sizes', v_sizes,
    'current_highest_bid', COALESCE(v_winner_amount, v_current_bid, 0),
    'highest_bidder_name', COALESCE(v_winner_name, v_bidder_name),
    'highest_bid_size', v_bid_size, -- Note: winners table doesn't store size, assuming highest bid size is the winner's size
    'total_bids', v_total_bids,
    'winner_name', v_winner_name,
    'winning_amount', v_winner_amount,
    'winner_declared_at', v_winner_declared
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$ LANGUAGE plpgsql;
