"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentsApi } from "@/lib/api/agents";
import { parseAgentCode } from "@/lib/parsers/parse-agent-code";
import type { AgentOut } from "@/lib/types";
import { PageHeader } from "@/components/layout/page-header";
import { TagBadge } from "@/components/ui/tag-badge";
import { JsonTree } from "@/components/json/json-tree";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { AgentChatView } from "@/components/agents/agent-chat-view";
import { AgentTracesView } from "@/components/agents/agent-traces-view";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  X,
  Pencil,
  Copy,
  Check,
  Trash2,
  Save,
  FileText,
  Wrench,
  Settings,
  Cpu,
  Cog,
  Calendar,
  Info,
  SquarePen,
  Eye,
  ClipboardPaste,
  MessageSquare,
  Workflow,
} from "lucide-react";
import { encodingForModel } from "js-tiktoken";
import Editor from "react-simple-code-editor";
import hljs from "highlight.js/lib/core";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import "@/styles/hljs-theme.css";

hljs.registerLanguage("python", python);
hljs.registerLanguage("typescript", typescript);

const highlightCode = (code: string) =>
  hljs.highlightAuto(code, ["python", "typescript"]).value;

function detectCodeLanguage(code: string): string {
  const language = hljs.highlightAuto(code, ["python", "typescript"]).language;
  if (language === "python" || language === "typescript") return language;
  return "";
}

function formatCodeForClipboard(code: string): string {
  const normalized = code.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return "";
  const language = detectCodeLanguage(normalized);
  return language
    ? `\`\`\`${language}\n${normalized}\n\`\`\``
    : `\`\`\`\n${normalized}\n\`\`\``;
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "absolute";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type SectionKey =
  | "general"
  | "prompt"
  | "tools"
  | "settings"
  | "paste"
  | "traces"
  | "chat";

const sectionMeta: {
  key: SectionKey;
  label: string;
  icon: typeof FileText;
  editOnly?: boolean;
  viewOnly?: boolean;
}[] = [
  { key: "general", label: "General", icon: Info },
  { key: "prompt", label: "System Prompt", icon: FileText },
  { key: "tools", label: "Tools Config", icon: Wrench },
  { key: "settings", label: "Model Settings", icon: Settings },
  { key: "paste", label: "Paste Code", icon: ClipboardPaste },
  { key: "traces", label: "Traces", icon: Workflow, viewOnly: true },
  { key: "chat", label: "Chat", icon: MessageSquare, viewOnly: true },
];

const inputCls =
  "w-full px-2.5 py-1.5 rounded-md text-[13px] outline-none transition-all bg-[var(--surface)] border border-border text-foreground placeholder:text-muted-light focus:ring-2 focus:ring-ring/30 focus:border-ring/50";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getToolsList(a: AgentOut): string[] {
  if (!a.tools_config) return [];
  const tc = a.tools_config;
  const tools: string[] = [];
  if (Array.isArray(tc)) {
    tc.forEach((item: Record<string, unknown>) => {
      if (item.type === "web_search") tools.push("web_search");
      else if (Array.isArray(item.allowed_tools))
        tools.push(...(item.allowed_tools as string[]));
      else if (item.name) tools.push(item.name as string);
    });
  } else if (tc.allowed_tools && Array.isArray(tc.allowed_tools)) {
    tools.push(...(tc.allowed_tools as string[]));
  }
  return tools;
}

// ---------------------------------------------------------------------------
// View sections
// ---------------------------------------------------------------------------

function GeneralView({
  agent,
  onRequestEdit,
}: {
  agent: AgentOut;
  onRequestEdit?: () => void;
}) {
  const tools = getToolsList(agent);
  return (
    <div
      className="space-y-6 p-6"
      onDoubleClick={onRequestEdit}
      title={onRequestEdit ? "Double-click to edit" : undefined}
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-x-8 gap-y-4">
        <InfoItem label="Name" value={agent.name} />
        <InfoItem
          label="Model"
          value={agent.model}
          mono
          icon={<Cpu size={13} className="text-muted-light" />}
        />
        <InfoItem
          label="Executor"
          value={agent.executor_type}
          icon={<Cog size={13} className="text-muted-light" />}
        />
        <InfoItem
          label="Tools"
          value={tools.length > 0 ? `${tools.length} configured` : "None"}
        />
        <InfoItem
          label="Created"
          value={formatDate(agent.created_at)}
          icon={<Calendar size={13} className="text-muted-light" />}
        />
      </div>

      {agent.tags && agent.tags.length > 0 && (
        <div>
          <span className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">
            Tags
          </span>
          <div className="flex gap-1.5 flex-wrap">
            {agent.tags.map((t) => (
              <TagBadge key={t} tag={t} />
            ))}
          </div>
        </div>
      )}

      {tools.length > 0 && (
        <div>
          <span className="text-xs font-semibold text-muted uppercase tracking-wider block mb-1.5">
            Tool Names
          </span>
          <div className="flex flex-wrap gap-1.5">
            {tools.map((t, i) => (
              <span
                key={i}
                className="inline-block bg-[var(--tag-green-bg)] text-[var(--tag-green-text)] text-xs px-2 py-0.5 rounded font-mono"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoItem({
  label,
  value,
  mono,
  icon,
}: {
  label: string;
  value: string;
  mono?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs font-semibold text-muted uppercase tracking-wider mb-0.5">
        {label}
      </span>
      <span
        className={cn(
          "text-sm text-foreground flex items-center gap-1.5",
          mono && "font-mono",
        )}
      >
        {icon}
        {value}
      </span>
    </div>
  );
}

function useTokenCount(text: string | null | undefined) {
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!text) {
      setCount(0);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        const enc = encodingForModel("gpt-4o");
        setCount(enc.encode(text).length);
      } catch {
        setCount(Math.ceil(text.length / 4));
      }
    }, 5000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [text]);

  // compute initial value synchronously on first render
  useEffect(() => {
    if (!text) return;
    try {
      const enc = encodingForModel("gpt-4o");
      setCount(enc.encode(text).length);
    } catch {
      setCount(Math.ceil(text.length / 4));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return count;
}

function PromptView({
  agent,
  onRequestEdit,
}: {
  agent: AgentOut;
  onRequestEdit?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!agent.system_prompt) {
    return <EmptySection label="No system prompt configured" />;
  }

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(agent.system_prompt!);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="relative p-6 prompt-markdown text-foreground text-base"
      style={{
        fontFamily:
          "var(--font-roboto-condensed), 'Roboto Condensed', sans-serif",
      }}
      onDoubleClick={onRequestEdit}
      title={onRequestEdit ? "Double-click to edit prompt" : undefined}
    >
      <button
        onClick={handleCopy}
        className="absolute top-4 right-4 p-1.5 rounded-md text-muted-light hover:text-foreground hover:bg-surface-hover transition-colors"
        title="Copy markdown"
      >
        {copied ? (
          <Check size={16} className="text-green-500" />
        ) : (
          <Copy size={16} />
        )}
      </button>
      <MarkdownRenderer
        content={agent.system_prompt}
        className="max-w-none [&_pre]:bg-[var(--surface-hover)] [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_code]:bg-[var(--surface-hover)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm"
      />
    </div>
  );
}

function ToolsView({
  agent,
  onRequestEdit,
}: {
  agent: AgentOut;
  onRequestEdit?: () => void;
}) {
  if (!agent.tools_config) {
    return <EmptySection label="No tools configured" />;
  }
  return (
    <div
      className="p-6"
      onDoubleClick={onRequestEdit}
      title={onRequestEdit ? "Double-click to edit" : undefined}
    >
      <div className="jt-root font-mono text-sm leading-relaxed">
        <JsonTree data={agent.tools_config} defaultOpen maxOpenDepth={3} />
      </div>
    </div>
  );
}

function SettingsView({
  agent,
  onRequestEdit,
}: {
  agent: AgentOut;
  onRequestEdit?: () => void;
}) {
  if (!agent.model_settings || Object.keys(agent.model_settings).length === 0) {
    return <EmptySection label="No model settings configured" />;
  }
  return (
    <div
      className="p-6"
      onDoubleClick={onRequestEdit}
      title={onRequestEdit ? "Double-click to edit" : undefined}
    >
      <div className="jt-root font-mono text-sm leading-relaxed">
        <JsonTree data={agent.model_settings} defaultOpen maxOpenDepth={3} />
      </div>
    </div>
  );
}

function EmptySection({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-muted-light">
      <span className="text-sm italic">{label}</span>
    </div>
  );
}

function PasteCodeView({
  agent,
  onRequestEdit,
}: {
  agent: AgentOut;
  onRequestEdit?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const highlighted = useMemo(() => {
    if (!agent.source_code) return "";
    return hljs.highlightAuto(agent.source_code, ["python", "typescript"])
      .value;
  }, [agent.source_code]);
  const formattedCode = useMemo(
    () => formatCodeForClipboard(agent.source_code || ""),
    [agent.source_code],
  );

  const handleCopyCode = async () => {
    if (!formattedCode) return;
    try {
      await copyTextToClipboard(formattedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (!agent.source_code) {
    return <EmptySection label="No pasted code saved for this agent" />;
  }
  return (
    <div
      className="p-6 relative"
      onDoubleClick={onRequestEdit}
      title={onRequestEdit ? "Double-click to edit" : undefined}
    >
      <button
        onClick={handleCopyCode}
        className="absolute top-9 right-9 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-card border border-border text-foreground hover:bg-[var(--surface-hover)] transition-colors"
        title="Copy formatted code"
      >
        {copied ? (
          <>
            <Check size={13} className="text-green-500" />
            Copied
          </>
        ) : (
          <>
            <Copy size={13} />
            Copy Code
          </>
        )}
      </button>
      <pre className="rounded-lg border border-border max-h-[70vh] overflow-y-auto !m-0">
        <code
          className="hljs text-xs !leading-relaxed"
          dangerouslySetInnerHTML={{ __html: highlighted }}
        />
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit sections
// ---------------------------------------------------------------------------

function GeneralEdit({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium text-sm text-muted mb-1.5">
            Name
          </label>
          <input
            className={inputCls}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block font-medium text-sm text-muted mb-1.5">
            Executor
          </label>
          <select
            className={inputCls}
            value={form.executor}
            onChange={(e) => setForm({ ...form, executor: e.target.value })}
          >
            <option value="openai_agents">openai_agents</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-medium text-sm text-muted mb-1.5">
            Model
          </label>
          <input
            className={inputCls}
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            required
            placeholder="e.g. gpt-5.2"
          />
        </div>
        <div>
          <label className="block font-medium text-sm text-muted mb-1.5">
            Tags (comma-separated)
          </label>
          <input
            className={inputCls}
            value={form.tags}
            onChange={(e) => setForm({ ...form, tags: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}

function PromptEdit({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-6 py-2 border-b border-border/20 text-[11px] text-muted-light uppercase tracking-wider">
        Live Markdown Preview
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2">
        <div className="min-h-0 lg:border-r border-border/20">
          <textarea
            className="w-full h-full px-6 py-4 text-sm font-mono outline-none resize-none bg-transparent text-foreground placeholder:text-muted-light leading-relaxed"
            value={form.prompt}
            onChange={(e) => setForm({ ...form, prompt: e.target.value })}
            placeholder="Enter system prompt..."
            spellCheck={false}
          />
        </div>
        <div className="min-h-0 overflow-auto p-6 prompt-markdown text-foreground text-base">
          {form.prompt.trim() ? (
            <MarkdownRenderer
              content={form.prompt}
              className="max-w-none [&_pre]:bg-[var(--surface-hover)] [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_code]:bg-[var(--surface-hover)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm"
            />
          ) : (
            <div className="text-sm text-muted-light italic">
              Markdown preview will appear here as you type.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function JsonEdit({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const parseError = useMemo(() => {
    if (!value.trim()) return null;
    try {
      JSON.parse(value);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Invalid JSON";
    }
  }, [value]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {parseError && (
        <div className="px-6 py-1.5 bg-destructive/10 text-destructive text-xs border-b border-destructive/20">
          JSON Error: {parseError}
        </div>
      )}
      {!parseError && value.trim() && (
        <div className="px-6 py-1.5 bg-success/10 text-success text-xs border-b border-success/20">
          Valid JSON
        </div>
      )}
      <textarea
        className="w-full flex-1 px-6 py-4 text-sm font-mono outline-none resize-none bg-transparent text-foreground placeholder:text-muted-light leading-relaxed"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
    </div>
  );
}

function PasteCodeEdit({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgColor, setMsgColor] = useState("text-success");
  const [extracting, setExtracting] = useState(false);

  const extract = async () => {
    if (!form.sourceCode.trim()) return;
    setExtracting(true);
    setMsg("Parsing...");
    setMsgColor("text-muted");
    try {
      const data = await parseAgentCode(form.sourceCode);
      const extracted: string[] = [];
      const updates = { ...form };
      if (data.name) {
        updates.name = data.name as string;
        extracted.push("name");
      }
      if (data.model) {
        updates.model = data.model as string;
        extracted.push("model");
      }
      if (data.system_prompt) {
        updates.prompt = data.system_prompt as string;
        extracted.push("system_prompt");
      }
      if (data.tools_config) {
        updates.tools = JSON.stringify(data.tools_config, null, 2);
        extracted.push("tools_config");
      }
      if (data.model_settings) {
        updates.settings = JSON.stringify(data.model_settings, null, 2);
        extracted.push("model_settings");
      }
      if (extracted.length > 0) {
        setForm(updates);
        setMsg(`Extracted: ${extracted.join(", ")}`);
        setMsgColor("text-success");
      } else {
        setMsg("No Agent() call found. Check the code format.");
        setMsgColor("text-destructive");
      }
    } catch (e) {
      setMsg(`Error: ${e instanceof Error ? e.message : "unknown"}`);
      setMsgColor("text-destructive");
    } finally {
      setExtracting(false);
    }
  };

  const copyCode = async () => {
    const formatted = formatCodeForClipboard(form.sourceCode);
    if (!formatted) return;
    try {
      await copyTextToClipboard(formatted);
      setCopied(true);
      setMsg("Copied formatted code");
      setMsgColor("text-success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMsg("Failed to copy code");
      setMsgColor("text-destructive");
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-6 py-2 border-b border-border/20 shrink-0">
        <button
          type="button"
          onClick={copyCode}
          disabled={!form.sourceCode.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-card border border-border text-foreground hover:bg-[var(--surface-hover)] transition-colors disabled:opacity-40"
          title="Copy formatted code"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy Code"}
        </button>
        <button
          type="button"
          onClick={extract}
          disabled={extracting || !form.sourceCode.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:brightness-110 transition-colors disabled:opacity-40"
        >
          <ClipboardPaste size={12} />{" "}
          {extracting ? "Extracting..." : "Extract Config"}
        </button>
        {msg && <span className={`text-xs ${msgColor}`}>{msg}</span>}
      </div>
      <div className="flex-1 overflow-auto code-editor-wrap">
        <Editor
          value={form.sourceCode}
          onValueChange={(code) => setForm({ ...form, sourceCode: code })}
          highlight={highlightCode}
          padding={24}
          className="hljs min-h-full"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            lineHeight: 1.7,
          }}
          placeholder="Paste your agent code here (Python or TypeScript)..."
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form state
// ---------------------------------------------------------------------------

interface FormState {
  name: string;
  executor: string;
  model: string;
  tags: string;
  prompt: string;
  sourceCode: string;
  tools: string;
  settings: string;
}

function agentToForm(a: AgentOut): FormState {
  return {
    name: a.name,
    executor: a.executor_type,
    model: a.model,
    tags: (a.tags || []).join(", "),
    prompt: a.system_prompt || "",
    sourceCode: a.source_code || "",
    tools: a.tools_config ? JSON.stringify(a.tools_config, null, 2) : "",
    settings: a.model_settings ? JSON.stringify(a.model_settings, null, 2) : "",
  };
}

// ---------------------------------------------------------------------------
// Main Detail Page
// ---------------------------------------------------------------------------

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const agentId = Number(params.id);

  const [editing, setEditing] = useState(searchParams.get("edit") === "1");
  const initialTab = searchParams.get("tab") as SectionKey | null;
  const [active, setActive] = useState<SectionKey>(
    initialTab && sectionMeta.some((s) => s.key === initialTab)
      ? initialTab
      : "general",
  );
  const [form, setForm] = useState<FormState | null>(null);
  const [deleteModal, setDeleteModal] = useState(false);

  const {
    data: agent,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["agent", agentId],
    queryFn: () => agentsApi.get(agentId),
    enabled: !isNaN(agentId),
  });

  const promptTokens = useTokenCount(
    editing && form ? form.prompt : agent?.system_prompt,
  );

  const startEditing = () => {
    if (agent) setForm(agentToForm(agent));
    if (active === "traces" || active === "chat") setActive("general");
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setForm(null);
    if (active === "paste" || active === "traces" || active === "chat") {
      setActive("general");
    }
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!form) throw new Error("No form data");
      let toolsConfig = null;
      let modelSettings = null;
      try {
        const tc = form.tools.trim();
        if (tc) toolsConfig = JSON.parse(tc);
      } catch {
        throw new Error("Invalid tools config JSON");
      }
      try {
        const ms = form.settings.trim();
        if (ms) modelSettings = JSON.parse(ms);
      } catch {
        throw new Error("Invalid model settings JSON");
      }
      return agentsApi.update(agentId, {
        name: form.name,
        executor_type: form.executor,
        model: form.model,
        system_prompt: form.prompt || null,
        source_code: form.sourceCode || null,
        tools_config: toolsConfig,
        model_settings: modelSettings,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      setEditing(false);
      setForm(null);
      if (active === "paste" || active === "traces" || active === "chat") {
        setActive("general");
      }
    },
    onError: (err: Error) => alert(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => agentsApi.delete(agentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      router.push("/agents");
    },
  });

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "s") return;
      if (!editing || !form || saveMutation.isPending) return;
      const editableSection = active !== "traces" && active !== "chat";
      if (!editableSection) return;
      event.preventDefault();
      saveMutation.mutate();
    };

    window.addEventListener("keydown", handleSaveShortcut);
    return () => {
      window.removeEventListener("keydown", handleSaveShortcut);
    };
  }, [editing, active, form, saveMutation]);

  // ---------- Loading / Error ----------
  if (isLoading) {
    return (
      <>
        <PageHeader title="" backHref="/agents" backLabel="Agents" />
        <div
          className="glass rounded-lg overflow-hidden"
          style={{ height: "calc(100vh - 200px)" }}
        >
          <div className="flex h-full">
            <div className="w-48 border-r border-border/30 p-4 space-y-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="skeleton h-10 w-full rounded-lg" />
              ))}
            </div>
            <div className="flex-1 p-6 space-y-4">
              <div className="skeleton h-6 w-48" />
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-40 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </>
    );
  }

  if (isError || !agent) {
    return (
      <>
        <PageHeader
          title="Agent Not Found"
          backHref="/agents"
          backLabel="Agents"
        />
        <div className="bg-card rounded-lg border border-border py-16 text-center">
          <p className="text-destructive font-medium mb-2">
            Could not load agent
          </p>
          <button
            onClick={() => router.push("/agents")}
            className="text-sm text-primary hover:underline"
          >
            Back to agents
          </button>
        </div>
      </>
    );
  }

  // Auto-init form when entering edit via URL param
  if (editing && !form) {
    setForm(agentToForm(agent));
  }

  // ---------- Render ----------
  return (
    <>
      <div className="[&>*]:!pb-3 [&>*]:!mb-3">
        <PageHeader
          title={agent.name}
          backHref="/agents"
          backLabel="Agents"
          subtitle={
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono font-medium bg-[var(--tag-blue-bg)] text-[var(--tag-blue-text)]">
                <Cpu size={11} /> {agent.model}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-[var(--tag-gray-bg)] text-[var(--tag-gray-text)]">
                <Cog size={11} /> {agent.executor_type}
              </span>
            </div>
          }
        >
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={cancelEditing}
                  className="px-3.5 py-1.5 rounded-md font-medium text-[13px] bg-card border border-border text-foreground hover:bg-[var(--surface-hover)] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-medium text-[13px] bg-primary text-primary-foreground hover:brightness-110 transition-colors disabled:opacity-50"
                >
                  <Save size={13} />{" "}
                  {saveMutation.isPending ? "Saving..." : "Save"}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={startEditing}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-medium text-[13px] bg-primary text-primary-foreground hover:brightness-110 transition-colors"
                >
                  <Pencil size={13} /> Edit
                </button>
                <button
                  onClick={() => router.push(`/agents/new?clone=${agent.id}`)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-medium text-[13px] bg-card border border-border text-foreground hover:bg-[var(--surface-hover)] transition-colors"
                >
                  <Copy size={13} /> Clone
                </button>
                <button
                  onClick={() => setDeleteModal(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md font-medium text-[13px] text-destructive bg-card border border-border hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 size={13} /> Delete
                </button>
              </>
            )}
          </div>
        </PageHeader>
      </div>

      {/* Split layout */}
      <div
        className="glass rounded-lg overflow-hidden"
        style={{ height: "calc(100vh - 200px)" }}
      >
        <div className="flex h-full">
          {/* Left sidebar */}
          <div className="w-48 shrink-0 border-r border-border/30 flex flex-col bg-[var(--surface)]">
            <div className="flex-1 overflow-y-auto py-1">
              {sectionMeta
                .filter((s) => (editing ? !s.viewOnly : !s.editOnly))
                .map((s) => {
                  const Icon = s.icon;
                  const isActive = s.key === active;
                  return (
                    <button
                      key={s.key}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors text-left",
                        isActive
                          ? "bg-primary/10 border-l-[3px] border-l-primary font-semibold text-foreground"
                          : "hover:bg-[var(--surface-hover)] text-muted border-l-[3px] border-l-transparent",
                      )}
                      onClick={() => setActive(s.key)}
                    >
                      <Icon
                        size={16}
                        className={cn(
                          "shrink-0",
                          isActive ? "text-primary" : "text-muted-light",
                        )}
                      />
                      <span className="truncate">{s.label}</span>
                    </button>
                  );
                })}
            </div>

            {/* Sidebar footer: edit toggle */}
            <div className="border-t border-border/20 px-4 py-3 shrink-0">
              <button
                onClick={editing ? cancelEditing : startEditing}
                className={cn(
                  "w-full inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                  editing
                    ? "bg-primary/10 text-primary"
                    : "text-muted hover:text-foreground hover:bg-[var(--surface-hover)]",
                )}
              >
                {editing ? (
                  <>
                    <Eye size={12} /> View Mode
                  </>
                ) : (
                  <>
                    <SquarePen size={12} /> Edit Mode
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Content toolbar */}
            <div className="flex items-center justify-between px-6 py-2 border-b border-border/20 shrink-0">
              <span className="text-xs text-muted-light font-medium uppercase tracking-wider">
                {sectionMeta.find((s) => s.key === active)?.label}
                {editing && " — Editing"}
              </span>
              <span className="flex items-center gap-3">
                {active === "prompt" &&
                  (editing ? form?.prompt : agent.system_prompt) && (
                    <span className="text-[11px] text-muted tabular-nums">
                      ~{promptTokens.toLocaleString()} tokens &middot;{" "}
                      {(editing
                        ? form!.prompt
                        : agent.system_prompt!
                      ).length.toLocaleString()}{" "}
                      chars
                    </span>
                  )}
                {editing && active !== "general" && (
                  <span className="text-[10px] text-muted-light">
                    {active === "prompt"
                      ? "Supports Markdown"
                      : active === "paste"
                        ? "Raw source code"
                        : active === "traces"
                          ? "Agent execution traces"
                          : active === "chat"
                            ? "Session-only history"
                            : "JSON format"}
                  </span>
                )}
              </span>
            </div>

            {/* Content body */}
            <div
              className={cn(
                "flex-1 min-h-0",
                editing && form && active !== "general"
                  ? "flex flex-col"
                  : "overflow-auto",
              )}
            >
              {editing && form ? (
                // Edit mode
                active === "general" ? (
                  <GeneralEdit form={form} setForm={setForm} />
                ) : active === "prompt" ? (
                  <PromptEdit form={form} setForm={setForm} />
                ) : active === "tools" ? (
                  <JsonEdit
                    value={form.tools}
                    onChange={(v) => setForm({ ...form, tools: v })}
                    placeholder='[{"type":"mcp","server_url":"...","allowed_tools":[...]}]'
                  />
                ) : active === "paste" ? (
                  <PasteCodeEdit form={form} setForm={setForm} />
                ) : (
                  <JsonEdit
                    value={form.settings}
                    onChange={(v) => setForm({ ...form, settings: v })}
                    placeholder='{"store":true,"reasoning":{"effort":"medium","summary":"auto"}}'
                  />
                )
              ) : // View mode
              active === "general" ? (
                <GeneralView agent={agent} onRequestEdit={startEditing} />
              ) : active === "prompt" ? (
                <PromptView agent={agent} onRequestEdit={startEditing} />
              ) : active === "tools" ? (
                <ToolsView agent={agent} onRequestEdit={startEditing} />
              ) : active === "paste" ? (
                <PasteCodeView agent={agent} onRequestEdit={startEditing} />
              ) : active === "traces" ? (
                <AgentTracesView agentId={agent.id} />
              ) : active === "chat" ? (
                <AgentChatView agentId={agent.id} agentName={agent.name} />
              ) : (
                <SettingsView agent={agent} onRequestEdit={startEditing} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      {deleteModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center modal-backdrop"
          onClick={(e) => e.target === e.currentTarget && setDeleteModal(false)}
        >
          <div className="bg-card border border-border rounded-xl w-[420px] p-6 shadow-2xl modal-content">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-lg text-foreground">
                Delete Agent
              </h3>
              <button
                className="p-1.5 rounded-lg text-muted-light hover:text-foreground hover:bg-[var(--surface-hover)] transition-colors"
                onClick={() => setDeleteModal(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p className="mb-6 text-foreground">
              Delete <strong>{agent.name}</strong>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                className="px-3.5 py-1.5 rounded-md font-medium text-[13px] bg-card border border-border text-foreground hover:bg-[var(--surface-hover)] transition-colors"
                onClick={() => setDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                className="px-3.5 py-1.5 bg-destructive text-white rounded-md font-medium text-[13px] hover:brightness-110 transition-colors"
                onClick={() => deleteMutation.mutate()}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
