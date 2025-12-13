import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Search, User, Phone, Mail, MessageSquare, Tag, Edit2, X, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMessaging, Contact } from "@/hooks/useMessaging";

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

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    const data = await fetchContacts();
    setContacts(data);
  };

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin-analytics")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
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
      </header>

      <div className="flex h-[calc(100vh-57px)]">
        {/* Contact List */}
        <div className="w-80 border-r flex flex-col">
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
              <div className="p-4 text-center text-muted-foreground">
                <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No contacts found</p>
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
                    selectedContact?.id === contact.id ? "bg-muted" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
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
                        <Badge key={tag} variant="outline" className="text-xs">
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
        <div className="flex-1 p-6">
          {selectedContact ? (
            <div className="max-w-2xl mx-auto space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
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
                </CardHeader>
                <CardContent className="space-y-4">
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
                      <div className="flex items-center gap-3">
                        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                          <h2 className="text-xl font-semibold">{selectedContact.name || "Unnamed"}</h2>
                          <p className="text-sm text-muted-foreground">
                            Created {new Date(selectedContact.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-3">
                        {selectedContact.email && (
                          <div className="flex items-center gap-3 text-sm">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span>{selectedContact.email}</span>
                          </div>
                        )}
                        {selectedContact.phone && (
                          <div className="flex items-center gap-3 text-sm">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span>{selectedContact.phone}</span>
                          </div>
                        )}
                        {selectedContact.whatsapp_id && (
                          <div className="flex items-center gap-3 text-sm">
                            <MessageSquare className="h-4 w-4 text-green-500" />
                            <span>WhatsApp: {selectedContact.whatsapp_id}</span>
                          </div>
                        )}
                      </div>

                      {selectedContact.tags && selectedContact.tags.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-2 text-sm text-muted-foreground">
                            <Tag className="h-4 w-4" />
                            <span>Tags</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {selectedContact.tags.map((tag) => (
                              <Badge key={tag} variant="secondary">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedContact.notes && (
                        <div>
                          <p className="text-sm text-muted-foreground mb-1">Notes</p>
                          <p className="text-sm">{selectedContact.notes}</p>
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
                      >
                        <Phone className="h-4 w-4 mr-1" />
                        Send SMS
                      </Button>
                    )}
                    {selectedContact.whatsapp_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickMessage(selectedContact, "whatsapp")}
                      >
                        <MessageSquare className="h-4 w-4 mr-1 text-green-500" />
                        Send WhatsApp
                      </Button>
                    )}
                    {selectedContact.email && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickMessage(selectedContact, "email")}
                      >
                        <Mail className="h-4 w-4 mr-1 text-blue-500" />
                        Send Email
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate("/admin/inbox")}
                    >
                      <MessageSquare className="h-4 w-4 mr-1" />
                      View Conversations
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <User className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium">Select a contact</h3>
                <p className="text-sm">Choose a contact from the list to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
