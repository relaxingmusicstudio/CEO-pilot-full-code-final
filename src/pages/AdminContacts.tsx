import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Search, User, Phone, Mail, MessageSquare, Tag, Edit2, X, Save, Home, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMessaging, Contact } from "@/hooks/useMessaging";
import { PageChatHeader } from "@/components/PageChatHeader";
import { EmptyState } from "@/components/EmptyState";
import { AdminBackButton } from "@/components/AdminBackButton";

export default function AdminContacts() {
  const navigate = useNavigate();
  const { fetchContacts, createContact, updateContact, sendMessage } = useMessaging();
  
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Contact>>({});
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", email: "", phone: "", tags: "" });

  const loadContacts = useCallback(async () => {
    const data = await fetchContacts();
    setContacts(data);
  }, [fetchContacts]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const filteredContacts = contacts.filter((c) => {
    const query = searchQuery.toLowerCase();
    return (
      c.name?.toLowerCase().includes(query) ||
      c.email?.toLowerCase().includes(query) ||
      c.phone?.includes(query) ||
      c.tags?.some((t) => t.toLowerCase().includes(query))
    );
  });

  const handleCreateContact = async () => {
    const contact = await createContact({
      name: newContact.name,
      email: newContact.email || null,
      phone: newContact.phone || null,
      tags: newContact.tags ? newContact.tags.split(",").map((t) => t.trim()) : [],
    });
    if (contact) {
      setIsCreateOpen(false);
      setNewContact({ name: "", email: "", phone: "", tags: "" });
      loadContacts();
    }
  };

  const handleUpdateContact = async () => {
    if (!selectedContact) return;
    const updated = await updateContact(selectedContact.id, editForm);
    if (updated) {
      setSelectedContact(updated);
      setIsEditing(false);
      loadContacts();
    }
  };

  const handleQuickMessage = async (contact: Contact, channel: "sms" | "whatsapp" | "email") => {
    const message = prompt(`Enter message to send via ${channel}:`);
    if (message) {
      await sendMessage(contact.id, channel, message);
    }
  };

  const getTagColor = (tag: string) => {
    const colors = [
      "bg-blue-500/10 text-blue-600 border-blue-500/20",
      "bg-purple-500/10 text-purple-600 border-purple-500/20",
      "bg-green-500/10 text-green-600 border-green-500/20",
      "bg-amber-500/10 text-amber-600 border-amber-500/20",
      "bg-pink-500/10 text-pink-600 border-pink-500/20",
    ];
    const index = tag.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AdminBackButton to="/app" showHome />
            <div className="h-6 w-px bg-border" />
            <h1 className="text-xl font-semibold">Contacts</h1>
            <Badge variant="secondary">{contacts.length} total</Badge>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-1" />
                Add Contact
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Contact</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Name *</Label>
                  <Input
                    value={newContact.name}
                    onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                    placeholder="John Smith"
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={newContact.email}
                    onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={newContact.phone}
                    onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                    placeholder="+1 555 123 4567"
                  />
                </div>
                <div>
                  <Label>Tags (comma-separated)</Label>
                  <Input
                    value={newContact.tags}
                    onChange={(e) => setNewContact({ ...newContact, tags: e.target.value })}
                    placeholder="hot-lead, hvac"
                  />
                </div>
                <Button onClick={handleCreateContact} className="w-full" disabled={!newContact.name}>
                  Create Contact
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="p-4">
        <PageChatHeader
          pageContext="Contacts page - managing customer contact information"
          placeholder="Ask about your contacts, segmentation, or outreach strategies..."
          quickActions={[
            { label: "Find duplicates", prompt: "Help me find duplicate contacts" },
            { label: "Segment contacts", prompt: "How should I segment my contacts for better outreach?" },
            { label: "Clean up data", prompt: "What contact data should I clean up?" },
          ]}
        />
      </div>

      <div className="flex h-[calc(100vh-180px)]">
        {/* Contact List */}
        <div className="w-80 border-r flex flex-col bg-card/50">
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search contacts..."
                className="pl-9"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            {filteredContacts.length === 0 ? (
              <div className="p-4">
                <EmptyState
                  variant="contacts"
                  title="No contacts found"
                  description={searchQuery ? "Try a different search term" : "Add your first contact to get started"}
                  action={!searchQuery ? {
                    label: "Add Contact",
                    onClick: () => setIsCreateOpen(true)
                  } : undefined}
                />
              </div>
            ) : (
              filteredContacts.map((contact) => (
                <div
                  key={contact.id}
                  onClick={() => {
                    setSelectedContact(contact);
                    setEditForm(contact);
                    setIsEditing(false);
                  }}
                  className={`p-3 border-b cursor-pointer hover:bg-muted/50 transition-colors ${
                    selectedContact?.id === contact.id ? "bg-muted border-l-2 border-l-primary" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center flex-shrink-0">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{contact.name || "Unnamed"}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {contact.email || contact.phone || "No contact info"}
                      </p>
                    </div>
                  </div>
                  {contact.tags && contact.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {contact.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} className={`text-xs ${getTagColor(tag)}`}>
                          {tag}
                        </Badge>
                      ))}
                      {contact.tags.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{contact.tags.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </ScrollArea>
        </div>

        {/* Contact Details */}
        <div className="flex-1 p-6 overflow-y-auto">
          {selectedContact ? (
            <div className="max-w-2xl mx-auto space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-t-lg">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Contact Details</CardTitle>
                    <div className="flex gap-2">
                      {isEditing ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                            <X className="h-4 w-4 mr-1" />
                            Cancel
                          </Button>
                          <Button size="sm" onClick={handleUpdateContact}>
                            <Save className="h-4 w-4 mr-1" />
                            Save
                          </Button>
                        </>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                          <Edit2 className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-6">
                  {isEditing ? (
                    <>
                      <div>
                        <Label>Name</Label>
                        <Input
                          value={editForm.name || ""}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Email</Label>
                        <Input
                          value={editForm.email || ""}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Phone</Label>
                        <Input
                          value={editForm.phone || ""}
                          onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Notes</Label>
                        <Textarea
                          value={editForm.notes || ""}
                          onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                          rows={3}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-4">
                        <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
                          <User className="h-10 w-10 text-primary" />
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold">{selectedContact.name || "Unnamed"}</h2>
                          <p className="text-sm text-muted-foreground">
                            Added {new Date(selectedContact.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-3 pt-4">
                        {selectedContact.email && (
                          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                            <Mail className="h-5 w-5 text-blue-500" />
                            <span className="text-sm">{selectedContact.email}</span>
                          </div>
                        )}
                        {selectedContact.phone && (
                          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                            <Phone className="h-5 w-5 text-green-500" />
                            <span className="text-sm">{selectedContact.phone}</span>
                          </div>
                        )}
                        {selectedContact.whatsapp_id && (
                          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                            <MessageSquare className="h-5 w-5 text-emerald-500" />
                            <span className="text-sm">WhatsApp: {selectedContact.whatsapp_id}</span>
                          </div>
                        )}
                      </div>

                      {selectedContact.tags && selectedContact.tags.length > 0 && (
                        <div className="pt-4">
                          <div className="flex items-center gap-2 mb-3 text-sm text-muted-foreground">
                            <Tag className="h-4 w-4" />
                            <span>Tags</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {selectedContact.tags.map((tag) => (
                              <Badge key={tag} className={getTagColor(tag)}>
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedContact.notes && (
                        <div className="pt-4 border-t">
                          <p className="text-sm text-muted-foreground mb-2">Notes</p>
                          <p className="text-sm bg-muted/30 p-3 rounded-lg">{selectedContact.notes}</p>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>

              {!isEditing && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {selectedContact.phone && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickMessage(selectedContact, "sms")}
                        className="gap-1.5"
                      >
                        <Phone className="h-4 w-4 text-blue-500" />
                        Send SMS
                      </Button>
                    )}
                    {selectedContact.whatsapp_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickMessage(selectedContact, "whatsapp")}
                        className="gap-1.5"
                      >
                        <MessageSquare className="h-4 w-4 text-green-500" />
                        WhatsApp
                      </Button>
                    )}
                    {selectedContact.email && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickMessage(selectedContact, "email")}
                        className="gap-1.5"
                      >
                        <Mail className="h-4 w-4 text-purple-500" />
                        Email
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate("/admin/inbox")}
                      className="gap-1.5"
                    >
                      <MessageSquare className="h-4 w-4" />
                      View Conversations
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <EmptyState
                variant="contacts"
                title="Select a contact"
                description="Choose a contact from the list to view their details and take actions"
                action={contacts.length === 0 ? {
                  label: "Add First Contact",
                  onClick: () => setIsCreateOpen(true)
                } : undefined}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
