import React, { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { computeIdentityKey } from "@/lib/spine";
import { mergeLeads, recordMergeEvent } from "@/lib/revenueKernel/leadMerge";
import { supabase } from "@/integrations/supabase/client";
import { buildReachabilityProfile } from "@/lib/revenueKernel/reachability";
import { format } from "date-fns";

type LeadStatus =
  | "lead_source"
  | "enrichment"
  | "outreach"
  | "qualification"
  | "booked"
  | "showed"
  | "won"
  | "lost";

type Lead = {
  id: string;
  name: string;
  clinic: string;
  city: string;
  phone: string;
  email: string;
  ig: string;
  notes: string;
  status: LeadStatus;
  createdAt: string;
};

type ConsultStatus = "scheduled" | "showed" | "no_show" | "rescheduled" | "cancelled";

type Consult = {
  id: string;
  leadId: string;
  status: ConsultStatus;
  consultAt: string;
  notes: string;
};

type Feedback = { id: string; text: string; score: number };

const STAGES: LeadStatus[] = [
  "lead_source",
  "enrichment",
  "outreach",
  "qualification",
  "booked",
  "showed",
  "won",
  "lost",
];

const STORAGE_KEY = "plastic-surgeon-pipeline";

const isMockMode = () =>
  import.meta.env.VITE_MOCK_AUTH === "true" ||
  (typeof window !== "undefined" && window.localStorage.getItem("VITE_MOCK_AUTH") === "true");

export default function PlasticSurgeonPipeline() {
  const { isAuthenticated, userId } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [consults, setConsults] = useState<Consult[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([
    { id: "creative-1", text: "IG DM: Free consult for rhinoplasty candidates", score: 0 },
    { id: "creative-2", text: "SMS: 15-min virtual consult slots this week", score: 0 },
  ]);
  const [adSpend, setAdSpend] = useState<number>(0);
  const mock = useMemo(() => isMockMode(), []);

  useEffect(() => {
    if (mock) {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setLeads(parsed.leads || []);
          setConsults(parsed.consults || []);
          setFeedback((prev) => parsed.feedback || prev);
          setAdSpend(parsed.adSpend || 0);
        } catch {
          // ignore parse error
        }
      }
    }
  }, [mock]);

  useEffect(() => {
    if (mock) {
      const payload = { leads, consults, feedback, adSpend };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    }
  }, [leads, consults, feedback, adSpend, mock]);

  const upsertLead = async (lead: Lead) => {
    if (mock) {
      setLeads((prev) => {
        const identityKey = computeIdentityKey(userId, null);
        const incoming = {
          id: lead.id,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          created_at: lead.createdAt,
          data: { clinic: lead.clinic, city: lead.city, notes: lead.notes, ig: lead.ig },
        };
        const { merged, mergeEvent } = mergeLeads(
          prev.map((item) => ({
            id: item.id,
            name: item.name,
            email: item.email,
            phone: item.phone,
            created_at: item.createdAt,
            data: { clinic: item.clinic, city: item.city, notes: item.notes, ig: item.ig },
          })),
          incoming,
          lead.createdAt
        );
        if (!mergeEvent) {
          return [...prev, lead];
        }
        recordMergeEvent(identityKey, mergeEvent);
        return prev.map((item) => {
          if (item.id !== merged.id) return item;
          return {
            ...item,
            name: merged.name || item.name,
            email: merged.email || item.email,
            phone: merged.phone || item.phone,
          };
        });
      });
    } else {
      setLeads((prev) => [...prev, lead]);
    }
    if (!mock && userId) {
      await supabase.from("leads").insert({
        id: lead.id,
        user_id: userId,
        name: lead.name,
        clinic: lead.clinic,
        city: lead.city,
        phone: lead.phone,
        email: lead.email,
        ig_handle: lead.ig,
        notes: lead.notes,
        status: lead.status,
      });
    }
  };

  const advanceLead = (id: string) => {
    setLeads((prev) =>
      prev.map((lead) => {
        if (lead.id !== id) return lead;
        const currentIdx = STAGES.indexOf(lead.status);
        const nextStatus = STAGES[Math.min(currentIdx + 1, STAGES.length - 1)];
        return { ...lead, status: nextStatus };
      })
    );
  };

  const addConsult = async (consult: Consult) => {
    setConsults((prev) => [...prev, consult]);
    if (!mock && userId) {
      await supabase.from("consults").insert({
        id: consult.id,
        user_id: userId,
        lead_id: consult.leadId,
        status: consult.status,
        consult_at: consult.consultAt,
        notes: consult.notes,
      });
    }
  };

  const bookedCount = consults.length;
  const showedCount = consults.filter((c) => c.status === "showed").length;
  const revenue = showedCount * 450;
  const netProfit = revenue - adSpend;
  const showRate = bookedCount === 0 ? 0 : Math.round((showedCount / bookedCount) * 100);

  const topFeedback = [...feedback].sort((a, b) => b.score - a.score)[0];

  const [leadForm, setLeadForm] = useState({
    name: "",
    clinic: "",
    city: "",
    phone: "",
    email: "",
    ig: "",
    notes: "",
  });

  const [consultForm, setConsultForm] = useState({
    leadId: "",
    date: "",
    status: "scheduled" as ConsultStatus,
    notes: "",
  });

  const [script, setScript] = useState("Tell me about your ideal outcome and timing for surgery.");
  const [questionBudget, setQuestionBudget] = useState("What is your budget for this procedure?");
  const [questionTimeline, setQuestionTimeline] = useState("When are you looking to schedule?");
  const [questionLocation, setQuestionLocation] = useState("Where will you travel from?");
  const reachabilityProfile = useMemo(() => {
    if (leads.length === 0) return null;
    const lead = leads[0];
    return buildReachabilityProfile({
      phones: lead.phone ? [{ e164: lead.phone, type: "unknown", verified: false }] : [],
      email: lead.email,
      consent_status: "unknown",
      do_not_contact: false,
    });
  }, [leads]);

  if (!isAuthenticated) return null;

  return (
    <div className="container py-8" data-testid="plastic-pipeline-page">
      <Helmet>
        <title>Plastic Surgeon Lead Engine</title>
      </Helmet>
      <Card>
        <CardHeader>
          <CardTitle>Plastic Surgeon Lead Engine</CardTitle>
          <CardDescription>Manual test harness for lead capture → booking → analytics.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="capture">
            <TabsList>
              <TabsTrigger value="capture">Lead Capture</TabsTrigger>
              <TabsTrigger value="qualification">Qualification Script</TabsTrigger>
              <TabsTrigger value="booking">Booking</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
            </TabsList>

            <TabsContent value="capture">
              <div className="grid gap-4 md:grid-cols-2" data-testid="lead-capture-tab">
                <div className="space-y-3">
                  <Input data-testid="lead-name" placeholder="Lead name" value={leadForm.name} onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })} />
                  <Input data-testid="lead-clinic" placeholder="Clinic" value={leadForm.clinic} onChange={(e) => setLeadForm({ ...leadForm, clinic: e.target.value })} />
                  <Input data-testid="lead-city" placeholder="City" value={leadForm.city} onChange={(e) => setLeadForm({ ...leadForm, city: e.target.value })} />
                  <Input data-testid="lead-phone" placeholder="Phone" value={leadForm.phone} onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })} />
                  <Input data-testid="lead-email" placeholder="Email" value={leadForm.email} onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })} />
                  <Input data-testid="lead-ig" placeholder="IG handle" value={leadForm.ig} onChange={(e) => setLeadForm({ ...leadForm, ig: e.target.value })} />
                  <Textarea data-testid="lead-notes" placeholder="Notes" value={leadForm.notes} onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })} />
                  <Button
                    data-testid="create-lead"
                    onClick={() => {
                      if (!leadForm.name) return;
                      const newLead: Lead = {
                        id: crypto.randomUUID(),
                        ...leadForm,
                        status: "lead_source",
                        createdAt: new Date().toISOString(),
                      };
                      upsertLead(newLead);
                      setLeadForm({
                        name: "",
                        clinic: "",
                        city: "",
                        phone: "",
                        email: "",
                        ig: "",
                        notes: "",
                      });
                    }}
                  >
                    Create lead
                  </Button>
                </div>

                <div className="space-y-3">
                  <div className="text-sm text-muted-foreground">Pipeline stages: Lead Source → Enrichment → Outreach → Qualification → Booked → Showed → Won/Lost</div>
                <div className="space-y-2">
                  {leads.map((lead) => (
                    <div
                        key={lead.id}
                        data-testid="lead-row"
                        className="border rounded-md p-3 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-semibold">{lead.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {lead.city} • {lead.clinic} • {lead.status}
                          </div>
                        </div>
                        <Button size="sm" variant="outline" data-testid={`advance-${lead.id}`} onClick={() => advanceLead(lead.id)}>
                          Advance
                        </Button>
                      </div>
                    ))}
                  </div>
                  {reachabilityProfile && (
                    <div
                      className="mt-4 rounded-md border p-3 text-sm"
                      data-testid="reachability-panel"
                    >
                      <div className="font-semibold">Reachability</div>
                      <div>Best channel: {reachabilityProfile.best_channel}</div>
                      <div>Fallbacks: {reachabilityProfile.fallback_order.join(", ")}</div>
                      <div>Consent: {reachabilityProfile.consent_status}</div>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="qualification">
              <div className="space-y-4" data-testid="qualification-tab">
                <Textarea value={script} onChange={(e) => setScript(e.target.value)} />
                <Input value={questionBudget} onChange={(e) => setQuestionBudget(e.target.value)} />
                <Input value={questionTimeline} onChange={(e) => setQuestionTimeline(e.target.value)} />
                <Input value={questionLocation} onChange={(e) => setQuestionLocation(e.target.value)} />
              </div>
            </TabsContent>

            <TabsContent value="booking">
              <div className="space-y-4" data-testid="booking-tab">
                <Select
                  value={consultForm.leadId}
                  onValueChange={(v) => setConsultForm({ ...consultForm, leadId: v })}
                >
                  <SelectTrigger data-testid="consult-lead-select">
                    <SelectValue placeholder="Select lead" />
                  </SelectTrigger>
                  <SelectContent>
                    {leads.map((lead) => (
                      <SelectItem key={lead.id} value={lead.id}>
                        {lead.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  data-testid="consult-datetime"
                  type="datetime-local"
                  value={consultForm.date}
                  onChange={(e) => setConsultForm({ ...consultForm, date: e.target.value })}
                />
                <Select
                  value={consultForm.status}
                  onValueChange={(v) => setConsultForm({ ...consultForm, status: v as ConsultStatus })}
                >
                  <SelectTrigger data-testid="consult-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="showed">Showed</SelectItem>
                    <SelectItem value="no_show">No-show</SelectItem>
                    <SelectItem value="rescheduled">Rescheduled</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea
                  data-testid="consult-notes"
                  placeholder="Notes"
                  value={consultForm.notes}
                  onChange={(e) => setConsultForm({ ...consultForm, notes: e.target.value })}
                />
                <Button
                  data-testid="save-consult"
                  onClick={() => {
                    if (!consultForm.leadId) return;
                    const newConsult: Consult = {
                      id: crypto.randomUUID(),
                      leadId: consultForm.leadId,
                      status: consultForm.status,
                      consultAt: consultForm.date || new Date().toISOString(),
                      notes: consultForm.notes,
                    };
                    addConsult(newConsult);
                    setConsultForm({ leadId: "", date: "", status: "scheduled", notes: "" });
                  }}
                >
                  Save consult
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="analytics">
              <div className="grid gap-4 md:grid-cols-2" data-testid="analytics-tab">
                <div className="space-y-2">
                  <div data-testid="kpi-consults">Consults booked: {bookedCount}</div>
                  <div data-testid="kpi-show-rate">Show rate: {showRate}%</div>
                  <div data-testid="kpi-revenue">Revenue: ${revenue}</div>
                  <div className="flex items-center gap-2">
                    <span>Ad spend:</span>
                    <Input
                      data-testid="ad-spend-input"
                      type="number"
                      value={adSpend}
                      onChange={(e) => setAdSpend(Number(e.target.value) || 0)}
                      className="w-32"
                    />
                  </div>
                  <div data-testid="kpi-net-profit">Net profit: ${netProfit}</div>
                </div>
                <div className="space-y-3">
                  <div className="font-semibold">Creative Feedback</div>
                  {feedback.map((item) => (
                    <div key={item.id} className="border rounded-md p-3" data-testid={`feedback-${item.id}`}>
                      <div className="text-sm mb-2">{item.text}</div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`feedback-up-${item.id}`}
                          onClick={() =>
                            setFeedback((prev) =>
                              prev.map((f) => (f.id === item.id ? { ...f, score: f.score + 1 } : f))
                            )
                          }
                        >
                          👍
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`feedback-down-${item.id}`}
                          onClick={() =>
                            setFeedback((prev) =>
                              prev.map((f) => (f.id === item.id ? { ...f, score: f.score - 1 } : f))
                            )
                          }
                        >
                          👎
                        </Button>
                        <span className="text-xs text-muted-foreground">Score: {item.score}</span>
                      </div>
                    </div>
                  ))}
                  <div data-testid="feedback-top" className="text-sm text-muted-foreground">
                    Top performer: {topFeedback?.text ?? "N/A"}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
