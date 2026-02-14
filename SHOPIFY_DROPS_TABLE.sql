-- Shopify Drops Table for Admin Management

CREATE TABLE IF NOT EXISTS public.shopify_drops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price TEXT NOT NULL,
  link_url TEXT NOT NULL,
  image_url TEXT,
  tone TEXT DEFAULT 'ochre' CHECK (tone IN ('ochre', 'rose', 'forest')),
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for active drops ordering
CREATE INDEX IF NOT EXISTS idx_shopify_drops_active_order 
  ON public.shopify_drops(is_active, display_order);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_shopify_drops_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER shopify_drops_updated_at
  BEFORE UPDATE ON public.shopify_drops
  FOR EACH ROW
  EXECUTE FUNCTION update_shopify_drops_updated_at();

-- Insert default drops (optional - matches current hardcoded data)
INSERT INTO public.shopify_drops (title, description, price, link_url, tone, display_order) VALUES
  ('Banarasi Brocade Edit', 'Handwoven silks with gold zari work, curated for collectors.', 'From INR 12,900', 'https://induheritage.com', 'ochre', 1),
  ('Heritage Bridal Looms', 'Archive-inspired bridal sets with couture finishing.', 'From INR 22,500', 'https://induheritage.com', 'rose', 2),
  ('Festive Heirloom Capsule', 'Limited drop of richly detailed ensembles for gala nights.', 'From INR 9,800', 'https://induheritage.com', 'forest', 3)
ON CONFLICT DO NOTHING;
