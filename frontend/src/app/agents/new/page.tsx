"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "@/lib/api/agents";
import { PageHeader } from "@/components/layout/page-header";

const inputCls = "w-full px-3 py-2 rounded-lg text-sm outline-none transition-all bg-card border border-border text-foreground placeholder:text-muted-light focus:ring-2 focus:ring-ring/30 focus:border-ring/50";

export default function NewAgentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const cloneId = searchParams.get("clone");

  // Form fields
  const [inputMode, setInputMode] = useState<"paste" | "manual">(cloneId ? "manual" : "paste");
  const [code, setCode] = useState("");
  const [extractMsg, setExtractMsg] = useState("");
  const [extractColor, setExtractColor] = useState("text-success");
  const [agName, setAgName] = useState("");
  const [agExecutor, setAgExecutor] = useState("openai_agents");
  const [agModel, setAgModel] = useState("");
  const [agPrompt, setAgPrompt] = useState("");
  const [agTools, setAgTools] = useState("");
  const [agSettings, setAgSettings] = useState("");
  const [agTags, setAgTags] = useState("");
  const [loaded, setLoaded] = useState(!cloneId);

  // Load clone source
  useEffect(() => {
    if (!cloneId) return;
    agentsApi.get(Number(cloneId)).then((a) => {
      setAgName(a.name + " (copy)");
      setAgExecutor(a.executor_type);
      setAgModel(a.model);
      setAgPrompt(a.system_prompt || "");
      setCode(a.source_code || "");
      setAgTools(a.tools_config ? JSON.stringify(a.tools_config, null, 2) : "");
      setAgSettings(a.model_settings ? JSON.stringify(a.model_settings, null, 2) : "");
      setAgTags((a.tags || []).join(", "));
      setLoaded(true);
    });
  }, [cloneId]);

  const saveMutation = useMutation({
    mutationFn: () => {
      let toolsConfig = null;
      let modelSettings = null;
      try { const tc = agTools.trim(); if (tc) toolsConfig = JSON.parse(tc); }
      catch { throw new Error("Invalid tools config JSON"); }
      try { const ms = agSettings.trim(); if (ms) modelSettings = JSON.parse(ms); }
      catch { throw new Error("Invalid model settings JSON"); }

      return agentsApi.create({
        name: agName,
        executor_type: agExecutor,
        model: agModel,
        system_prompt: agPrompt || null,
        source_code: code.trim() || null,
        tools_config: toolsConfig,
        model_settings: modelSettings,
        tags: agTags.split(",").map((t) => t.trim()).filter(Boolean),
      });
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      router.push(`/agents/${created.id}`);
    },
    onError: (err: Error) => alert(err.message),
  });

  const extractFromCode = async () => {
    if (!code.trim()) { alert("Paste code first"); return; }
    setExtractMsg("Parsing...");
    setExtractColor("text-muted");
    try {
      const data = await agentsApi.parseCode(code);
      const extracted: string[] = [];
      if (data.name) { setAgName(data.name as string); extracted.push("name"); }
      if (data.model) { setAgModel(data.model as string); extracted.push("model"); }
      if (data.system_prompt) { setAgPrompt(data.system_prompt as string); extracted.push("system_prompt"); }
      if (data.tools_config) { setAgTools(JSON.stringify(data.tools_config, null, 2)); extracted.push("tools_config"); }
      if (data.model_settings) { setAgSettings(JSON.stringify(data.model_settings, null, 2)); extracted.push("model_settings"); }
      if (extracted.length > 0) {
        setExtractMsg(`Extracted: ${extracted.join(", ")}`);
        setExtractColor("text-success");
      } else {
        setExtractMsg("No Agent() call found. Check the code format.");
        setExtractColor("text-destructive");
      }
    } catch (e) {
      setExtractMsg(`Error: ${e instanceof Error ? e.message : "unknown"}`);
      setExtractColor("text-destructive");
    }
  };

  if (!loaded) {
    return (
      <>
        <PageHeader title="Clone Agent" backHref="/agents" backLabel="Agents" />
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="skeleton h-5 w-48 mb-3" />
          <div className="skeleton h-4 w-32" />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={cloneId ? "Clone Agent" : "New Agent"} backHref="/agents" backLabel="Agents" />

      <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-5">
        {/* Input mode toggle (only for fresh create) */}
        {!cloneId && (
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex gap-4 mb-4">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer text-foreground">
                <input type="radio" checked={inputMode === "paste"} onChange={() => setInputMode("paste")} className="accent-[var(--primary)]" /> Paste Code
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer text-foreground">
                <input type="radio" checked={inputMode === "manual"} onChange={() => setInputMode("manual")} className="accent-[var(--primary)]" /> Manual Entry
              </label>
            </div>

            {inputMode === "paste" && (
              <div>
                <label className="block font-medium text-sm text-muted mb-1.5">Paste OpenAI Agent Code</label>
                <textarea className={`${inputCls} text-xs font-mono resize-y`} rows={12} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste your Python agent code here..." />
                <div className="flex gap-2 mt-2">
                  <button type="button" className="px-4 py-2 bg-card border border-border rounded-lg font-semibold text-sm hover:bg-[var(--surface-hover)] text-foreground transition-colors" onClick={extractFromCode}>Extract Config</button>
                  {extractMsg && <span className={`text-sm self-center ${extractColor}`}>{extractMsg}</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Name + Executor */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block font-medium text-sm text-muted mb-1.5">Name</label>
              <input className={inputCls} value={agName} onChange={(e) => setAgName(e.target.value)} required />
            </div>
            <div>
              <label className="block font-medium text-sm text-muted mb-1.5">Executor</label>
              <select className={inputCls} value={agExecutor} onChange={(e) => setAgExecutor(e.target.value)}>
                <option value="openai_agents">openai_agents</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-medium text-sm text-muted mb-1.5">Model</label>
              <input className={inputCls} value={agModel} onChange={(e) => setAgModel(e.target.value)} required placeholder="e.g. gpt-5.2" />
            </div>
            <div>
              <label className="block font-medium text-sm text-muted mb-1.5">Tags (comma-separated)</label>
              <input className={inputCls} value={agTags} onChange={(e) => setAgTags(e.target.value)} />
            </div>
          </div>
        </div>

        {/* System Prompt */}
        <div className="bg-card rounded-xl border border-border p-5">
          <label className="block font-medium text-sm text-muted mb-2">System Prompt</label>
          <textarea className={`${inputCls} text-xs font-mono resize-y`} rows={10} value={agPrompt} onChange={(e) => setAgPrompt(e.target.value)} />
        </div>

        {/* Tools Config */}
        <div className="bg-card rounded-xl border border-border p-5">
          <label className="block font-medium text-sm text-muted mb-2">Tools Config (JSON)</label>
          <textarea
            className={`${inputCls} text-xs font-mono resize-y`}
            rows={10}
            value={agTools}
            onChange={(e) => setAgTools(e.target.value)}
            placeholder='{"type":"mcp","server_url":"...","allowed_tools":[...]}'
          />
        </div>

        {/* Model Settings */}
        <div className="bg-card rounded-xl border border-border p-5">
          <label className="block font-medium text-sm text-muted mb-2">Model Settings (JSON)</label>
          <textarea
            className={`${inputCls} text-xs font-mono resize-y`}
            rows={8}
            value={agSettings}
            onChange={(e) => setAgSettings(e.target.value)}
            placeholder='{"store":true,"reasoning":{"effort":"medium","summary":"auto"}}'
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.push("/agents")} className="px-4 py-2 rounded-xl font-medium text-sm bg-card border border-border text-foreground hover:bg-[var(--surface-hover)] transition-colors">
            Cancel
          </button>
          <button type="submit" className="px-4 py-2 bg-primary text-primary-foreground rounded-xl font-medium text-sm shadow-lg shadow-primary/25 hover:brightness-110 hover:-translate-y-px transition-all disabled:opacity-50" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Creating..." : "Create Agent"}
          </button>
        </div>
      </form>
    </>
  );
}
