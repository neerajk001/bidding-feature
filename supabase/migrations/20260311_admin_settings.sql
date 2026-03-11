-- Admin Settings Table
-- Stores admin email addresses that can be managed through the admin panel
 
CREATE TABLE IF NOT EXISTS public.admin_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by text NULL,
  CONSTRAINT admin_settings_pkey PRIMARY KEY (id),
  CONSTRAINT admin_settings_key_unique UNIQUE (key)
) TABLESPACE pg_default;

-- Create index on key for fast lookups
CREATE INDEX IF NOT EXISTS idx_admin_settings_key ON public.admin_settings USING btree (key) TABLESPACE pg_default;

-- Insert default admin_emails row (empty array, will be populated from env vars on first run)
INSERT INTO public.admin_settings (key, value, updated_by)
VALUES ('admin_emails', '[]'::jsonb, 'system')
ON CONFLICT (key) DO NOTHING;

-- Add comment
COMMENT ON TABLE public.admin_settings IS 'Stores system-wide admin settings including admin email addresses';
