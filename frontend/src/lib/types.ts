// TypeScript interfaces mirroring Pydantic schemas

export interface QueryOut {
  id: number;
  suite_id: number;
  ordinal: number;
  tag: string | null;
  query_text: string;
  expected_answer: string;
  comments: string | null;
  metadata_?: Record<string, string> | null;
}

export interface CsvColumnMapping {
  query_text: string;
  expected_answer: string;
  tag: string | null;
  comments: string | null;
}

export interface SuiteOut {
  id: number;
  name: string;
  description: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
  query_count: number;
}

export interface SuiteDetailOut extends SuiteOut {
  queries: QueryOut[];
}

export interface SuiteCreate {
  name: string;
  description?: string | null;
  tags?: string[];
}

export interface SuiteUpdate {
  name?: string | null;
  description?: string | null;
  tags?: string[] | null;
}

export interface QueryCreate {
  tag?: string | null;
  query_text: string;
  expected_answer: string;
  comments?: string | null;
}

export interface AgentOut {
  id: number;
  name: string;
  executor_type: string;
  model: string;
  system_prompt: string | null;
  source_code: string | null;
  tools_config: Record<string, unknown> | null;
  model_settings: Record<string, unknown> | null;
  tags: string[];
  created_at: string;
}

export interface AgentCreate {
  name: string;
  executor_type?: string;
  model: string;
  system_prompt?: string | null;
  source_code?: string | null;
  tools_config?: Record<string, unknown> | null;
  model_settings?: Record<string, unknown> | null;
  tags?: string[];
}

export interface AgentUpdate {
  name?: string | null;
  executor_type?: string | null;
  model?: string | null;
  system_prompt?: string | null;
  source_code?: string | null;
  tools_config?: Record<string, unknown> | null;
  model_settings?: Record<string, unknown> | null;
  tags?: string[] | null;
}

export interface RunOut {
  id: number;
  suite_id: number;
  agent_config_id: number;
  label: string;
  status: string;
  progress_current: number;
  progress_total: number;
  batch_size: number;
  error_message: string | null;
  output_dir: string | null;
  run_group: string | null;
  run_number: number;
  tags: string[];
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface RunDetailOut extends RunOut {
  suite_name: string;
  agent_name: string;
}

export interface RunCreate {
  suite_id: number;
  agent_config_id: number;
  label: string;
  tags?: string[];
  batch_size?: number;
  query_ids?: number[] | null;
  output_dir?: string | null;
  repeat?: number;
}

export interface RunCostPreviewOut {
  id: number;
  suite_id: number;
  suite_name: string;
  agent_config_id: number;
  agent_name: string;
  model: string;
  total_query_count: number;
  sampled_query_ids: number[];
  sampled_query_ordinals: number[];
  sample_size: number;
  repeat: number;
  estimated_total_calls: number;
  status: string;
  error_message: string | null;
  pricing_version: string;
  currency: string;
  missing_model_pricing: boolean;
  usage_totals: Record<string, number>;
  cost_breakdown: Record<string, number>;
  per_query_costs: Array<{
    query_id: number;
    ordinal: number;
    error?: string | null;
    usage: Record<string, number>;
    cost: Record<string, number>;
    web_search_calls?: number;
    model_key?: string | null;
  }>;
  sample_cost_usd: number;
  estimated_total_cost_usd: number;
}

export interface RunCostPreviewRecordOut extends RunCostPreviewOut {
  label: string;
  approved_at: string | null;
  consumed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface GradeOut {
  id: number;
  result_id: number;
  grade: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface GradeCreate {
  grade: string;
  notes?: string | null;
}

export interface ResultOut {
  id: number;
  run_id: number;
  query_id: number;
  parent_result_id: number | null;
  version_number: number;
  is_default_version: boolean;
  version_status: string;
  trace_log_id: number | null;
  agent_response: string | null;
  tool_calls: ToolCall[] | null;
  reasoning: ReasoningStep[] | null;
  usage: UsageData | null;
  execution_time_seconds: number | null;
  error: string | null;
  created_at: string;
  grade: GradeOut | null;
  query: QueryOut | null;
}

export interface ResultListOut {
  results: ResultOut[];
  versions_by_base_result: Record<number, ResultOut[]>;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentChatResponse {
  assistant_message: string | null;
  tool_calls: ToolCall[] | null;
  reasoning: ReasoningStep[] | null;
  usage: UsageData | null;
  estimated_cost_usd: number;
  cost_breakdown: Record<string, number>;
  missing_model_pricing: boolean;
  execution_time_seconds: number | null;
  trace_log_id: number | null;
  error: string | null;
}

export interface ToolCall {
  name?: string;
  arguments?: string | Record<string, unknown>;
  response?: string | Record<string, unknown>;
  // Web search fields (new executor format)
  type?: string; // "web_search" | undefined (MCP)
  action_type?: string; // "search" | "open_page" | "find_in_page"
  query?: string;
  url?: string;
  pattern?: string;
  status?: string;
  sources?: { url: string }[];
  // Legacy imported format
  tool_name?: string | null;
  raw_items?: Record<string, unknown>;
}

export interface ReasoningStep {
  summary?: string | string[];
  content?: (string | Record<string, unknown>)[];
}

export interface UsageData {
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  reasoning_tokens?: number;
  [key: string]: unknown;
}

// Analytics
export interface GradeCountsOut {
  correct: number;
  partial: number;
  wrong: number;
  total: number;
  accuracy: number;
  weighted_score: number;
}

export interface StatsOut {
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  n: number;
}

export interface RunAnalyticsOut {
  run_id: number;
  label: string;
  grade_counts: GradeCountsOut;
  by_type: Record<string, GradeCountsOut>;
  performance: Record<string, StatsOut>;
  tool_usage: Record<string, number>;
  pricing_rates: Record<string, string | number | boolean | null>;
  cost_summary: Record<string, number>;
  query_costs: Array<{
    query_id: number;
    ordinal: number;
    query_text: string;
    total_cost_usd: number;
    input_cost_usd: number;
    cached_input_cost_usd: number;
    output_cost_usd: number;
    reasoning_output_cost_usd: number;
    web_search_cost_usd: number;
    web_search_calls: number;
    usage: Record<string, number>;
  }>;
}

export interface QueryGradeRow {
  query_id: number;
  ordinal: number;
  query_text: string;
  expected_answer: string;
  comments?: string | null;
  tag: string | null;
  grades: Record<number, string | null>;
  responses: Record<number, {
    agent_response: string | null;
    error: string | null;
    tool_calls?: ToolCall[] | null;
    reasoning?: Record<string, unknown> | null;
    usage?: { total_tokens?: number } | null;
    execution_time_seconds?: number | null;
  }>;
  result_ids: Record<number, number | null>;
}

export interface CompareAnalyticsOut {
  runs: RunAnalyticsOut[];
  consistency: Record<string, number>;
  query_grades: QueryGradeRow[];
}

// Browse
export interface BrowseItem {
  name: string;
  type: "dir" | "file";
  path: string;
}

export interface BrowseResult {
  current: string;
  parent: string | null;
  items: BrowseItem[];
}

// Run config (from /api/runs/{id}/config)
export interface RunConfig {
  run: RunOut;
  agent: AgentOut;
  suite: SuiteOut & { query_count: number };
  groupSize: number;
}

// Run import
export interface RunImport {
  suite_id: number;
  agent_config_id: number;
  label: string;
  json_dir: string;
  tags?: string[];
}

export interface RunningJobItem {
  id: number;
  kind: string;
  status: string;
  label: string;
  created_at: string;
  started_at: string | null;
  run_id: number | null;
  query_id: number | null;
  agent_name: string | null;
  suite_name: string | null;
}

export interface RunningJobsOut {
  runs: RunningJobItem[];
  cost_previews: RunningJobItem[];
  single_queries: RunningJobItem[];
}

// SSE events
export interface SSEProgressData {
  current: number;
  total: number;
  success: boolean;
  query_ordinal: number;
  query_text: string;
  time?: number;
}

export type GradeValue = "correct" | "partial" | "wrong";

// Comparisons
export interface ComparisonOut {
  id: number;
  name: string | null;
  suite_id: number;
  suite_name: string;
  run_ids: number[];
  run_count: number;
  created_at: string;
  updated_at: string;
}

export interface ComparisonCreate {
  run_ids: number[];
  name?: string;
}

// Tracing
export interface TraceLogOut {
  id: number;
  run_id: number | null;
  query_id: number | null;
  agent_config_id: number | null;
  trace_type: string;
  provider: string;
  endpoint: string;
  model: string | null;
  status: string;
  request_payload: Record<string, unknown> | null;
  response_payload: Record<string, unknown> | null;
  usage: Record<string, unknown> | null;
  error: string | null;
  estimated_cost_usd: number;
  cost_breakdown: Record<string, number>;
  missing_model_pricing: boolean;
  latency_ms: number | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface TraceSummaryOut {
  count: number;
  total_cost_usd: number;
  missing_model_pricing_count: number;
}

export interface AppNotificationOut {
  id: number;
  notif_type: string;
  title: string;
  message: string;
  related_id: number | null;
  is_read: boolean;
  created_at: string;
}
