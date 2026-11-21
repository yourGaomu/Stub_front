import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mergeOptions } from "@/lib/options";
import { getApiErrorMessage } from "@/services/api/client";
import type { PageResponse } from "@/services/api/types";

const PAGE_SIZE = 20;

export function useRemoteOptions<T>({ enabled, resetKey, selectedId, getId, loadPage }: {
  enabled: boolean;
  resetKey: string;
  selectedId: string;
  getId: (item: T) => string;
  loadPage: (query: { page: number; pageSize: number; keyword?: string }) => Promise<PageResponse<T>>;
}) {
  const [searchState, setSearchState] = useState({ resetKey, value: "" });
  const search = searchState.resetKey === resetKey ? searchState.value : "";
  const scope = JSON.stringify([enabled, resetKey, search]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const generation = useRef(0);
  const lock = useRef(false);
  const [state, setState] = useState<{ scope: string; items: T[]; page: number; hasMore: boolean; loading: boolean; error: string }>({ scope: "", items: [], page: 0, hasMore: false, loading: false, error: "" });
  const stateRef = useRef(state);
  stateRef.current = state;
  const [selectedCache, setSelectedCache] = useState<Record<string, T>>({});
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const cacheSelection = useCallback((id: string) => {
    const item = stateRef.current.items.find((option) => getId(option) === id);
    if (item) setSelectedCache((previous) => ({ ...previous, [id]: item }));
  }, [getId]);
  useEffect(() => { cacheSelection(selectedId); }, [selectedId, state.items, cacheSelection]);

  const fetchPage = useCallback(async (page: number, version: number) => {
    if (!enabled || version !== generation.current || scopeRef.current !== scope || lock.current) return;
    lock.current = true;
    setState((previous) => ({ ...previous, scope, items: page === 1 ? [] : previous.items, page: page === 1 ? 0 : previous.page, hasMore: page === 1 ? false : previous.hasMore, loading: true, error: "" }));
    try {
      const result = await loadPage({ page, pageSize: PAGE_SIZE, keyword: search.trim() || undefined });
      if (version !== generation.current || scopeRef.current !== scope) return;
      const selected = result.items.find((item) => getId(item) === selectedRef.current);
      if (selected) setSelectedCache((previous) => ({ ...previous, [getId(selected)]: selected }));
      setState((previous) => ({ scope, items: mergeOptions(getId, page === 1 ? [] : previous.items, result.items), page, hasMore: page * PAGE_SIZE < result.pagination.total, loading: false, error: "" }));
    } catch (error) {
      if (version !== generation.current || scopeRef.current !== scope) return;
      setState((previous) => ({ ...previous, loading: false, error: getApiErrorMessage(error, "选项加载失败，请重试") }));
    } finally {
      if (version === generation.current) lock.current = false;
    }
  }, [enabled, scope, search, loadPage, getId]);

  useEffect(() => {
    const version = ++generation.current;
    lock.current = false;
    if (!enabled) return;
    setState({ scope, items: [], page: 0, hasMore: false, loading: true, error: "" });
    const timer = window.setTimeout(() => { void fetchPage(1, version); }, search ? 300 : 0);
    return () => { window.clearTimeout(timer); generation.current++; lock.current = false; };
  }, [enabled, scope, fetchPage, search]);

  const items = enabled && state.scope === scope ? state.items : [];
  const options = useMemo(() => mergeOptions(getId, selectedId && selectedCache[selectedId] ? [selectedCache[selectedId]] : [], items), [getId, selectedId, selectedCache, items]);
  const loading = enabled && (state.scope !== scope || state.loading);
  return {
    search,
    setSearch: (value: string) => {
      if (value === search) return;
      // Invalidate synchronously, including before the debounce effect runs.
      generation.current++; lock.current = false;
      setSearchState({ resetKey, value });
    },
    items,
    options,
    cacheSelection,
    loading,
    error: enabled && state.scope === scope ? state.error : "",
    hasMore: enabled && state.scope === scope && state.hasMore,
    loadMore: () => { if (!loading && state.hasMore && !state.error) void fetchPage(state.page + 1, generation.current); },
    retry: () => { if (!loading) void fetchPage(state.page + 1, generation.current); },
  };
}
