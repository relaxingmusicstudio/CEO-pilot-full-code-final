-- Phase 1: Security Hardening - Fix RLS Policies on Sensitive Tables
-- Drop ALL existing policies first, then create proper admin-only access

-- =============================================
-- LEADS TABLE - Contains PII and business intelligence
-- =============================================
DROP POLICY IF EXISTS "Anyone can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Anyone can update leads" ON public.leads;
DROP POLICY IF EXISTS "Anyone can view leads" ON public.leads;
DROP POLICY IF EXISTS "Admins can manage leads" ON public.leads;
DROP POLICY IF EXISTS "Service role can insert leads" ON public.leads;

-- Only admins can manage leads
CREATE POLICY "Admins can manage leads" 
ON public.leads 
FOR ALL 
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Service role can insert leads (for webhooks/integrations)
CREATE POLICY "Service role can insert leads" 
ON public.leads 
FOR INSERT 
WITH CHECK (true);

-- =============================================
-- BANK_TRANSACTIONS TABLE - Financial PII
-- =============================================
DROP POLICY IF EXISTS "Anyone can insert bank_transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Anyone can update bank_transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Anyone can view bank_transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Admins can manage bank_transactions" ON public.bank_transactions;
DROP POLICY IF EXISTS "Admins only for bank_transactions" ON public.bank_transactions;

-- Only admins can view/manage bank transactions
CREATE POLICY "Admins only for bank_transactions" 
ON public.bank_transactions 
FOR ALL 
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- CLIENT_INVOICES TABLE - Financial PII
-- =============================================
DROP POLICY IF EXISTS "Anyone can insert client_invoices" ON public.client_invoices;
DROP POLICY IF EXISTS "Anyone can update client_invoices" ON public.client_invoices;
DROP POLICY IF EXISTS "Anyone can view client_invoices" ON public.client_invoices;
DROP POLICY IF EXISTS "Admins can manage client_invoices" ON public.client_invoices;
DROP POLICY IF EXISTS "Admins only for client_invoices" ON public.client_invoices;

-- Only admins can manage invoices
CREATE POLICY "Admins only for client_invoices" 
ON public.client_invoices 
FOR ALL 
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- CLIENT_PAYMENTS TABLE - Financial PII
-- =============================================
DROP POLICY IF EXISTS "Anyone can insert client_payments" ON public.client_payments;
DROP POLICY IF EXISTS "Anyone can update client_payments" ON public.client_payments;
DROP POLICY IF EXISTS "Anyone can view client_payments" ON public.client_payments;
DROP POLICY IF EXISTS "Admins can manage client_payments" ON public.client_payments;
DROP POLICY IF EXISTS "Admins only for client_payments" ON public.client_payments;

-- Only admins can manage payments
CREATE POLICY "Admins only for client_payments" 
ON public.client_payments 
FOR ALL 
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- BANK_CONNECTIONS TABLE - Contains access tokens
-- =============================================
DROP POLICY IF EXISTS "Anyone can insert bank_connections" ON public.bank_connections;
DROP POLICY IF EXISTS "Anyone can update bank_connections" ON public.bank_connections;
DROP POLICY IF EXISTS "Anyone can view bank_connections" ON public.bank_connections;
DROP POLICY IF EXISTS "Admins can manage bank_connections" ON public.bank_connections;
DROP POLICY IF EXISTS "Admins only for bank_connections" ON public.bank_connections;

-- Only admins can manage bank connections
CREATE POLICY "Admins only for bank_connections" 
ON public.bank_connections 
FOR ALL 
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =============================================
-- CONTACTS_UNIFIED TABLE - Contains PII
-- =============================================
DROP POLICY IF EXISTS "Anyone can insert contacts_unified" ON public.contacts_unified;
DROP POLICY IF EXISTS "Anyone can update contacts_unified" ON public.contacts_unified;
DROP POLICY IF EXISTS "Anyone can view contacts_unified" ON public.contacts_unified;
DROP POLICY IF EXISTS "Admins can manage contacts_unified" ON public.contacts_unified;
DROP POLICY IF EXISTS "Service role can insert contacts_unified" ON public.contacts_unified;

-- Only admins can view contacts
CREATE POLICY "Admins can manage contacts_unified" 
ON public.contacts_unified 
FOR ALL 
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Service role can insert contacts (for webhooks)
CREATE POLICY "Service role can insert contacts_unified" 
ON public.contacts_unified 
FOR INSERT 
WITH CHECK (true);