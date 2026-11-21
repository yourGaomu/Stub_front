import { useCallback, useEffect, useRef, useState } from "react";
import { linkGroupsApi } from "@/services/api";
import { getApiErrorMessage } from "@/services/api/client";
import type { GroupDTO } from "@/services/api/types";

export function groupOptions(groups: GroupDTO[], selectedId?: string | null, selectedName?: string | null) {
  const options = groups.map((group) => ({ value: group.groupId, label: `${group.name} (${group.linkCount})` }));
  if (selectedId && !groups.some((group) => group.groupId === selectedId)) {
    options.unshift({ value: selectedId, label: selectedName || `当前分组 · ${selectedId}` });
  }
  return options;
}

export function isWorkspaceId(value: string): boolean {
  return /^ws_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function notifyGroupsChanged() {
  window.dispatchEvent(new Event("stub:link-groups-changed"));
}

export function useLinkGroups(enabled: boolean, workspaceId?: string) {
  const [state, setState] = useState<{ scope: string; items: GroupDTO[]; loading: boolean; error: string; loaded: boolean }>({ scope: "", items: [], loading: false, error: "", loaded: false });
  const version = useRef(0);
  const scope = JSON.stringify([enabled, workspaceId]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const reload = useCallback(async () => {
    const requestId = ++version.current;
    if (!enabled) return;
    setState((previous) => ({ scope, items: previous.scope === scope ? previous.items : [], loading: true, error: "", loaded: false }));
    try {
      const result = await linkGroupsApi.list({ workspaceId, page: 1, pageSize: 100 });
      if (requestId !== version.current || scopeRef.current !== scope) return;
      setState({ scope, items: result.items, loading: false, error: "", loaded: true });
    } catch (error) {
      if (requestId !== version.current || scopeRef.current !== scope) return;
      setState((previous) => ({ ...previous, scope, loading: false, error: getApiErrorMessage(error, "分组列表加载失败，请重试"), loaded: false }));
    }
  }, [enabled, workspaceId, scope]);
  useEffect(() => {
    void reload();
    const changed = () => { void reload(); };
    window.addEventListener("stub:link-groups-changed", changed);
    return () => { version.current++; window.removeEventListener("stub:link-groups-changed", changed); };
  }, [reload]);
  return {
    items: enabled && state.scope === scope ? state.items : [],
    loading: enabled && (state.scope !== scope || state.loading),
    error: enabled && state.scope === scope ? state.error : "",
    loaded: enabled && state.scope === scope && state.loaded,
    reload,
  };
}
