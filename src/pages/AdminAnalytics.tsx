import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Users, MessageSquare, TrendingUp, Send, Loader2, Brain, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCEOAgent } from "@/hooks/useCEOAgent";

const AdminAnalytics = () => {
  const navigate = useNavigate();
  const { askCEO, isLoading, lastResponse, getWeeklySummary, getTrafficAnalysis, getConversionInsights, getLeadQualityReport } = useCEOAgent();
  const [query, setQuery] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "ceo"; content: string }>>([]);

  // Load initial summary on mount
  useEffect(() => {
    getWeeklySummary();
  }, []);

  // Update chat when response comes in
  useEffect(() => {
    if (lastResponse?.response) {
      setChatHistory(prev => [...prev, { role: "ceo", content: lastResponse.response }]);
    }
  }, [lastResponse]);

  const handleSend = async () => {
    if (!query.trim() || isLoading) return;
    
    setChatHistory(prev => [...prev, { role: "user", content: query }]);
    setQuery("");
    await askCEO(query);
  };

  const handlePresetQuery = async (queryFn: () => Promise<any>, label: string) => {
    setChatHistory(prev => [...prev, { role: "user", content: label }]);
    await queryFn();
  };

  const metrics = lastResponse?.metrics;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate("/")} className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Site
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                <Brain className="w-8 h-8 text-primary" />
                CEO Agent Dashboard
              </h1>
              <p className="text-muted-foreground mt-1">AI-powered business intelligence for ApexLocal360</p>
            </div>
          </div>
        </div>

        {/* Metrics Cards */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Visitors</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.totalVisitors}</div>
                <p className="text-xs text-muted-foreground">Last 7 days</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Conversations</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.totalConversations}</div>
                <p className="text-xs text-muted-foreground">Chatbot interactions</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Total Leads</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.totalLeads}</div>
                <div className="flex gap-2 text-xs mt-1">
                  <span className="text-green-500">{metrics.hotLeads} hot</span>
                  <span className="text-yellow-500">{metrics.warmLeads} warm</span>
                  <span className="text-muted-foreground">{metrics.coldLeads} cold</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metrics.conversionRate}%</div>
                <p className="text-xs text-muted-foreground">Visitor to lead</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* CEO Agent Chat */}
          <div className="lg:col-span-2">
            <Card className="h-[600px] flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-primary" />
                  Ask the CEO Agent
                </CardTitle>
                <CardDescription>
                  Get AI-powered insights about your traffic, leads, and sales performance
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto space-y-4 mb-4 p-4 bg-secondary/30 rounded-lg">
                  {chatHistory.length === 0 && !isLoading && (
                    <div className="text-center text-muted-foreground py-8">
                      Ask me anything about your business performance...
                    </div>
                  )}
                  
                  {chatHistory.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] p-3 rounded-lg ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-card border border-border"
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                  
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-card border border-border p-3 rounded-lg flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Analyzing data...
                      </div>
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePresetQuery(getTrafficAnalysis, "Analyze traffic sources")}
                    disabled={isLoading}
                  >
                    Traffic Analysis
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePresetQuery(getConversionInsights, "Show conversion insights")}
                    disabled={isLoading}
                  >
                    Conversion Insights
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePresetQuery(getLeadQualityReport, "Lead quality report")}
                    disabled={isLoading}
                  >
                    Lead Quality
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePresetQuery(getWeeklySummary, "Weekly summary")}
                    disabled={isLoading}
                  >
                    Weekly Summary
                  </Button>
                </div>

                {/* Input */}
                <div className="flex gap-2">
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Ask about traffic, leads, conversions..."
                    disabled={isLoading}
                    className="flex-1"
                  />
                  <Button onClick={handleSend} disabled={isLoading || !query.trim()}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Insights & Traffic */}
          <div className="space-y-6">
            {/* Latest Insights */}
            {lastResponse?.insights && lastResponse.insights.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Latest Insight</CardTitle>
                </CardHeader>
                <CardContent>
                  {lastResponse.insights.map((insight, i) => (
                    <div key={i} className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{insight.title}</span>
                        <span className={`text-xs px-2 py-1 rounded ${
                          insight.priority === "high" ? "bg-red-500/20 text-red-500" :
                          insight.priority === "medium" ? "bg-yellow-500/20 text-yellow-500" :
                          "bg-green-500/20 text-green-500"
                        }`}>
                          {insight.priority}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{insight.summary}</p>
                      {insight.recommendations.length > 0 && (
                        <div className="space-y-1">
                          <span className="text-xs font-medium text-muted-foreground">Recommendations:</span>
                          <ul className="text-xs space-y-1">
                            {insight.recommendations.slice(0, 3).map((rec, j) => (
                              <li key={j} className="flex items-start gap-2">
                                <span className="text-primary">•</span>
                                {rec}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Traffic Sources */}
            {metrics?.trafficSources && Object.keys(metrics.trafficSources).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Traffic Sources</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(metrics.trafficSources)
                      .sort(([,a], [,b]) => b - a)
                      .slice(0, 5)
                      .map(([source, count]) => (
                        <div key={source} className="flex items-center justify-between">
                          <span className="text-sm">{source}</span>
                          <span className="text-sm font-medium">{count}</span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Conversation Outcomes */}
            {metrics?.outcomeBreakdown && Object.keys(metrics.outcomeBreakdown).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Conversation Outcomes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {Object.entries(metrics.outcomeBreakdown).map(([outcome, count]) => (
                      <div key={outcome} className="flex items-center justify-between">
                        <span className="text-sm capitalize">{outcome}</span>
                        <span className="text-sm font-medium">{count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAnalytics;
