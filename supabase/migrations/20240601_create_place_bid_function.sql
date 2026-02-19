
-- Function to place a bid safely handling concurrency
CREATE OR REPLACE FUNCTION place_bid(
  p_auction_id UUID,
  p_bidder_id UUID,
  p_amount NUMERIC,
  p_size TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_auction_status TEXT;
  v_current_highest_bid NUMERIC;
  v_min_increment NUMERIC;
  v_base_price NUMERIC;
  v_start_time TIMESTAMPTZ;
  v_end_time TIMESTAMPTZ;
  v_new_end_time TIMESTAMPTZ;
  v_bid_id UUID;
  v_created_at TIMESTAMPTZ;
  v_soft_close_window INTERVAL := '5 minutes';
  v_soft_close_extension INTERVAL := '5 minutes';
BEGIN
  -- 1. Lock the auction row for update to ensure serial processing of bids for this auction
  SELECT status, bidding_start_time, bidding_end_time, min_increment, base_price
  INTO v_auction_status, v_start_time, v_end_time, v_min_increment, v_base_price
  FROM auctions
  WHERE id = p_auction_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Auction not found', 'status', 404);
  END IF;

  -- 2. Validations
  IF v_auction_status <> 'live' THEN
    RETURN json_build_object('error', 'Auction is not live', 'status', 400);
  END IF;

  IF now() < v_start_time THEN
    RETURN json_build_object('error', 'Bidding has not started yet', 'status', 400);
  END IF;

  IF now() > v_end_time THEN
    RETURN json_build_object('error', 'Bidding has ended', 'status', 400);
  END IF;

  -- 3. Get current highest bid
  -- We don't need to lock bids table because the auction row lock serializes all "place_bid" calls
  SELECT COALESCE(MAX(amount), 0)
  INTO v_current_highest_bid
  FROM bids
  WHERE auction_id = p_auction_id;

  -- 4. Check bid amount
  IF v_current_highest_bid = 0 THEN
    -- First bid
    IF p_amount < COALESCE(v_base_price, v_min_increment) THEN
        RETURN json_build_object(
            'error', format('First bid must be at least %s', COALESCE(v_base_price, v_min_increment)), 
            'status', 400
        );
    END IF;
  ELSE
    -- Subsequent bids
    IF p_amount < (v_current_highest_bid + v_min_increment) THEN
        RETURN json_build_object(
            'error', format('Bid must be at least %s', (v_current_highest_bid + v_min_increment)),
            'status', 400
        );
    END IF;
  END IF;

  -- 5. Insert Bid
  INSERT INTO bids (auction_id, bidder_id, amount, size)
  VALUES (p_auction_id, p_bidder_id, p_amount, p_size)
  RETURNING id, created_at INTO v_bid_id, v_created_at;

  -- 6. Anti-sniping (Soft Close) extension
  -- If bid is placed within last 5 minutes, extend by 5 minutes from NOW
  IF (v_end_time - now()) < v_soft_close_window THEN
    v_new_end_time := now() + v_soft_close_extension;
    
    UPDATE auctions
    SET bidding_end_time = v_new_end_time
    WHERE id = p_auction_id;
  END IF;

  -- 7. Return success
  RETURN json_build_object(
    'success', true,
    'bid_id', v_bid_id,
    'amount', p_amount,
    'created_at', v_created_at,
    'new_end_time', v_new_end_time,
    'extended', v_new_end_time IS NOT NULL
  );

EXCEPTION WHEN OTHERS THEN
  -- Catch all other errors
  RETURN json_build_object('error', SQLERRM, 'status', 500);
END;
$$ LANGUAGE plpgsql;
