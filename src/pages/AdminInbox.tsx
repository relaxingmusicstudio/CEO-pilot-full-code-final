import { useState, useEffect, useRef, useCallback } from "react";
import { Send, MessageSquare, Phone, Mail, RefreshCw, Database, User, Clock, CheckCheck, Check } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { AssistantStrip } from "@/components/AssistantStrip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMessaging, Conversation, Message } from "@/hooks/useMessaging";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const channelIcons: Record<string, React.ReactNode> = {
  sms: <Phone className="h-4 w-4" />,
  whatsapp: <MessageSquare className="h-4 w-4 text-green-500" />,
  email: <Mail className="h-4 w-4 text-blue-500" />,
  messenger: <MessageSquare className="h-4 w-4 text-purple-500" />,
  instagram: <MessageSquare className="h-4 w-4 text-pink-500" />,
};

export default function AdminInbox() {
  const { fetchConversations, fetchMessages, replyToConversation, markAsRead, seedMockData, isLoading } = useMessaging();
  
  const [channelFilter, setChannelFilter] = useState("all");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    const data = await fetchConversations(channelFilter);
    setConversations(data);
  }, [channelFilter, fetchConversations]);

  const loadMessages = useCallback(async (conversationId: string) => {
    const data = await fetchMessages(conversationId);
    setMessages(data);
  }, [fetchMessages]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation.id);
      markAsRead(selectedConversation.id);
    }
  }, [loadMessages, markAsRead, selectedConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel("inbox-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages_unified" },
        (payload) => {
          if (payload.new && selectedConversation && 
              (payload.new as Message).conversation_id === selectedConversation.id) {
            setMessages(prev => [...prev, payload.new as Message]);
          }
          loadConversations();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadConversations, selectedConversation]);

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedConversation) return;
    
    setIsSending(true);
    const result = await replyToConversation(selectedConversation.id, replyText);
    if (result) {
      setReplyText("");
      await loadMessages(selectedConversation.id);
      await loadConversations();
    }
    setIsSending(false);
  };

  const formatTime = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    
    if (diff < 60000) return "Just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString();
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "read": return <CheckCheck className="h-3 w-3 text-blue-500" />;
      case "delivered": return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
      case "sent": return <Check className="h-3 w-3 text-muted-foreground" />;
      default: return <Clock className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const INBOX_PROMPTS = [
    { label: "Urgent messages", prompt: "Which messages need immediate attention?" },
    { label: "Follow-up needed", prompt: "Who hasn't been responded to?" },
    { label: "Response templates", prompt: "Suggest a response for the current conversation" },
  ];

  const assistantStrip = (
    <AssistantStrip
      pageContext="Unified Inbox - managing messages across SMS, WhatsApp, email"
      quickPrompts={INBOX_PROMPTS}
      placeholder="Ask about messages or get response suggestions..."
    />
  );

  const headerActions = (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={loadConversations}>
        <RefreshCw className="h-4 w-4 mr-1" />
        Refresh
      </Button>
      <Button variant="outline" size="sm" onClick={seedMockData} disabled={isLoading}>
        <Database className="h-4 w-4 mr-1" />
        Seed Mock Data
      </Button>
    </div>
  );

  return (
    <PageShell
      title="Unified Inbox"
      subtitle="Messages across all channels"
      primaryAction={headerActions}
      assistantStrip={assistantStrip}
      fullBleed
    >
      <div className="flex h-full overflow-hidden">
        {/* Sidebar - Conversation List */}
        <div className="w-80 border-r flex flex-col bg-card">
          <Tabs value={channelFilter} onValueChange={setChannelFilter} className="p-3">
            <TabsList className="w-full">
              <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
              <TabsTrigger value="sms" className="flex-1">SMS</TabsTrigger>
              <TabsTrigger value="whatsapp" className="flex-1">WA</TabsTrigger>
              <TabsTrigger value="email" className="flex-1">Email</TabsTrigger>
            </TabsList>
          </Tabs>

          <ScrollArea className="flex-1">
            {conversations.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No conversations yet</p>
                <Button variant="link" size="sm" onClick={seedMockData}>
                  Load sample data
                </Button>
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConversation(conv)}
                  className={cn(
                    "p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors",
                    selectedConversation?.id === conv.id && "bg-muted"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {channelIcons[conv.channel_type]}
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {conv.contact?.name || "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {conv.contact?.phone || conv.contact?.email || "No contact info"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTime(conv.last_message_at)}
                      </span>
                      {conv.unread_count > 0 && (
                        <Badge variant="default" className="h-5 w-5 p-0 flex items-center justify-center text-xs">
                          {conv.unread_count}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className="mt-2 text-xs capitalize">
                    {conv.status}
                  </Badge>
                </div>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Main - Messages */}
        <div className="flex-1 flex flex-col">
          {selectedConversation ? (
            <>
              {/* Conversation Header */}
              <div className="border-b p-4 bg-card flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-semibold">
                      {selectedConversation.contact?.name || "Unknown Contact"}
                    </h2>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      {channelIcons[selectedConversation.channel_type]}
                      <span className="capitalize">{selectedConversation.channel_type}</span>
                      <span>•</span>
                      <span>{selectedConversation.contact?.phone || selectedConversation.contact?.email}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedConversation.contact?.tags?.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4 max-w-3xl mx-auto">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex",
                        msg.direction === "outbound" ? "justify-end" : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[70%] rounded-2xl px-4 py-2",
                          msg.direction === "outbound"
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-muted rounded-bl-md"
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        <div className={cn(
                          "flex items-center gap-1 mt-1 text-xs",
                          msg.direction === "outbound" ? "text-primary-foreground/70 justify-end" : "text-muted-foreground"
                        )}>
                          <span>{formatTime(msg.sent_at)}</span>
                          {msg.direction === "outbound" && getStatusIcon(msg.status)}
                          {msg.is_mock && (
                            <Badge variant="outline" className="text-[10px] h-4 ml-1">
                              Mock
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Reply Input */}
              <div className="border-t p-4 bg-card">
                <div className="flex items-center gap-2 max-w-3xl mx-auto">
                  <Input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder={`Reply via ${selectedConversation.channel_type}...`}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendReply()}
                    disabled={isSending}
                  />
                  <Button onClick={handleSendReply} disabled={!replyText.trim() || isSending}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium">Select a conversation</h3>
                <p className="text-sm">Choose a conversation from the list to view messages</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
