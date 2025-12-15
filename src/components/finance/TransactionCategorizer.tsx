import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  X,
  Pencil,
  Loader2,
  Sparkles,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

interface Transaction {
  id: string;
  name: string;
  merchant_name: string | null;
  amount: number;
  date: string;
  ai_category: string | null;
  ai_confidence: number | null;
  needs_review: boolean;
}

const CATEGORIES = [
  'Payroll',
  'Software & Tools',
  'Marketing & Ads',
  'Utilities',
  'Office Supplies',
  'Insurance',
  'Professional Services',
  'Travel & Transportation',
  'Bank Fees',
  'Other',
];

export default function TransactionCategorizer() {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<string>('');
  const queryClient = useQueryClient();

  // Fetch uncategorized/needs review transactions
  const { data: transactions, isLoading } = useQuery({
    queryKey: ['uncategorized-transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bank_transactions')
        .select('*')
        .eq('needs_review', true)
        .order('date', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as Transaction[];
    }
  });

  // Approve category mutation
  const approveMutation = useMutation({
    mutationFn: async (transactionId: string) => {
      const { error } = await supabase
        .from('bank_transactions')
        .update({ 
          needs_review: false,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', transactionId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Category approved');
      queryClient.invalidateQueries({ queryKey: ['uncategorized-transactions'] });
    }
  });

  // Update category mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, category }: { id: string; category: string }) => {
      const { error } = await supabase
        .from('bank_transactions')
        .update({ 
          ai_category: category,
          ai_confidence: 1.0,
          needs_review: false,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Category updated');
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ['uncategorized-transactions'] });
    }
  });

  // Bulk categorize mutation
  const bulkCategorizeMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('finance-agent', {
        body: { action: 'bulk_categorize' }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Categorized ${data.categorized} transactions`);
      queryClient.invalidateQueries({ queryKey: ['uncategorized-transactions'] });
    }
  });

  // Skip/dismiss transaction
  const skipMutation = useMutation({
    mutationFn: async (transactionId: string) => {
      const { error } = await supabase
        .from('bank_transactions')
        .update({ needs_review: false })
        .eq('id', transactionId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.info('Transaction skipped');
      queryClient.invalidateQueries({ queryKey: ['uncategorized-transactions'] });
    }
  });

  const formatCurrency = (amount: number) => {
    const isExpense = amount < 0;
    return (
      <span className={isExpense ? 'text-destructive' : 'text-green-600'}>
        {isExpense ? '-' : '+'}${Math.abs(amount).toLocaleString()}
      </span>
    );
  };

  const getConfidenceBadge = (confidence: number | null) => {
    if (!confidence) return null;
    if (confidence >= 0.8) {
      return <Badge variant="outline" className="text-green-600 text-xs">High</Badge>;
    } else if (confidence >= 0.5) {
      return <Badge variant="outline" className="text-yellow-600 text-xs">Medium</Badge>;
    }
    return <Badge variant="outline" className="text-red-600 text-xs">Low</Badge>;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Transaction Categorizer
          {transactions && transactions.length > 0 && (
            <Badge variant="secondary">{transactions.length} to review</Badge>
          )}
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => bulkCategorizeMutation.mutate()}
          disabled={bulkCategorizeMutation.isPending}
        >
          {bulkCategorizeMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-1" />
          )}
          Auto-Categorize
        </Button>
      </CardHeader>
      <CardContent>
        {!transactions || transactions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Check className="h-8 w-8 mx-auto mb-2 text-green-500" />
            <p>All transactions categorized!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">
                      {tx.merchant_name || tx.name}
                    </p>
                    {tx.ai_confidence && tx.ai_confidence < 0.7 && (
                      <AlertCircle className="h-4 w-4 text-yellow-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      {new Date(tx.date).toLocaleDateString()}
                    </span>
                    <span className="text-sm font-medium">
                      {formatCurrency(tx.amount)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {editingId === tx.id ? (
                    <>
                      <Select value={editCategory} onValueChange={setEditCategory}>
                        <SelectTrigger className="w-40 h-8 text-xs">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => updateMutation.mutate({ id: tx.id, category: editCategory })}
                        disabled={!editCategory}
                      >
                        <Check className="h-4 w-4 text-green-500" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-xs">
                          {tx.ai_category || 'Uncategorized'}
                        </Badge>
                        {getConfidenceBadge(tx.ai_confidence)}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditingId(tx.id);
                          setEditCategory(tx.ai_category || '');
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => approveMutation.mutate(tx.id)}
                        disabled={approveMutation.isPending}
                      >
                        <Check className="h-4 w-4 text-green-500" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => skipMutation.mutate(tx.id)}
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
