import { Select } from "antd";
import { Download, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { groupOptions, useLinkGroups } from "@/hooks/use-link-groups";
import { formatDateTime } from "@/lib/format";
import { logsApi } from "@/services/api";
import { getApiErrorMessage, saveBlob } from "@/services/api/client";
import type { AccessEvent, AccessLogQuery, AuditEvent, AuditLogQuery, PageResponse } from "@/services/api/types";
import { useAuthStore } from "@/stores/auth-store";

const PAGE_SIZE = 20;

const ACCESS_RESULT_BADGE: Record<AccessEvent["result"], { label: string; cls: string }> = {
  allowed: { label: "放行", cls: "ok" },
  denied: { label: "拒绝", cls: "bad" },
  challenge: { label: "挑战", cls: "warn" },
};

const AUDIT_RESULT_BADGE: Record<AuditEvent["result"], { label: string; cls: string }> = {
  success: { label: "成功", cls: "ok" },
  failure: { label: "失败", cls: "bad" },
};

interface AccessFilter {
  linkId: string;
  group: string;
  result: "" | "allowed" | "denied" | "challenge";
  from: string;
  to: string;
}

interface AuditFilter {
  action: string;
  result: "" | "success" | "failure";
  from: string;
  to: string;
}

const EMPTY_ACCESS_FILTER: AccessFilter = { linkId: "", group: "", result: "", from: "", to: "" };
const EMPTY_AUDIT_FILTER: AuditFilter = { action: "", result: "", from: "", to: "" };

function toRangeParam(from: string, to: string) {
  return {
    from: from ? `${from}T00:00:00+08:00` : undefined,
    to: to ? `${to}T23:59:59+08:00` : undefined,
  };
}

function emptyToDash(value: string | null | undefined) {
  return value && value.length > 0 ? value : "-";
}

function PaginationBar({
  page,
  pageSize,
  total,
  disabled,
  onPrev,
  onNext,
}: {
  page: number;
  pageSize: number;
  total: number;
  disabled: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--ink-2)]">
      <span className="font-mono">共 {total} 条 · 第 {page} / {totalPages} 页</span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={disabled || page <= 1}
          className="stub-btn ghost !h-7 !px-2.5 !text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          上一页
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={disabled || page >= totalPages}
          className="stub-btn ghost !h-7 !px-2.5 !text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          下一页
        </button>
      </div>
    </div>
  );
}

export default function LogsPage() {
  const { hasPermission, initialized } = useAuthStore();
  const canRead = hasPermission("logs.read_own");
  const groups = useLinkGroups(initialized && canRead && hasPermission("links.read"));
  const accessRequest = useRef(0);
  const auditRequest = useRef(0);
  const exportLock = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const [tab, setTab] = useState<"access" | "audit">("access");

  const [accessInput, setAccessInput] = useState<AccessFilter>(EMPTY_ACCESS_FILTER);
  const [accessFilter, setAccessFilter] = useState<AccessFilter>(EMPTY_ACCESS_FILTER);
  const [accessPage, setAccessPage] = useState(1);
  const [accessData, setAccessData] = useState<PageResponse<AccessEvent> | null>(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [auditInput, setAuditInput] = useState<AuditFilter>(EMPTY_AUDIT_FILTER);
  const [auditFilter, setAuditFilter] = useState<AuditFilter>(EMPTY_AUDIT_FILTER);
  const [auditPage, setAuditPage] = useState(1);
  const [auditData, setAuditData] = useState<PageResponse<AuditEvent> | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const accessQuery = useMemo<AccessLogQuery>(() => ({
    linkId: accessFilter.linkId.trim() || undefined,
    result: accessFilter.result || undefined,
    ...(accessFilter.group === "ungrouped" ? { ungrouped: true as const } : accessFilter.group ? { groupId: accessFilter.group } : {}),
    ...toRangeParam(accessFilter.from, accessFilter.to),
  }), [accessFilter]);
  const auditQuery = useMemo<AuditLogQuery>(() => ({
    action: auditFilter.action.trim() || undefined,
    result: auditFilter.result || undefined,
    ...toRangeParam(auditFilter.from, auditFilter.to),
  }), [auditFilter]);
  const accessScope = JSON.stringify([canRead, tab, accessPage, accessQuery]);
  const auditScope = JSON.stringify([canRead, tab, auditPage, auditQuery]);
  const accessScopeRef = useRef(accessScope);
  const auditScopeRef = useRef(auditScope);
  accessScopeRef.current = accessScope;
  auditScopeRef.current = auditScope;
  const [loadedAccessScope, setLoadedAccessScope] = useState("");
  const [loadedAuditScope, setLoadedAuditScope] = useState("");
  const accessPending = accessLoading || loadedAccessScope !== accessScope;
  const auditPending = auditLoading || loadedAuditScope !== auditScope;

  const loadAccess = useCallback(async () => {
    const requestId = ++accessRequest.current;
    if (!canRead || tab !== "access") return;
    const scope = accessScope;
    setAccessLoading(true);
    setAccessError(null);
    try {
      const result = await logsApi.access({ ...accessQuery, page: accessPage, pageSize: PAGE_SIZE });
      if (requestId !== accessRequest.current || accessScopeRef.current !== scope) return;
      setAccessData(result);
      setLoadedAccessScope(scope);
    } catch (error) {
      if (requestId !== accessRequest.current || accessScopeRef.current !== scope) return;
      setAccessData(null);
      setLoadedAccessScope(scope);
      setAccessError(getApiErrorMessage(error, "加载访问日志失败，请重试"));
    } finally {
      if (requestId === accessRequest.current && accessScopeRef.current === scope) setAccessLoading(false);
    }
  }, [canRead, tab, accessPage, accessQuery, accessScope]);

  const loadAudit = useCallback(async () => {
    const requestId = ++auditRequest.current;
    if (!canRead || tab !== "audit") return;
    const scope = auditScope;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const result = await logsApi.audit({ ...auditQuery, page: auditPage, pageSize: PAGE_SIZE });
      if (requestId !== auditRequest.current || auditScopeRef.current !== scope) return;
      setAuditData(result);
      setLoadedAuditScope(scope);
    } catch (error) {
      if (requestId !== auditRequest.current || auditScopeRef.current !== scope) return;
      setAuditData(null);
      setLoadedAuditScope(scope);
      setAuditError(getApiErrorMessage(error, "加载审计日志失败，请重试"));
    } finally {
      if (requestId === auditRequest.current && auditScopeRef.current === scope) setAuditLoading(false);
    }
  }, [canRead, tab, auditPage, auditQuery, auditScope]);

  useEffect(() => { void loadAccess(); return () => { accessRequest.current++; }; }, [loadAccess]);
  useEffect(() => { void loadAudit(); return () => { auditRequest.current++; }; }, [loadAudit]);

  const exportCSV = async () => {
    if (exportLock.current || !canRead) return;
    // Only applied filters participate; inputs may contain an unsubmitted draft.
    const query = tab === "access" ? accessQuery : auditQuery;
    const exportTab = tab;
    if (query.from && query.to && (Date.parse(query.to) < Date.parse(query.from) || Date.parse(query.to) - Date.parse(query.from) > 90 * 86400000)) {
      setExportError("日志导出日期范围需为 90 天以内，结束日期不能早于开始日期"); return;
    }
    exportLock.current = true; setExporting(true); setExportError("");
    try {
      const blob = exportTab === "access" ? await logsApi.exportAccessCSV(query) : await logsApi.exportAuditCSV(auditQuery);
      saveBlob(blob, `${exportTab}-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`);
    } catch (error) { setExportError(getApiErrorMessage(error, "导出日志失败，请稍后重试")); }
    finally { exportLock.current = false; setExporting(false); }
  };

  const applyAccessFilter = (e: FormEvent) => {
    e.preventDefault();
    setAccessFilter(accessInput);
    setAccessPage(1);
  };

  const applyAuditFilter = (e: FormEvent) => {
    e.preventDefault();
    setAuditFilter(auditInput);
    setAuditPage(1);
  };

  const accessItems = loadedAccessScope === accessScope ? accessData?.items || [] : [];
  const auditItems = loadedAuditScope === auditScope ? auditData?.items || [] : [];

  return (
    <div className="flex flex-col gap-6">
      {/* 页头 */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-cn-display text-[28px] font-black tracking-tight">访问与审计日志</h1>
          <p className="mt-1 text-[13px] text-[var(--ink-2)]">
            时区 Asia/Shanghai · 访问日志记录短链命中，审计日志记录账号操作
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex gap-1 rounded border border-[var(--line-2)] bg-[var(--paper-3)] p-1">
            {(
              [
                ["access", "访问日志"],
                ["audit", "审计日志"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`cursor-pointer rounded px-3 py-1 font-mono text-xs ${
                  tab === key ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink-2)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {canRead && <button type="button" disabled={exporting || (tab === "access" ? accessPending || Boolean(accessError) : auditPending || Boolean(auditError))} onClick={() => void exportCSV()} className="stub-btn ghost !h-9" title="导出已应用筛选，最多 10000 条 / 20 MiB、90 天，每小时最多 10 次"><Download size={14} />{exporting ? "正在导出…" : "导出 CSV"}</button>}
          <button
            type="button"
            disabled={!canRead || (tab === "access" ? accessPending : auditPending)}
            onClick={() => {
              void loadAccess();
              void loadAudit();
            }}
            className="stub-btn ghost !h-9"
          >
            <RefreshCw
              size={14}
              className={(tab === "access" ? accessLoading : auditLoading) ? "animate-spin" : undefined}
            />
            刷新
          </button>
        </div>
      </div>

      {exportError && <p role="alert" className="text-xs text-[var(--signal-ink)]">{exportError}</p>}
      {!initialized ? (
        <div className="rounded-md border border-[var(--line-2)] bg-[var(--paper-3)] p-10 text-center text-sm text-[var(--ink-3)]">
          正在加载账号权限…
        </div>
      ) : !canRead ? (
        <div className="rounded-md border border-[var(--line-2)] bg-[var(--paper-3)] p-10 text-center text-sm text-[var(--ink-3)]">
          当前账号没有 logs.read_own 权限，无法查看日志。请联系管理员开通。
        </div>
      ) : (
        <>
          {tab === "access" ? (
            <>
              {accessError && (
                <div className="rounded border-l-[3px] border-[var(--signal)] bg-[#fff5f0] p-3 text-xs text-[var(--ink-2)]">
                  {accessError}
                </div>
              )}
              <form
                onSubmit={applyAccessFilter}
                className="flex flex-wrap items-end gap-3 rounded-md border border-[var(--line-2)] bg-[var(--paper-3)] p-4"
              >
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--ink-2)]">短链 ID (linkId)</label>
                  <input
                    value={accessInput.linkId}
                    onChange={(e) => setAccessInput({ ...accessInput, linkId: e.target.value })}
                    placeholder="linkId"
                    className="h-9 w-56 rounded border border-[var(--line-2)] bg-[var(--paper)] px-3 font-mono text-xs outline-none"
                  />
                </div>
                <div className="flex min-w-48 flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--ink-2)]" htmlFor="access-group">当前分组</label>
                  <Select id="access-group" value={accessInput.group} loading={groups.loading} onChange={(value: string) => setAccessInput({ ...accessInput, group: value })} options={[{ value: "", label: "全部分组" }, { value: "ungrouped", label: "未分组" }, ...groupOptions(groups.items, accessInput.group === "ungrouped" ? null : accessInput.group)]} />
                  {groups.error && <p role="alert" className="text-xs text-[var(--signal-ink)]">{groups.error} <button type="button" disabled={groups.loading} onClick={() => void groups.reload()} className="underline">重试分组</button></p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--ink-2)]">结果 (result)</label>
                  <select
                    value={accessInput.result}
                    onChange={(e) =>
                      setAccessInput({ ...accessInput, result: e.target.value as AccessFilter["result"] })
                    }
                    className="h-9 w-32 rounded border border-[var(--line-2)] bg-[var(--paper)] px-2 text-xs outline-none"
                  >
                    <option value="">全部</option>
                    <option value="allowed">放行</option>
                    <option value="denied">拒绝</option>
                    <option value="challenge">挑战</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--ink-2)]">开始日期 (from)</label>
                  <input
                    type="date"
                    value={accessInput.from}
                    onChange={(e) => setAccessInput({ ...accessInput, from: e.target.value })}
                    className="h-9 w-40 rounded border border-[var(--line-2)] bg-[var(--paper)] px-3 font-mono text-xs outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--ink-2)]">结束日期 (to)</label>
                  <input
                    type="date"
                    value={accessInput.to}
                    onChange={(e) => setAccessInput({ ...accessInput, to: e.target.value })}
                    className="h-9 w-40 rounded border border-[var(--line-2)] bg-[var(--paper)] px-3 font-mono text-xs outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="stub-btn !h-9">
                    查询
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAccessInput(EMPTY_ACCESS_FILTER);
                      setAccessFilter(EMPTY_ACCESS_FILTER);
                      setAccessPage(1);
                    }}
                    className="stub-btn ghost !h-9"
                  >
                    重置
                  </button>
                </div>
              </form>

              <div className="overflow-hidden rounded-md border border-[var(--line-2)] bg-[var(--paper-3)]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[980px] text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-[var(--line-2)] bg-[var(--paper-2)]">
                        {["时间", "短链 ID", "来源 IP", "结果", "原因", "消耗次数", "User-Agent", "Request ID"].map(
                          (h) => (
                            <th
                              key={h}
                              className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] font-medium tracking-wide text-[var(--ink-3)]"
                            >
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {accessPending && (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-xs text-[var(--ink-3)]">
                            加载中…
                          </td>
                        </tr>
                      )}
                      {!accessPending &&
                        accessItems.map((item) => {
                          const badge = ACCESS_RESULT_BADGE[item.result];
                          return (
                            <tr key={item.eventId} className="border-b border-[var(--line)] last:border-b-0">
                              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                                {formatDateTime(item.accessedAt)}
                              </td>
                              <td className="max-w-[160px] truncate px-4 py-3 font-mono text-xs" title={item.linkId}>
                                {item.linkId}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                                {emptyToDash(item.sourceIp)}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`stub-badge ${badge.cls}`}>{badge.label}</span>
                              </td>
                              <td
                                className="max-w-[160px] truncate px-4 py-3 text-xs"
                                title={emptyToDash(item.reason)}
                              >
                                {emptyToDash(item.reason)}
                              </td>
                              <td className="px-4 py-3 text-center text-xs">{item.consumesVisit ? "是" : "否"}</td>
                              <td
                                className="max-w-[220px] truncate px-4 py-3 text-xs text-[var(--ink-2)]"
                                title={emptyToDash(item.userAgent)}
                              >
                                {emptyToDash(item.userAgent)}
                              </td>
                              <td
                                className="max-w-[130px] truncate px-4 py-3 font-mono text-[11px] text-[var(--ink-3)]"
                                title={emptyToDash(item.requestId)}
                              >
                                {emptyToDash(item.requestId)}
                              </td>
                            </tr>
                          );
                        })}
                      {!accessPending && accessItems.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-xs text-[var(--ink-3)]">
                            暂无访问日志，调整筛选条件后重试
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <PaginationBar
                  page={accessPage}
                  pageSize={accessData?.pagination.pageSize || PAGE_SIZE}
                  total={accessData?.pagination.total || 0}
                  disabled={accessPending}
                  onPrev={() => setAccessPage((p) => Math.max(1, p - 1))}
                  onNext={() => setAccessPage((p) => p + 1)}
                />
              </div>
            </>
          ) : (
            <>
              {auditError && (
                <div className="rounded border-l-[3px] border-[var(--signal)] bg-[#fff5f0] p-3 text-xs text-[var(--ink-2)]">
                  {auditError}
                </div>
              )}
              <form
                onSubmit={applyAuditFilter}
                className="flex flex-wrap items-end gap-3 rounded-md border border-[var(--line-2)] bg-[var(--paper-3)] p-4"
              >
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--ink-2)]">动作 (action)</label>
                  <input
                    value={auditInput.action}
                    onChange={(e) => setAuditInput({ ...auditInput, action: e.target.value })}
                    placeholder="action"
                    className="h-9 w-56 rounded border border-[var(--line-2)] bg-[var(--paper)] px-3 font-mono text-xs outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--ink-2)]">结果 (result)</label>
                  <select
                    value={auditInput.result}
                    onChange={(e) => setAuditInput({ ...auditInput, result: e.target.value as AuditFilter["result"] })}
                    className="h-9 w-32 rounded border border-[var(--line-2)] bg-[var(--paper)] px-2 text-xs outline-none"
                  >
                    <option value="">全部</option>
                    <option value="success">成功</option>
                    <option value="failure">失败</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--ink-2)]">开始日期 (from)</label>
                  <input
                    type="date"
                    value={auditInput.from}
                    onChange={(e) => setAuditInput({ ...auditInput, from: e.target.value })}
                    className="h-9 w-40 rounded border border-[var(--line-2)] bg-[var(--paper)] px-3 font-mono text-xs outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--ink-2)]">结束日期 (to)</label>
                  <input
                    type="date"
                    value={auditInput.to}
                    onChange={(e) => setAuditInput({ ...auditInput, to: e.target.value })}
                    className="h-9 w-40 rounded border border-[var(--line-2)] bg-[var(--paper)] px-3 font-mono text-xs outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="stub-btn !h-9">
                    查询
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAuditInput(EMPTY_AUDIT_FILTER);
                      setAuditFilter(EMPTY_AUDIT_FILTER);
                      setAuditPage(1);
                    }}
                    className="stub-btn ghost !h-9"
                  >
                    重置
                  </button>
                </div>
              </form>

              <div className="overflow-hidden rounded-md border border-[var(--line-2)] bg-[var(--paper-3)]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1080px] text-left text-[13px]">
                    <thead>
                      <tr className="border-b border-[var(--line-2)] bg-[var(--paper-2)]">
                        {["时间", "操作者", "动作", "资源", "结果", "来源 IP", "详情", "Request ID"].map((h) => (
                          <th
                            key={h}
                            className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] font-medium tracking-wide text-[var(--ink-3)]"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {auditPending && (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-xs text-[var(--ink-3)]">
                            加载中…
                          </td>
                        </tr>
                      )}
                      {!auditPending &&
                        auditItems.map((item) => {
                          const badge = AUDIT_RESULT_BADGE[item.result];
                          const resource =
                            item.resourceType && item.resourceId
                              ? `${item.resourceType}:${item.resourceId}`
                              : emptyToDash(item.resourceType);
                          const detailsText =
                            item.details && Object.keys(item.details).length > 0
                              ? JSON.stringify(item.details)
                              : "-";
                          return (
                            <tr key={item.eventId} className="border-b border-[var(--line)] last:border-b-0">
                              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                                {formatDateTime(item.occurredAt)}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 text-xs">
                                {item.actorType === "user" ? "用户" : "系统"}
                                {item.actorId ? (
                                  <span className="font-mono text-[var(--ink-3)]"> · {item.actorId}</span>
                                ) : null}
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">{item.action}</td>
                              <td className="max-w-[180px] truncate px-4 py-3 font-mono text-xs" title={resource}>
                                {resource}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`stub-badge ${badge.cls}`}>{badge.label}</span>
                              </td>
                              <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                                {emptyToDash(item.sourceIp)}
                              </td>
                              <td
                                className="max-w-[220px] truncate px-4 py-3 font-mono text-[11px] text-[var(--ink-2)]"
                                title={detailsText}
                              >
                                {detailsText}
                              </td>
                              <td
                                className="max-w-[130px] truncate px-4 py-3 font-mono text-[11px] text-[var(--ink-3)]"
                                title={emptyToDash(item.requestId)}
                              >
                                {emptyToDash(item.requestId)}
                              </td>
                            </tr>
                          );
                        })}
                      {!auditPending && auditItems.length === 0 && (
                        <tr>
                          <td colSpan={8} className="py-10 text-center text-xs text-[var(--ink-3)]">
                            暂无审计日志，调整筛选条件后重试
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <PaginationBar
                  page={auditPage}
                  pageSize={auditData?.pagination.pageSize || PAGE_SIZE}
                  total={auditData?.pagination.total || 0}
                  disabled={auditPending}
                  onPrev={() => setAuditPage((p) => Math.max(1, p - 1))}
                  onNext={() => setAuditPage((p) => p + 1)}
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}