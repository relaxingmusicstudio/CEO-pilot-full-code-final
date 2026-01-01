import React, { useMemo, useState } from "react";
import {
  DEFAULT_DOMAINS,
  DOMAIN_LABELS,
  buildCEOSignals,
  buildContributionSignals,
  appendContribution,
  appendInteractionEvent,
  appendSearchEvent,
  loadContributions,
  loadLedgerTail,
  loadLedgerPage,
  runSearch,
} from "./core";
import type {
  ContributionKind,
  ContributionSource,
  LedgerPage,
  SearchInteractionType,
  SearchResponse,
  SignalDomainId,
} from "./core";

const OWNER_ID = "public";

const TABS = [
  { id: "search", label: "Home Search" },
  { id: "signals", label: "Signal Explorer" },
  { id: "evidence", label: "Evidence View" },
  { id: "opportunities", label: "Opportunity Feed" },
  { id: "contributions", label: "User Contributions" },
  { id: "transparency", label: "Transparency" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const safeInitialLedger = (): LedgerPage => loadLedgerTail(OWNER_ID, 6);
const safeInitialContribs = () => loadContributions(OWNER_ID);

const defaultQuery = "HVAC response times in Austin";

const App = () => {
  const [activeTab, setActiveTab] = useState<TabId>("search");
  const [query, setQuery] = useState(defaultQuery);
  const [selectedDomains, setSelectedDomains] = useState<SignalDomainId[]>(DEFAULT_DOMAINS);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [searchEntryId, setSearchEntryId] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [ledgerPage, setLedgerPage] = useState<LedgerPage>(safeInitialLedger);
  const [ledgerCursor, setLedgerCursor] = useState<string | null>(ledgerPage.nextCursor);
  const [contributions, setContributions] = useState(safeInitialContribs);
  const [contribKind, setContribKind] = useState<ContributionKind>("submission");
  const [contribSource, setContribSource] = useState<ContributionSource>("link");
  const [contribLabel, setContribLabel] = useState("");
  const [contribNotes, setContribNotes] = useState("");
  const [contribTags, setContribTags] = useState("");
  const [contribLocation, setContribLocation] = useState("");

  const domainToggles = useMemo(
    () =>
      DEFAULT_DOMAINS.map((domain) => ({
        id: domain,
        label: DOMAIN_LABELS[domain],
        active: selectedDomains.includes(domain),
      })),
    [selectedDomains]
  );

  const ceoSignals = useMemo(() => (response ? buildCEOSignals(response) : []), [response]);

  const handleToggleDomain = (domain: SignalDomainId) => {
    setSelectedDomains((prev) =>
      prev.includes(domain) ? prev.filter((item) => item !== domain) : [...prev, domain]
    );
  };

  const refreshLedgerTail = () => {
    const page = loadLedgerTail(OWNER_ID, 6);
    setLedgerPage(page);
    setLedgerCursor(page.nextCursor);
  };

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setIsSearching(true);

    const submissionSignals = buildContributionSignals(contributions, "submission", "user_submissions");
    const observationSignals = buildContributionSignals(contributions, "observation", "observations");

    const nextResponse = await runSearch(trimmed, {
      domains: selectedDomains,
      latencyMs: 220,
      extraSignals: {
        user_submissions: submissionSignals,
        observations: observationSignals,
      },
    });

    setResponse(nextResponse);

    const entry = appendSearchEvent(OWNER_ID, nextResponse);
    setSearchEntryId(entry.entryId);
    refreshLedgerTail();
    setIsSearching(false);
  };

  const handleInteraction = (type: SearchInteractionType) => {
    if (!searchEntryId || !response) return;
    appendInteractionEvent(OWNER_ID, searchEntryId, type, response.decision.decision_id);
    refreshLedgerTail();
  };

  const handleLoadOlderLedger = () => {
    if (!ledgerCursor) return;
    const page = loadLedgerPage(OWNER_ID, 6, ledgerCursor);
    setLedgerPage(page);
    setLedgerCursor(page.nextCursor);
  };

  const handleAddContribution = () => {
    const label = contribLabel.trim();
    if (!label) return;

    const tags = contribTags
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const entry = appendContribution(OWNER_ID, {
      kind: contribKind,
      source: contribSource,
      label,
      notes: contribNotes.trim(),
      tags,
      location: contribLocation.trim() || undefined,
    });

    setContributions((prev) => [...prev, entry]);
    setContribLabel("");
    setContribNotes("");
    setContribTags("");
    setContribLocation("");
  };

  return (
    <div className="app">
      <section className="hero">
        <div className="top-bar">
          <div>
            <div className="status-pill">Search Pilot</div>
            <h1>Search is the Intelligence OS</h1>
            <p>Search is free. Capability transfer is not. Search never executes actions.</p>
          </div>
          <div className="flow">
            <div>Query to intent to domains to decision to evidence summary to ledger.</div>
            <div>Provider agnostic. Deterministic mocks in place.</div>
          </div>
        </div>
        <div className="nav">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-button ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === "search" && (
        <section className="grid">
          <div className="panel">
            <h2>Natural language search</h2>
            <p>Mock mode is default. All decisions are read only until a capability transfer is approved.</p>
            <div className="input-row">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Describe the market, service, or signal you want"
              />
              <button className="button" onClick={handleSearch} type="button" disabled={isSearching}>
                {isSearching ? "Searching" : "Run Search"}
              </button>
            </div>
            <div className="footer-note">Ambiguous intent triggers safe framing, not refusal.</div>
          </div>

          <div className="grid two">
            <div className="panel">
              <h2>Intent primitives</h2>
              <p>{response ? response.explanation : "Run a search to see intent breakdown."}</p>
              <div className="grid">
                {response?.intent.primitives.map((item, index) => (
                  <span key={`${item.type}-${index}`} className="tag">
                    {item.type}: {item.value} ({Math.round(item.confidence * 100)} percent)
                  </span>
                ))}
                {!response && <span className="tag">No intent yet</span>}
              </div>
            </div>

            <div className="panel">
              <h2>Domains in play</h2>
              <p>Search never depends on a single provider. Toggle domains to see impact.</p>
              <div className="grid">
                {domainToggles.map((domain) => (
                  <label key={domain.id} className="result-card" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={domain.active}
                      onChange={() => handleToggleDomain(domain.id)}
                    />
                    <strong>{domain.label}</strong>
                    <span className="meta">Deterministic mock signals</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="panel">
            <h2>Decision</h2>
            <p>Search resolves into a single decision object with confidence and assumptions.</p>
            <div className="grid two">
              {response ? (
                <div className="result-card">
                  <h3>Recommendation</h3>
                  <p>{response.decision.recommendation}</p>
                  <div className="meta">Status: {response.decision.status}</div>
                  <div className="meta">
                    Confidence: {Math.round(response.decision.confidence * 100)}%
                  </div>
                  <div className="meta">Reasoning: {response.decision.reasoning}</div>
                  <div className="meta">Assumptions: {response.decision.assumptions.join("; ")}</div>
                  <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
                    <button className="button" type="button" onClick={() => handleInteraction("save")}>
                      Save decision
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={() => handleInteraction("ignore")}
                    >
                      Ignore
                    </button>
                  </div>
                </div>
              ) : (
                <div className="result-card">No decision yet. Run a search to begin.</div>
              )}
              {response && (
                <div className="result-card">
                  <h3>Evidence summary</h3>
                  <div className="meta">Results: {response.evidence_summary.resultCount}</div>
                  <div className="meta">
                    Domains:{" "}
                    {response.evidence_summary.domainCounts
                      .map((entry) => `${entry.domain.replace(/_/g, " ")}: ${entry.count}`)
                      .join(", ")}
                  </div>
                  <div className="meta">
                    Categories:{" "}
                    {response.evidence_summary.categoryHighlights.length > 0
                      ? response.evidence_summary.categoryHighlights.join(", ")
                      : "None"}
                  </div>
                  {response.evidence_summary.notes.map((note, index) => (
                    <div key={index} className="meta">{note}</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="panel">
            <h2>Learning ledger (append only)</h2>
            <p>Search and interaction events are stored without deletion or mutation.</p>
            <div className="grid two">
              {ledgerPage.entries.map((entry) => (
                <div key={entry.entryId} className="ledger-item">
                  <strong>{entry.eventType === "search" ? "Search" : "Interaction"}</strong>
                  <div className="meta">Entry {entry.entryId}</div>
                  {entry.eventType === "search" ? (
                    <>
                      <div>Query: {entry.query}</div>
                      <div>Domains: {entry.domains.join(", ")}</div>
                      <div>Decision: {entry.decision.recommendation}</div>
                      <div>Status: {entry.decision.status}</div>
                      <div>Evidence count: {entry.evidence_summary.resultCount}</div>
                    </>
                  ) : (
                    <>
                      <div>Search entry: {entry.searchEntryId}</div>
                      <div>Action: {entry.interaction.type}</div>
                      <div>Decision id: {entry.interaction.decisionId}</div>
                    </>
                  )}
                </div>
              ))}
              {ledgerPage.entries.length === 0 && <div className="ledger-item">No ledger entries yet.</div>}
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="button ghost" type="button" onClick={handleLoadOlderLedger} disabled={!ledgerCursor}>
                Load older entries
              </button>
            </div>
          </div>
        </section>
      )}

      {activeTab === "signals" && (
        <section className="grid two">
          <div className="panel">
            <h2>Signal Explorer</h2>
            <p>Toggle domains to inspect coverage. Search remains deterministic in mock mode.</p>
            <div className="grid">
              {domainToggles.map((domain) => (
                <label key={domain.id} className="result-card" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={domain.active}
                    onChange={() => handleToggleDomain(domain.id)}
                  />
                  <strong>{domain.label}</strong>
                  <span className="meta">Provider agnostic domain</span>
                </label>
              ))}
            </div>
          </div>

          <div className="panel">
            <h2>Confidence framing</h2>
            <p>Confidence reflects intent clarity and domain coverage.</p>
            {response ? (
              <div className="grid">
                <div className="result-card">
                  <strong>Decision confidence</strong>
                  <div className="meta">
                    {Math.round(response.decision.confidence * 100)}% ({response.decision.status})
                  </div>
                  <div className="meta">{response.decision.reasoning}</div>
                </div>
                <div className="result-card">
                  <strong>Domain coverage</strong>
                  {response.evidence_summary.domainCounts.map((entry) => (
                    <div key={entry.domain} className="meta">
                      {entry.domain.replace(/_/g, " ")}: {entry.count}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="result-card">Run a search to see confidence framing.</div>
            )}
          </div>
        </section>
      )}

      {activeTab === "evidence" && (
        <section className="grid two">
          <div className="panel">
            <h2>Evidence view</h2>
            <p>Evidence is summarized; raw lists and links stay internal.</p>
            {response ? (
              <div className="grid">
                <div className="result-card">
                  <strong>Categories</strong>
                  <div className="meta">
                    {response.evidence_summary.categoryHighlights.length > 0
                      ? response.evidence_summary.categoryHighlights.join(", ")
                      : "None yet"}
                  </div>
                </div>
                <div className="result-card">
                  <strong>Notes</strong>
                  {response.evidence_summary.notes.map((note, index) => (
                    <div key={index} className="meta">{note}</div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="result-card">No evidence loaded.</div>
            )}
          </div>

          <div className="panel">
            <h2>Selected evidence</h2>
            {response ? (
              <div className="grid">
                <div className="result-card">
                  <h3>Decision context</h3>
                  <p>{response.decision.reasoning}</p>
                  <div className="meta">
                    Assumptions: {response.decision.assumptions.join("; ")}
                  </div>
                </div>
                <div className="result-card">
                  <h3>Domain coverage</h3>
                  {response.evidence_summary.domainCounts.map((entry) => (
                    <div key={entry.domain} className="meta">
                      {DOMAIN_LABELS[entry.domain]}: {entry.count}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="result-card">Run a search to see evidence context.</div>
            )}
          </div>
        </section>
      )}

      {activeTab === "opportunities" && (
        <section className="grid two">
          <div className="panel">
            <h2>Opportunity feed</h2>
            <p>CEO Pilot can subscribe to these signals but never controls Search Pilot.</p>
            <div className="grid">
              {ceoSignals.map((signal) => (
                <div key={signal.id} className="result-card">
                  <strong>{signal.title}</strong>
                  <div className="meta">Type: {signal.type}</div>
                  <p>{signal.summary}</p>
                  <div className="meta">Confidence {Math.round(signal.confidence * 100)} percent</div>
                </div>
              ))}
              {ceoSignals.length === 0 && (
                <div className="result-card">Run a search to generate CEO signals.</div>
              )}
            </div>
          </div>

          <div className="panel">
            <h2>Boundary</h2>
            <p>Search remains read only. CEO Pilot receives signals but cannot execute actions from here.</p>
            <div className="flow">
              <div>Search emits opportunities, skill demand, and local gaps.</div>
              <div>CEO Pilot subscribes to the feed and chooses next steps.</div>
            </div>
          </div>
        </section>
      )}

      {activeTab === "contributions" && (
        <section className="grid two">
          <div className="panel">
            <h2>User contributions</h2>
            <p>Add a link, upload note, or tagged observation. Submissions append to the ledger.</p>
            <div className="input-row">
              <label>
                <div className="meta">Contribution type</div>
                <select
                  className="select"
                  value={contribKind}
                  onChange={(event) => setContribKind(event.target.value as ContributionKind)}
                >
                  <option value="submission">User submission</option>
                  <option value="observation">Observation</option>
                </select>
              </label>
              <label>
                <div className="meta">Source</div>
                <select
                  className="select"
                  value={contribSource}
                  onChange={(event) => setContribSource(event.target.value as ContributionSource)}
                >
                  <option value="link">Link</option>
                  <option value="upload">Upload</option>
                  <option value="csv">CSV</option>
                  <option value="note">Note</option>
                </select>
              </label>
              <input
                value={contribLabel}
                onChange={(event) => setContribLabel(event.target.value)}
                placeholder="Label"
              />
              <input
                value={contribLocation}
                onChange={(event) => setContribLocation(event.target.value)}
                placeholder="Location (optional)"
              />
              <textarea
                rows={3}
                value={contribNotes}
                onChange={(event) => setContribNotes(event.target.value)}
                placeholder="Notes or link"
              />
              <input
                value={contribTags}
                onChange={(event) => setContribTags(event.target.value)}
                placeholder="Tags (comma separated)"
              />
              <button className="button" type="button" onClick={handleAddContribution}>
                Add contribution
              </button>
            </div>
          </div>

          <div className="panel">
            <h2>Contribution ledger</h2>
            <div className="grid">
              {contributions.map((entry) => (
                <div key={entry.id} className="result-card">
                  <strong>{entry.label}</strong>
                  <div className="meta">{entry.kind} from {entry.source}</div>
                  <div className="meta">{entry.location ?? "No location"}</div>
                  <p>{entry.notes || "No notes provided."}</p>
                  <div className="meta">Tags: {entry.tags.join(", ") || "none"}</div>
                </div>
              ))}
              {contributions.length === 0 && (
                <div className="result-card">No contributions yet. Add one to extend the signal pool.</div>
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === "transparency" && (
        <section className="grid two">
          <div className="panel">
            <h2>Search Bill of Rights</h2>
            <ul>
              <li>Search is read only and never executes actions.</li>
              <li>No hidden suppression or shadow ranking.</li>
              <li>No persuasion optimization or behavioral dark patterns.</li>
              <li>Signals are provider agnostic and replaceable.</li>
              <li>Append only ledger with clear evidence trail.</li>
            </ul>
          </div>
          <div className="panel">
            <h2>What this is and is not</h2>
            <div className="grid">
              <div className="result-card">
                <strong>What this is</strong>
                <ul>
                  <li>Search intelligence layer with deterministic mocks.</li>
                  <li>Signal domains that can be swapped without breaking flow.</li>
                  <li>Transparent scoring that explains confidence.</li>
                  <li>Insight may replace instruction, never reverse.</li>
                </ul>
              </div>
              <div className="result-card">
                <strong>What this is not</strong>
                <ul>
                  <li>Not an execution engine or automation layer.</li>
                  <li>Not a wrapper around a single provider.</li>
                  <li>Not a behavioral manipulation system.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default App;
