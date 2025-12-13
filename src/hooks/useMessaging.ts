import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { mockContacts, mockConversations, mockSequences, channelConfigs } from "@/data/mockMessagingData";

export interface Contact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp_id: string | null;
  messenger_id: string | null;
  instagram_id: string | null;
  lead_id: string | null;
  tags: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  channel_type: string;
  external_id: string | null;
  contact_id: string | null;
  status: string;
  last_message_at: string;
  unread_count: number;
  assigned_to: string | null;
  created_at: string;
  contact?: Contact;
}

export interface Message {
  id: string;
  conversation_id: string;
  direction: string;
  content: string;
  media_url: string | null;
  status: string;
  metadata: unknown;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
  is_mock: boolean;
  created_at: string;
}

export interface Sequence {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  steps: unknown;
  is_active: boolean;
  enrolled_count: number;
  created_at: string;
  updated_at: string;
}

export function useMessaging() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const fetchContacts = useCallback(async () => {
    const { data, error } = await supabase
      .from("contacts_unified")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching contacts:", error);
      return [];
    }
    return data || [];
  }, []);

  const fetchConversations = useCallback(async (channelFilter?: string) => {
    let query = supabase
      .from("conversations_unified")
      .select(`
        *,
        contact:contacts_unified(*)
      `)
      .order("last_message_at", { ascending: false });

    if (channelFilter && channelFilter !== "all") {
      query = query.eq("channel_type", channelFilter);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching conversations:", error);
      return [];
    }
    return data || [];
  }, []);

  const fetchMessages = useCallback(async (conversationId: string) => {
    const { data, error } = await supabase
      .from("messages_unified")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: true });

    if (error) {
      console.error("Error fetching messages:", error);
      return [];
    }
    return data || [];
  }, []);

  const fetchSequences = useCallback(async () => {
    const { data, error } = await supabase
      .from("sequences")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching sequences:", error);
      return [];
    }
    return data || [];
  }, []);

  const sendMessage = useCallback(async (
    contactId: string,
    channel: "sms" | "whatsapp" | "email",
    content: string,
    conversationId?: string,
    subject?: string
  ) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("messaging-send", {
        body: {
          contact_id: contactId,
          channel,
          content,
          conversation_id: conversationId,
          subject,
        },
      });

      if (error) throw error;

      toast({
        title: data.is_mock ? "Message sent (Mock Mode)" : "Message sent",
        description: `${channel.toUpperCase()} message delivered successfully`,
      });

      return data;
    } catch (error) {
      console.error("Send message error:", error);
      toast({
        title: "Failed to send message",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const replyToConversation = useCallback(async (conversationId: string, content: string) => {
    // Get the conversation to find contact and channel
    const { data: conv, error: convError } = await supabase
      .from("conversations_unified")
      .select("*")
      .eq("id", conversationId)
      .single();

    if (convError || !conv) {
      toast({
        title: "Error",
        description: "Conversation not found",
        variant: "destructive",
      });
      return null;
    }

    return sendMessage(
      conv.contact_id!,
      conv.channel_type as "sms" | "whatsapp" | "email",
      content,
      conversationId
    );
  }, [sendMessage, toast]);

  const markAsRead = useCallback(async (conversationId: string) => {
    await supabase
      .from("conversations_unified")
      .update({ unread_count: 0 })
      .eq("id", conversationId);

    await supabase
      .from("messages_unified")
      .update({ read_at: new Date().toISOString(), status: "read" })
      .eq("conversation_id", conversationId)
      .eq("direction", "inbound")
      .is("read_at", null);
  }, []);

  const seedMockData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Seed channels
      for (const channel of channelConfigs) {
        await supabase.from("channels").upsert(channel, { onConflict: "channel_type" });
      }

      // Seed contacts
      const contactIds: string[] = [];
      for (const mockContact of mockContacts) {
        const { data: contact } = await supabase
          .from("contacts_unified")
          .upsert({ ...mockContact }, { onConflict: "email" })
          .select()
          .single();
        if (contact) contactIds.push(contact.id);
      }

      // Seed conversations and messages
      for (const { contactIndex, conversation } of mockConversations) {
        if (!contactIds[contactIndex]) continue;

        const { data: conv } = await supabase
          .from("conversations_unified")
          .insert({
            channel_type: conversation.channel_type,
            contact_id: contactIds[contactIndex],
            status: conversation.status,
            unread_count: conversation.messages.filter(m => m.direction === "inbound").length,
            last_message_at: conversation.messages[conversation.messages.length - 1]?.sent_at,
          })
          .select()
          .single();

        if (conv) {
          for (const msg of conversation.messages) {
            await supabase.from("messages_unified").insert({
              conversation_id: conv.id,
              direction: msg.direction,
              content: msg.content,
              status: "delivered",
              sent_at: msg.sent_at,
              is_mock: true,
            });
          }
        }
      }

      // Seed sequences
      for (const seq of mockSequences) {
        await supabase.from("sequences").upsert({
          name: seq.name,
          description: seq.description,
          trigger_type: seq.trigger_type,
          steps: seq.steps,
          is_active: seq.is_active,
        }, { onConflict: "name" });
      }

      toast({
        title: "Mock data seeded",
        description: "Sample contacts, conversations, and sequences created",
      });
    } catch (error) {
      console.error("Seed error:", error);
      toast({
        title: "Failed to seed data",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  const createContact = useCallback(async (contact: Partial<Contact>) => {
    const { data, error } = await supabase
      .from("contacts_unified")
      .insert(contact)
      .select()
      .single();

    if (error) {
      toast({
        title: "Failed to create contact",
        description: error.message,
        variant: "destructive",
      });
      return null;
    }

    toast({ title: "Contact created" });
    return data;
  }, [toast]);

  const updateContact = useCallback(async (id: string, updates: Partial<Contact>) => {
    const { data, error } = await supabase
      .from("contacts_unified")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      toast({
        title: "Failed to update contact",
        description: error.message,
        variant: "destructive",
      });
      return null;
    }

    toast({ title: "Contact updated" });
    return data;
  }, [toast]);

  const createSequence = useCallback(async (sequence: Partial<Sequence>) => {
    const { data, error } = await supabase
      .from("sequences")
      .insert(sequence)
      .select()
      .single();

    if (error) {
      toast({
        title: "Failed to create sequence",
        description: error.message,
        variant: "destructive",
      });
      return null;
    }

    toast({ title: "Sequence created" });
    return data;
  }, [toast]);

  const enrollInSequence = useCallback(async (sequenceId: string, contactId: string) => {
    const { error } = await supabase
      .from("sequence_enrollments")
      .insert({
        sequence_id: sequenceId,
        contact_id: contactId,
        status: "active",
      });

    if (error) {
      toast({
        title: "Failed to enroll",
        description: error.message,
        variant: "destructive",
      });
      return false;
    }

    toast({ title: "Contact enrolled in sequence" });
    return true;
  }, [toast]);

  return {
    contacts,
    conversations,
    sequences,
    isLoading,
    fetchContacts,
    fetchConversations,
    fetchMessages,
    fetchSequences,
    sendMessage,
    replyToConversation,
    markAsRead,
    seedMockData,
    createContact,
    updateContact,
    createSequence,
    enrollInSequence,
  };
}
