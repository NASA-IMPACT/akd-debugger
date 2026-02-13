"use client";

import { JsonTree } from "@/components/json/json-tree";

interface Props {
  usage?: Record<string, unknown> | null;
  estimatedCostUsd?: unknown;
  missingModelPricing?: boolean;
  traceLogId?: number | null;
}

export function UsageSummary({ usage, estimatedCostUsd, missingModelPricing, traceLogId }: Props) {
  return (
    <details className="text-xs text-muted bg-[var(--surface)] border border-border rounded-lg p-3">
      <summary className="cursor-pointer font-semibold">Usage</summary>
      <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
        <UsageCurrencyStat label="Estimated Cost (USD)" value={toNumber(estimatedCostUsd)} />
        <UsageStat label="Total Tokens" value={toNumber(usage?.total_tokens)} />
        <UsageStat label="Input Tokens" value={toNumber(usage?.input_tokens ?? usage?.prompt_tokens)} />
        <UsageStat
          label="Output Tokens"
          value={toNumber(usage?.output_tokens ?? usage?.completion_tokens)}
        />
        <UsageStat label="Reasoning Tokens" value={toNumber(usage?.reasoning_tokens)} />
        <UsageStat label="Cached Tokens" value={toNumber(usage?.cached_tokens)} />
        <UsageStat label="Requests" value={toNumber(usage?.requests)} />
      </div>
      {missingModelPricing && (
        <div className="mt-2 text-[11px] text-[var(--tag-orange-text)]">
          Model pricing is missing; cost may be incomplete.
        </div>
      )}
      <div className="mt-3 font-mono text-[11px] leading-4">
        <JsonTree
          data={{
            trace_log_id: traceLogId,
            usage,
            estimated_cost_usd: toNumber(estimatedCostUsd),
            missing_model_pricing: !!missingModelPricing,
          }}
        />
      </div>
    </details>
  );
}

function toNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function UsageStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-[var(--surface-hover)] p-2">
      <div className="text-[11px] text-muted-light">{label}</div>
      <div className="text-sm font-semibold text-foreground">{Math.round(value).toLocaleString()}</div>
    </div>
  );
}

function UsageCurrencyStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-[var(--surface-hover)] p-2">
      <div className="text-[11px] text-muted-light">{label}</div>
      <div className="text-sm font-semibold text-foreground">${value.toFixed(6)}</div>
    </div>
  );
}
