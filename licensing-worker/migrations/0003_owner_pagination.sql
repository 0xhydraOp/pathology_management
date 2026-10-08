/* Additive indexes only. Existing licence/customer/device IDs and values remain unchanged. */
CREATE INDEX IF NOT EXISTS customers_page ON customers(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS customers_status_page ON customers(status,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS licenses_customer_page ON licenses(customer_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS licenses_customer_kind_page ON licenses(customer_id,kind,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS activations_license_page ON activations(license_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS activations_license_status_page ON activations(license_id,status,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS activations_page ON activations(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS revocations_license_page ON revocations(license_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS revocations_page ON revocations(created_at DESC,id DESC);
