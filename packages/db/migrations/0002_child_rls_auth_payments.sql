-- Defensa en profundidad: tenant_id directo en todas las tablas hijas.
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE product_variants child SET tenant_id = parent.tenant_id FROM products parent WHERE child.product_id = parent.id AND child.tenant_id IS NULL;
ALTER TABLE product_variants ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE options ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE options child SET tenant_id = parent.tenant_id FROM option_groups parent WHERE child.group_id = parent.id AND child.tenant_id IS NULL;
ALTER TABLE options ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE product_option_groups ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE product_option_groups child SET tenant_id = parent.tenant_id FROM products parent WHERE child.product_id = parent.id AND child.tenant_id IS NULL;
ALTER TABLE product_option_groups ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE order_items child SET tenant_id = parent.tenant_id FROM orders parent WHERE child.order_id = parent.id AND child.tenant_id IS NULL;
ALTER TABLE order_items ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE order_events ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE order_events child SET tenant_id = parent.tenant_id FROM orders parent WHERE child.order_id = parent.id AND child.tenant_id IS NULL;
ALTER TABLE order_events ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE stock_reservations ADD COLUMN IF NOT EXISTS tenant_id uuid;
UPDATE stock_reservations child SET tenant_id = parent.tenant_id FROM orders parent WHERE child.order_id = parent.id AND child.tenant_id IS NULL;
ALTER TABLE stock_reservations ALTER COLUMN tenant_id SET NOT NULL;

CREATE TABLE IF NOT EXISTS refresh_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  token_id_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_id_idx ON payment_webhook_events(provider, provider_event_id);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'product_variants', 'options', 'product_option_groups', 'order_items',
    'order_events', 'stock_reservations', 'refresh_sessions', 'payment_webhook_events'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      table_name
    );
  END LOOP;
END $$;
