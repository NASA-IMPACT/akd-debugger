"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { suitesApi } from "@/lib/api/suites";
import { agentsApi } from "@/lib/api/agents";
import { runsApi } from "@/lib/api/runs";
import { useWorkspace } from "@/providers/workspace-provider";

interface TagFilterCtx {
  tag: string;
  setTag: (t: string) => void;
  allTags: string[];
}

const TagFilterContext = createContext<TagFilterCtx>({
  tag: "",
  setTag: () => {},
  allTags: [],
});

export function useTagFilter() {
  return useContext(TagFilterContext);
}

export function TagFilterProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tag = searchParams.get("tag") || "";
  const [allTags, setAllTags] = useState<string[]>([]);
  const { organizationId, projectId, workspaceReady } = useWorkspace();

  useEffect(() => {
    if (!workspaceReady) return;
    let active = true;
    async function load() {
      try {
        const [suites, agents, runs] = await Promise.all([
          suitesApi.list(),
          agentsApi.list(),
          runsApi.list(),
        ]);
        const tags = new Set<string>();
        [...suites, ...agents, ...runs].forEach((item) => {
          (item.tags || []).forEach((t: string) => tags.add(t));
        });
        if (active) setAllTags([...tags].sort());
      } catch {
        // ignore
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [workspaceReady, organizationId, projectId]);

  const setTag = useCallback(
    (t: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (t) params.set("tag", t);
      else params.delete("tag");
      const qs = params.toString();
      router.push(qs ? `?${qs}` : window.location.pathname);
    },
    [router, searchParams]
  );

  return (
    <TagFilterContext.Provider value={{ tag, setTag, allTags }}>
      {children}
    </TagFilterContext.Provider>
  );
}
