import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DollarSign,
  AlertTriangle,
  TrendingUp,
  CreditCard,
  Plus,
  MoreHorizontal,
  Send,
  CheckCircle,
  XCircle,
  Eye,
  Trash2,
  FileText,
  Bot,
  Clock,
  Activity,
} from "lucide-react";
import { format } from "date-fns";
import UsageDashboard from "@/components/billing/UsageDashboard";
import BillingAgentActivity from "@/components/billing/BillingAgentActivity";
import PricingManager from "@/components/billing/PricingManager";
import BillingHealthCheck from "@/components/billing/BillingHealthCheck";
import PlaidLinkButton from "@/components/finance/PlaidLinkButton";
import QuickBooksConnect from "@/components/finance/QuickBooksConnect";
import PLDashboard from "@/components/finance/PLDashboard";
import TransactionCategorizer from "@/components/finance/TransactionCategorizer";
import { Landmark } from "lucide-react";

interface InvoiceItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface Invoice {
  id: string;
  client_id: string;
  invoice_number: string;
  status: string;
  amount: number;
  currency: string;
  due_date: string | null;
  paid_at: string | null;
  items: InvoiceItem[];
  notes: string | null;
  created_at: string;
  clients?: { name: string; email: string };
}

interface BillingSummary {
  total_outstanding: number;
  invoices_overdue: number;
  revenue_this_month: number;
  payments_received: number;
  draft_invoices: number;
  sent_invoices: number;
  paid_invoices: number;
}

export default function AdminBilling() {
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // Create invoice form state
  const [selectedClientId, setSelectedClientId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: "", quantity: 1, unit_price: 0, total: 0 }
  ]);

  // Payment form state
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [referenceNumber, setReferenceNumber] = useState("");

  // Fetch billing summary
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['billing-summary'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('client-billing', {
        body: { action: 'get_billing_summary' }
      });
      if (error) throw error;
      return data.summary as BillingSummary;
    }
  });

  // Fetch invoices
  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_invoices')
        .select('*, clients(name, email)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data.map(inv => ({
        ...inv,
        items: (Array.isArray(inv.items) ? inv.items : []) as unknown as InvoiceItem[]
      })) as Invoice[];
    }
  });

  // Fetch clients for dropdown
  const { data: clients } = useQuery({
    queryKey: ['clients-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, email')
        .eq('status', 'active')
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  // Create invoice mutation
  const createInvoice = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('client-billing', {
        body: {
          action: 'create_invoice',
          client_id: selectedClientId,
          items: items.filter(i => i.description && i.total > 0),
          due_date: dueDate || undefined,
          notes: notes || undefined
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
      toast.success('Invoice created successfully');
      setCreateDialogOpen(false);
      resetCreateForm();
    },
    onError: (error: Error) => {
      toast.error(`Failed to create invoice: ${error.message}`);
    }
  });

  // Send invoice mutation
  const sendInvoice = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data, error } = await supabase.functions.invoke('client-billing', {
        body: { action: 'send_invoice', invoice_id: invoiceId }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
      toast.success('Invoice sent');
    }
  });

  // Mark paid mutation
  const markPaid = useMutation({
    mutationFn: async ({ invoiceId, method, reference }: { invoiceId: string; method: string; reference?: string }) => {
      const { data, error } = await supabase.functions.invoke('client-billing', {
        body: { 
          action: 'mark_paid', 
          invoice_id: invoiceId,
          payment_method: method,
          reference_number: reference
        }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
      toast.success('Invoice marked as paid');
      setPaymentDialogOpen(false);
      setSelectedInvoice(null);
    }
  });

  // Cancel invoice mutation
  const cancelInvoice = useMutation({
    mutationFn: async (invoiceId: string) => {
      const { data, error } = await supabase.functions.invoke('client-billing', {
        body: { action: 'cancel_invoice', invoice_id: invoiceId }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['billing-summary'] });
      toast.success('Invoice cancelled');
    }
  });

  const resetCreateForm = () => {
    setSelectedClientId("");
    setDueDate("");
    setNotes("");
    setItems([{ description: "", quantity: 1, unit_price: 0, total: 0 }]);
  };

  const addLineItem = () => {
    setItems([...items, { description: "", quantity: 1, unit_price: 0, total: 0 }]);
  };

  const updateLineItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    const newItems = [...items];
    if (field === 'description') {
      newItems[index].description = value as string;
    } else {
      newItems[index][field] = Number(value);
      newItems[index].total = newItems[index].quantity * newItems[index].unit_price;
    }
    setItems(newItems);
  };

  const removeLineItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      draft: { variant: "secondary", label: "Draft" },
      sent: { variant: "default", label: "Sent" },
      paid: { variant: "outline", label: "Paid" },
      overdue: { variant: "destructive", label: "Overdue" },
      cancelled: { variant: "secondary", label: "Cancelled" },
    };
    const config = variants[status] || { variant: "secondary", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const filteredInvoices = invoices?.filter(inv => 
    statusFilter === "all" || inv.status === statusFilter
  );

  const totalAmount = items.reduce((sum, item) => sum + item.total, 0);

  return (
    <AdminLayout title="Billing" subtitle="Manage client invoices, usage, and AI-powered billing">
      <Tabs defaultValue="invoices" className="space-y-6">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="usage">
            <Clock className="h-4 w-4 mr-1" />
            Usage
          </TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="agent">
            <Bot className="h-4 w-4 mr-1" />
            AI Agent
          </TabsTrigger>
          <TabsTrigger value="health">
            <Activity className="h-4 w-4 mr-1" />
            Health
          </TabsTrigger>
          <TabsTrigger value="finance">
            <Landmark className="h-4 w-4 mr-1" />
            Finance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Outstanding</p>
                <p className="text-2xl font-bold">
                  ${summaryLoading ? '...' : summary?.total_outstanding.toLocaleString() || 0}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        
        <Card className={summary?.invoices_overdue ? "border-destructive" : ""}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overdue</p>
                <p className="text-2xl font-bold text-destructive">
                  {summaryLoading ? '...' : summary?.invoices_overdue || 0}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Revenue (Month)</p>
                <p className="text-2xl font-bold text-green-600">
                  ${summaryLoading ? '...' : summary?.revenue_this_month.toLocaleString() || 0}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Payments</p>
                <p className="text-2xl font-bold">
                  {summaryLoading ? '...' : summary?.payments_received || 0}
                </p>
              </div>
              <CreditCard className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Invoices Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Invoices
          </CardTitle>
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
            
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Invoice
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create New Invoice</DialogTitle>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Client</Label>
                      <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select client" />
                        </SelectTrigger>
                        <SelectContent>
                          {clients?.map(client => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Due Date</Label>
                      <Input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Line Items</Label>
                    <div className="space-y-2 mt-2">
                      {items.map((item, index) => (
                        <div key={index} className="grid grid-cols-12 gap-2 items-center">
                          <Input
                            className="col-span-5"
                            placeholder="Description"
                            value={item.description}
                            onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                          />
                          <Input
                            className="col-span-2"
                            type="number"
                            placeholder="Qty"
                            value={item.quantity}
                            onChange={(e) => updateLineItem(index, 'quantity', e.target.value)}
                          />
                          <Input
                            className="col-span-2"
                            type="number"
                            placeholder="Price"
                            value={item.unit_price}
                            onChange={(e) => updateLineItem(index, 'unit_price', e.target.value)}
                          />
                          <div className="col-span-2 text-right font-medium">
                            ${item.total.toFixed(2)}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="col-span-1"
                            onClick={() => removeLineItem(index)}
                            disabled={items.length === 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" className="mt-2" onClick={addLineItem}>
                      <Plus className="h-4 w-4 mr-1" /> Add Line
                    </Button>
                  </div>

                  <div className="flex justify-between items-center border-t pt-4">
                    <span className="font-medium">Total:</span>
                    <span className="text-2xl font-bold">${totalAmount.toFixed(2)}</span>
                  </div>

                  <div>
                    <Label>Notes</Label>
                    <Textarea
                      placeholder="Additional notes..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={() => createInvoice.mutate()}
                    disabled={!selectedClientId || totalAmount === 0 || createInvoice.isPending}
                  >
                    {createInvoice.isPending ? 'Creating...' : 'Create Invoice'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoicesLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredInvoices?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No invoices found. Create your first invoice to get started.
                  </TableCell>
                </TableRow>
              ) : (
                filteredInvoices?.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-mono">{invoice.invoice_number}</TableCell>
                    <TableCell>{invoice.clients?.name || 'Unknown'}</TableCell>
                    <TableCell className="font-medium">${Number(invoice.amount).toLocaleString()}</TableCell>
                    <TableCell>
                      {invoice.due_date ? format(new Date(invoice.due_date), 'MMM d, yyyy') : '-'}
                    </TableCell>
                    <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setSelectedInvoice(invoice);
                            setViewDialogOpen(true);
                          }}>
                            <Eye className="h-4 w-4 mr-2" /> View
                          </DropdownMenuItem>
                          {invoice.status === 'draft' && (
                            <DropdownMenuItem onClick={() => sendInvoice.mutate(invoice.id)}>
                              <Send className="h-4 w-4 mr-2" /> Send
                            </DropdownMenuItem>
                          )}
                          {['sent', 'overdue'].includes(invoice.status) && (
                            <DropdownMenuItem onClick={() => {
                              setSelectedInvoice(invoice);
                              setPaymentDialogOpen(true);
                            }}>
                              <CheckCircle className="h-4 w-4 mr-2" /> Mark Paid
                            </DropdownMenuItem>
                          )}
                          {['draft', 'sent'].includes(invoice.status) && (
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => cancelInvoice.mutate(invoice.id)}
                            >
                              <XCircle className="h-4 w-4 mr-2" /> Cancel
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="usage">
          <UsageDashboard />
        </TabsContent>

        <TabsContent value="pricing">
          <PricingManager />
        </TabsContent>

        <TabsContent value="agent">
          <BillingAgentActivity />
        </TabsContent>

        <TabsContent value="health">
          <BillingHealthCheck />
        </TabsContent>
      </Tabs>
      {/* View Invoice Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Invoice {selectedInvoice?.invoice_number}</DialogTitle>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Client:</span>
                  <p className="font-medium">{selectedInvoice.clients?.name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <p>{getStatusBadge(selectedInvoice.status)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Created:</span>
                  <p>{format(new Date(selectedInvoice.created_at), 'MMM d, yyyy')}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Due Date:</span>
                  <p>{selectedInvoice.due_date ? format(new Date(selectedInvoice.due_date), 'MMM d, yyyy') : '-'}</p>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground mb-2">Line Items</p>
                {(selectedInvoice.items as InvoiceItem[])?.map((item, i) => (
                  <div key={i} className="flex justify-between py-1">
                    <span>{item.description} x{item.quantity}</span>
                    <span className="font-medium">${item.total.toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-2 mt-2 font-bold">
                  <span>Total</span>
                  <span>${Number(selectedInvoice.amount).toFixed(2)}</span>
                </div>
              </div>

              {selectedInvoice.notes && (
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="text-sm">{selectedInvoice.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Mark Paid Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Invoice</Label>
              <p className="text-lg font-medium">{selectedInvoice?.invoice_number} - ${selectedInvoice?.amount}</p>
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="stripe">Stripe</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference Number (Optional)</Label>
              <Input
                placeholder="Check #, transaction ID, etc."
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => selectedInvoice && markPaid.mutate({
                invoiceId: selectedInvoice.id,
                method: paymentMethod,
                reference: referenceNumber || undefined
              })}
              disabled={markPaid.isPending}
            >
              {markPaid.isPending ? 'Processing...' : 'Confirm Payment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
