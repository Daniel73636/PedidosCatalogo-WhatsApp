-- Migración aditiva. Ejecutar con un rol propietario, nunca con el rol de la aplicación.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS idempotency_key text;
UPDATE orders SET idempotency_key = 'legacy:' || id::text WHERE idempotency_key IS NULL;
ALTER TABLE orders ALTER COLUMN idempotency_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orders_tenant_idempotency_idx ON orders (tenant_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS orders_tenant_number_idx ON orders (tenant_id, number);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'stores', 'users', 'api_keys', 'categories', 'products', 'option_groups',
    'delivery_zones', 'customers', 'orders', 'coupons', 'whatsapp_logs'
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

DROP POLICY IF EXISTS public_order_token ON orders;
CREATE POLICY public_order_token ON orders FOR SELECT USING (
  token = nullif(current_setting('app.order_token', true), '')
);
DROP POLICY IF EXISTS public_store_slug ON stores;
CREATE POLICY public_store_slug ON stores FOR SELECT USING (
  slug = nullif(current_setting('app.store_slug', true), '')
);

-- El repositorio ejecuta SET LOCAL app.tenant_id dentro de cada transacción.
-- Las tablas hijas sin tenant_id se alcanzan únicamente mediante padres filtrados.
