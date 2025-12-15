-- Table 1: Client Invoices (attached to existing clients table)
CREATE TABLE client_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  invoice_number TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'draft', -- 'draft', 'sent', 'paid', 'overdue', 'cancelled'
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  due_date DATE,
  paid_at TIMESTAMPTZ,
  items JSONB DEFAULT '[]', -- [{description, quantity, unit_price, total}]
  notes TEXT,
  stripe_invoice_id TEXT,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table 2: Client Payments (linked to invoices)
CREATE TABLE client_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES client_invoices(id) ON DELETE SET NULL,
  amount DECIMAL(10, 2) NOT NULL,
  method TEXT DEFAULT 'stripe', -- 'stripe', 'cash', 'bank_transfer', 'check'
  reference_number TEXT,
  stripe_payment_intent_id TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'succeeded', 'failed', 'refunded'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_client_invoices_client_id ON client_invoices(client_id);
CREATE INDEX idx_client_invoices_status ON client_invoices(status);
CREATE INDEX idx_client_invoices_due_date ON client_invoices(due_date);
CREATE INDEX idx_client_payments_invoice_id ON client_payments(invoice_id);
CREATE INDEX idx_client_payments_client_id ON client_payments(client_id);

-- Enable RLS
ALTER TABLE client_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_payments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for client_invoices (matching existing pattern)
CREATE POLICY "Admins can manage invoices" ON client_invoices FOR ALL 
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view invoices" ON client_invoices FOR SELECT 
  USING (true);
CREATE POLICY "Anyone can insert invoices" ON client_invoices FOR INSERT 
  WITH CHECK (true);
CREATE POLICY "Anyone can update invoices" ON client_invoices FOR UPDATE 
  USING (true);

-- RLS Policies for client_payments
CREATE POLICY "Admins can manage payments" ON client_payments FOR ALL 
  USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Anyone can view payments" ON client_payments FOR SELECT 
  USING (true);
CREATE POLICY "Anyone can insert payments" ON client_payments FOR INSERT 
  WITH CHECK (true);
CREATE POLICY "Anyone can update payments" ON client_payments FOR UPDATE 
  USING (true);

-- Auto-update trigger for invoices
CREATE TRIGGER update_client_invoices_updated_at
  BEFORE UPDATE ON client_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();