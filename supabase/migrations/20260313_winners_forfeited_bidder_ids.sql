-- Add forfeited_bidder_ids to track all bidders who have already forfeited
-- for a given auction+size so escalation never notifies the same person twice

ALTER TABLE public.winners
  ADD COLUMN IF NOT EXISTS forfeited_bidder_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.winners.forfeited_bidder_ids IS
  'Array of bidder UUIDs that have already forfeited payment for this auction/size winner slot. Used to prevent re-escalating to previously forfeited bidders.';
