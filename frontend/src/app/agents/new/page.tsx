"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "@/lib/api/agents";
import type { AgentOut } from "@/lib/types";
import { parseAgentCode } from "@/lib/parsers/parse-agent-code";
import { PageHeader } from "@/components/layout/page-header";
import { useWorkspace } from "@/providers/workspace-provider";

const inputCls = "w-full px-2.5 py-1.5 rounded-md text-[13px] outline-none transition-all bg-card border border-border text-foreground placeholder:text-muted-light focus:ring-2 focus:ring-ring/30 focus:border-ring/50";

export default function NewAgentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { projectId, projects } = useWorkspace();
  const cloneId = searchParams.get("clone");

  // Form fields
  const [inputMode, setInputMode] = useState<"paste" | "manual" | "import">(cloneId ? "manual" : "paste");
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
  const [importProjectId, setImportProjectId] = useState<number | null>(null);
  const [importAgentId, setImportAgentId] = useState<number | null>(null);
  const [importMsg, setImportMsg] = useState("");

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
    }).catch((err: Error) => {
      alert(err.message || "Failed to load source agent");
      router.push("/agents");
    });
  }, [cloneId, router]);

  const importSourceProjects = projects.filter((p) => p.id !== projectId);
  const sourceProjectId = importProjectId ?? importSourceProjects[0]?.id ?? null;
  const {
    data: importAgents = [],
    isLoading: importLoading,
    error: importAgentsError,
  } = useQuery({
    queryKey: ["agents-import-source", sourceProjectId],
    queryFn: () => (
      sourceProjectId === null
        ? Promise.resolve([])
        : agentsApi.listImportable(sourceProjectId)
    ),
    enabled: !cloneId && inputMode === "import" && sourceProjectId !== null,
  });
  const importError = importAgentsError instanceof Error
    ? (importAgentsError.message || "Failed to load agents from source project")
    : "";
  const selectedImportAgentId = importAgentId && importAgents.some((a) => a.id === importAgentId)
    ? importAgentId
    : (importAgents[0]?.id ?? null);

  const applyImportedAgent = (agent: AgentOut) => {
    setAgName(`${agent.name} (copy)`);
    setAgExecutor(agent.executor_type);
    setAgModel(agent.model);
    setAgPrompt(agent.system_prompt || "");
    setCode(agent.source_code || "");
    setAgTools(agent.tools_config ? JSON.stringify(agent.tools_config, null, 2) : "");
    setAgSettings(agent.model_settings ? JSON.stringify(agent.model_settings, null, 2) : "");
    setAgTags((agent.tags || []).join(", "));
  };

  const importSelectedAgent = () => {
    if (!selectedImportAgentId) {
      alert("Select an agent to import");
      return;
    }
    const sourceAgent = importAgents.find((a) => a.id === selectedImportAgentId);
    if (!sourceAgent) {
      alert("Selected source agent was not found");
      return;
    }
    applyImportedAgent(sourceAgent);
    setImportMsg(`Imported "${sourceAgent.name}" from project #${sourceAgent.project_id}`);
    setInputMode("manual");
  };

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
      const data = await parseAgentCode(code);
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
        <div className="bg-card rounded-lg border border-border p-5">
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
          <div className="bg-card rounded-lg border border-border p-5">
            <div className="flex gap-4 mb-4">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer text-foreground">
                <input type="radio" checked={inputMode === "paste"} onChange={() => setInputMode("paste")} className="accent-[var(--primary)]" /> Paste Code
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer text-foreground">
                <input type="radio" checked={inputMode === "manual"} onChange={() => setInputMode("manual")} className="accent-[var(--primary)]" /> Manual Entry
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer text-foreground">
                <input type="radio" checked={inputMode === "import"} onChange={() => setInputMode("import")} className="accent-[var(--primary)]" /> Import Agent
              </label>
            </div>

            {inputMode === "paste" && (
              <div>
                <label className="block font-medium text-sm text-muted mb-1.5">Paste OpenAI Agent Code</label>
                <textarea className={`${inputCls} text-xs font-mono resize-y`} rows={12} value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste your agent code here (Python or TypeScript)..." />
                <div className="flex gap-2 mt-2">
                  <button type="button" className="btn-subtle" onClick={extractFromCode}>Extract Config</button>
                  {extractMsg && <span className={`text-sm self-center ${extractColor}`}>{extractMsg}</span>}
                </div>
              </div>
            )}

            {inputMode === "import" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block font-medium text-sm text-muted mb-1.5">Source Project</label>
                    <select
                      className={inputCls}
                      value={sourceProjectId ?? ""}
                      onChange={(e) => {
                        const parsed = Number(e.target.value);
                        setImportProjectId(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
                        setImportAgentId(null);
                        setImportMsg("");
                      }}
                    >
                      <option value="">Select project...</option>
                      {importSourceProjects.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-sm text-muted mb-1.5">Agent</label>
                    <select
                      className={inputCls}
                      value={selectedImportAgentId ?? ""}
                      onChange={(e) => {
                        const parsed = Number(e.target.value);
                        setImportAgentId(Number.isFinite(parsed) && parsed > 0 ? parsed : null);
                        setImportMsg("");
                      }}
                      disabled={!sourceProjectId || importLoading || importAgents.length === 0}
                    >
                      {!sourceProjectId ? (
                        <option value="">Select source project first...</option>
                      ) : importLoading ? (
                        <option value="">Loading agents...</option>
                      ) : importAgents.length === 0 ? (
                        <option value="">No agents found in source project</option>
                      ) : (
                        importAgents.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.model})
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
                {importSourceProjects.length === 0 && (
                  <div className="text-sm text-muted">
                    Create another project first, then you can import agents from it.
                  </div>
                )}
                {importError && <div className="text-sm text-destructive">{importError}</div>}
                <div className="flex gap-2 items-center">
                  <button
                    type="button"
                    className="btn-subtle"
                    onClick={importSelectedAgent}
                    disabled={!sourceProjectId || !selectedImportAgentId || importLoading}
                  >
                    Load Agent Into Form
                  </button>
                  {importMsg && <span className="text-sm text-success">{importMsg}</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Name + Executor */}
        <div className="bg-card rounded-lg border border-border p-5">
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
        <div className="bg-card rounded-lg border border-border p-5">
          <label className="block font-medium text-sm text-muted mb-2">System Prompt</label>
          <textarea className={`${inputCls} text-xs font-mono resize-y`} rows={10} value={agPrompt} onChange={(e) => setAgPrompt(e.target.value)} />
        </div>

        {/* Tools Config */}
        <div className="bg-card rounded-lg border border-border p-5">
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
        <div className="bg-card rounded-lg border border-border p-5">
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
          <button type="button" onClick={() => router.push("/agents")} className="btn-subtle">
            Cancel
          </button>
          <button type="submit" className="btn-subtle btn-subtle-primary disabled:opacity-50" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Creating..." : "Create Agent"}
          </button>
        </div>
      </form>
    </>
  );
}
