import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircle,
  XCircle,
  MessageSquare,
  Clock,
  AlertCircle,
  Eye,
} from "lucide-react";

export interface WorkItem {
  id: string;
  title: string;
  description: string;
  type: "approval" | "review" | "task";
  status: "pending" | "approved" | "denied" | "in_progress";
  priority: "low" | "medium" | "high" | "urgent";
  createdAt: string;
  details?: string;
  metadata?: Record<string, unknown>;
}

interface AgentWorkItemProps {
  item: WorkItem;
  onApprove?: (id: string, notes?: string) => void;
  onDeny?: (id: string, reason: string) => void;
  onDiscuss?: (id: string) => void;
}

const priorityColors = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-secondary text-secondary-foreground",
  high: "bg-accent/20 text-accent",
  urgent: "bg-destructive/20 text-destructive",
};

const statusColors = {
  pending: "bg-yellow-500/20 text-yellow-600",
  approved: "bg-green-500/20 text-green-600",
  denied: "bg-red-500/20 text-red-600",
  in_progress: "bg-blue-500/20 text-blue-600",
};

const AgentWorkItem = ({ item, onApprove, onDeny, onDiscuss }: AgentWorkItemProps) => {
  const [denyReason, setDenyReason] = useState("");
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isDenyDialogOpen, setIsDenyDialogOpen] = useState(false);

  const handleApprove = () => {
    onApprove?.(item.id);
  };

  const handleDeny = () => {
    if (denyReason.trim()) {
      onDeny?.(item.id, denyReason);
      setDenyReason("");
      setIsDenyDialogOpen(false);
    }
  };

  return (
    <Card className="transition-all duration-300 hover:card-shadow-hover border-l-4 border-l-accent/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={priorityColors[item.priority]}>
                {item.priority}
              </Badge>
              <Badge className={statusColors[item.status]}>
                {item.status.replace("_", " ")}
              </Badge>
            </div>
            <CardTitle className="text-lg">{item.title}</CardTitle>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground text-sm">
            <Clock className="h-4 w-4" />
            <span>{new Date(item.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground mb-4">{item.description}</p>

        {item.status === "pending" && (
          <div className="flex flex-wrap gap-2">
            {/* View Details */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4 mr-2" />
                  View Details
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{item.title}</DialogTitle>
                  <DialogDescription>{item.description}</DialogDescription>
                </DialogHeader>
                <div className="mt-4 p-4 bg-muted rounded-lg">
                  <pre className="text-sm whitespace-pre-wrap">
                    {item.details || JSON.stringify(item.metadata, null, 2) || "No additional details available."}
                  </pre>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDetailOpen(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Approve */}
            <Button 
              size="sm" 
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleApprove}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Approve
            </Button>

            {/* Deny */}
            <Dialog open={isDenyDialogOpen} onOpenChange={setIsDenyDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <XCircle className="h-4 w-4 mr-2" />
                  Deny
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Deny Work Item</DialogTitle>
                  <DialogDescription>
                    Please provide a reason for denying this item.
                  </DialogDescription>
                </DialogHeader>
                <Textarea
                  placeholder="Enter reason for denial..."
                  value={denyReason}
                  onChange={(e) => setDenyReason(e.target.value)}
                  className="min-h-[100px]"
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDenyDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={handleDeny}
                    disabled={!denyReason.trim()}
                  >
                    Confirm Denial
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Discuss with CEO */}
            <Button 
              variant="secondary" 
              size="sm"
              onClick={() => onDiscuss?.(item.id)}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Discuss with CEO
            </Button>
          </div>
        )}

        {item.status !== "pending" && (
          <div className="flex items-center gap-2 text-sm">
            {item.status === "approved" && (
              <>
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-green-600">Approved</span>
              </>
            )}
            {item.status === "denied" && (
              <>
                <XCircle className="h-4 w-4 text-red-600" />
                <span className="text-red-600">Denied</span>
              </>
            )}
            {item.status === "in_progress" && (
              <>
                <AlertCircle className="h-4 w-4 text-blue-600" />
                <span className="text-blue-600">In Progress</span>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AgentWorkItem;
