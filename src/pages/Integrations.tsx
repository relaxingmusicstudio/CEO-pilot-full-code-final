import React, { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Provider = "openai" | "gemini";

const isMockMode = () =>
  import.meta.env.VITE_MOCK_AUTH === "true" ||
  (typeof window !== "undefined" && window.localStorage.getItem("VITE_MOCK_AUTH") === "true");

export default function Integrations() {
  const [provider, setProvider] = useState<Provider>("openai");
  const [apiKey, setApiKey] = useState("");
  const [prompt, setPrompt] = useState("Hello!");
  const [status, setStatus] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [llmResult, setLlmResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { isAuthenticated } = useAuth();

  const mock = useMemo(() => isMockMode(), []);

  const callFunction = async (action: "save" | "test") => {
    setLoading(true);
    setStatus(null);
    setTestResult(null);
    try {
      if (mock) {
        if (action === "save") {
          setStatus("Saved");
          setApiKey("");
          return;
        }
        setTestResult("Test succeeded (mock)");
        return;
      }

      const { data, error } = await supabase.functions.invoke("user-integrations", {
        body: action === "save" ? { action, provider, apiKey } : { action, provider, prompt },
        headers: { "x-mock-auth": mock ? "true" : "false" },
      });

      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Request failed");

      if (action === "save") {
        setStatus("Saved");
        setApiKey("");
      } else {
        setTestResult(`Success G求 ${data.provider ?? provider} G求 ${data.latencyMs ?? 0}ms`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      if (action === "save") {
        setStatus(`Error: ${message}`);
      } else {
        setTestResult(`Error: ${message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const runLlmGateway = async () => {
    setLoading(true);
    setLlmResult(null);
    try {
      if (mock) {
        setLlmResult("Gateway ok (mock)");
        return;
      }
      const { data, error } = await supabase.functions.invoke("llm-gateway", {
        body: { provider, task: "test", input: prompt, meta: {} },
        headers: { "x-mock-auth": mock ? "true" : "false" },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Gateway failed");
      setLlmResult(`Gateway ok G求 ${data.provider} G求 ${data.output ?? data.sampleText ?? "ok"}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gateway error";
      setLlmResult(`Error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <div className="container py-8" data-testid="integrations-page">
      <Helmet>
        <title>Integrations</title>
      </Helmet>
      <Card>
        <CardHeader>
          <CardTitle>LLM Integrations</CardTitle>
          <CardDescription>Store and test provider keys. Keys are never returned to the browser.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Tabs value={provider} onValueChange={(v) => setProvider(v as Provider)}>
            <TabsList>
              <TabsTrigger value="openai">OpenAI</TabsTrigger>
              <TabsTrigger value="gemini">Gemini</TabsTrigger>
            </TabsList>
            <TabsContent value="openai">
              <IntegrationForm
                providerLabel="OpenAI"
                apiKey={apiKey}
                prompt={prompt}
                status={status}
                testResult={testResult}
                loading={loading}
                llmResult={llmResult}
                onKeyChange={setApiKey}
                onPromptChange={setPrompt}
                onSave={() => callFunction("save")}
                onTest={() => callFunction("test")}
                onGateway={runLlmGateway}
              />
            </TabsContent>
            <TabsContent value="gemini">
              <IntegrationForm
                providerLabel="Gemini"
                apiKey={apiKey}
                prompt={prompt}
                status={status}
                testResult={testResult}
                loading={loading}
                llmResult={llmResult}
                onKeyChange={setApiKey}
                onPromptChange={setPrompt}
                onSave={() => callFunction("save")}
                onTest={() => callFunction("test")}
                onGateway={runLlmGateway}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

type FormProps = {
  providerLabel: string;
  apiKey: string;
  prompt: string;
  status: string | null;
  testResult: string | null;
  llmResult: string | null;
  loading: boolean;
  onKeyChange: (val: string) => void;
  onPromptChange: (val: string) => void;
  onSave: () => void;
  onTest: () => void;
  onGateway: () => void;
};

function IntegrationForm({
  providerLabel,
  apiKey,
  prompt,
  status,
  testResult,
  llmResult,
  loading,
  onKeyChange,
  onPromptChange,
  onSave,
  onTest,
  onGateway,
}: FormProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium">API Key</label>
        <Input
          data-testid="integration-key"
          type="password"
          value={apiKey}
          onChange={(e) => onKeyChange(e.target.value)}
          placeholder={`${providerLabel} key`}
        />
        <p className="text-xs text-muted-foreground">Stored encrypted. Never sent back to the browser.</p>
      </div>
      <div className="flex gap-3 items-center">
        <Button data-testid="integration-save" onClick={onSave} disabled={loading || !apiKey}>
          Save
        </Button>
        {status && <span data-testid="integration-status" className="text-sm">{status}</span>}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Test prompt</label>
        <Textarea
          data-testid="integration-test-prompt"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder="Ping the provider with a short prompt"
        />
      </div>
      <div className="flex gap-3 items-center flex-wrap">
        <Button data-testid="integration-test" variant="outline" onClick={onTest} disabled={loading}>
          Test key
        </Button>
        <Button data-testid="llm-gateway-test" variant="secondary" onClick={onGateway} disabled={loading}>
          Run LLM Gateway
        </Button>
        {testResult && <span data-testid="integration-result" className="text-sm">{testResult}</span>}
        {llmResult && <span data-testid="llm-gateway-result" className="text-sm">{llmResult}</span>}
      </div>
    </div>
  );
}
