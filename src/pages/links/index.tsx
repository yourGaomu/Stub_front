import { App, Checkbox, Drawer, Modal, Pagination, Select } from "antd";
import dayjs from "dayjs";
import {
  Copy,
  Download,
  FolderCog,
  Eye,
  Flame,
  Pencil,
  Plus,
  Power,
  QrCode,
  RefreshCw,
  RotateCcw,
  Shuffle,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import type { LinkQuickPreset } from "@/components/create-link-drawer";
import { LinkGroupManager } from "@/components/link-group-manager";
import { groupOptions, isWorkspaceId, notifyGroupsChanged, useLinkGroups } from "@/hooks/use-link-groups";
import { LinkQRModal } from "@/components/link-qr-modal";
import { useCopy } from "@/hooks/use-copy";
import { formatDateTime, formatMB, getPublicBaseURL } from "@/lib/format";
import { ACCESS_PASSWORD_MAX_BYTES, CIDRS_MAX_LENGTH, buildRulesPatch, localExpiration, localWindowTime, renewalExpiration } from "@/lib/link-form";
import { linksApi, logsApi } from "@/services/api";
import { getApiErrorMessage, saveBlob } from "@/services/api/client";
import type { AnalyticsResponse, LinkDTO, LinkListItem, LinkListQuery } from "@/services/api/types";
import { useAuthStore } from "@/stores/auth-store";

interface ConsoleOutletContext {
  openCreateLink: (preset?: LinkQuickPreset) => void;
  copyLinkConfiguration: (source: LinkDTO) => void;
}

interface BatchResult {
  linkId: string;
  code: string;
  success: boolean;
  reason: string;
}

const AVAILABILITY_BADGE: Record<LinkDTO["availability"], { label: string; cls: string }> = {
  available: { label: "可用", cls: "ok" },
  expired: { label: "已过期", cls: "warn" },
  window_ended: { label: "开放结束", cls: "warn" },
  not_started: { label: "尚未开放", cls: "neutral" },
  visit_limit_reached: { label: "次数耗尽", cls: "warn" },
  disabled: { label: "已停用", cls: "bad" },
};

export default function LinksPage() {
  const { message } = App.useApp();
  const copy = useCopy();
  const { openCreateLink, copyLinkConfiguration } = useOutletContext<ConsoleOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, initialized, hasPermission, refreshUsage } = useAuthStore();
  const requestedLinkId = searchParams.get("linkId");
  const canRead = hasPermission("links.read");

  const [items, setItems] = useState<LinkListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const analyticsRequest = useRef(0);
  const detailId = useRef<string | null>(null);
  const mounted = useRef(true);
  const busyIds = useRef(new Set<string>());
  const [busyLinkIds, setBusyLinkIds] = useState(new Set<string>());
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchAction, setBatchAction] = useState<"enable" | "disable" | "move_group" | null>(null);
  const [batchGroupId, setBatchGroupId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportLock = useRef(false);
  const [appliedQuery, setAppliedQuery] = useState<LinkListQuery | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const batchLock = useRef(false);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [batchTotal, setBatchTotal] = useState(0);
  const batchResultsScope = useRef("");
  const [resetTarget, setResetTarget] = useState<LinkListItem | LinkDTO | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");
  const [actionError, setActionError] = useState("");
  const actionLock = useRef(new Set<string>());

  const [targetType, setTargetType] = useState<string>("");
  const [availability, setAvailability] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [codeFilter, setCodeFilter] = useState<string>(searchParams.get("code") || "");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [assetIdFilter, setAssetIdFilter] = useState("");
  const [workspaceIdFilter, setWorkspaceIdFilter] = useState<string>("");
  const [groupFilter, setGroupFilter] = useState("");
  const [groupsOpen, setGroupsOpen] = useState(false);
  const groupWorkspace = isAdmin && isWorkspaceId(workspaceIdFilter.trim()) ? workspaceIdFilter.trim() : undefined;
  const groups = useLinkGroups(hasPermission("links.read"), groupWorkspace);
  const currentQuery = useMemo<LinkListQuery>(() => ({
    page, pageSize,
    targetType: targetType || undefined,
    availability: availability || undefined,
    status: status || undefined,
    code: codeFilter.trim() || undefined,
    keyword: keywordFilter.trim() || undefined,
    assetId: assetIdFilter.trim() || undefined,
    workspaceId: isAdmin && workspaceIdFilter.trim() ? workspaceIdFilter.trim() : undefined,
    ...(groupFilter === "ungrouped" ? { ungrouped: true as const } : groupFilter ? { groupId: groupFilter } : {}),
  }), [page, pageSize, targetType, availability, status, codeFilter, keywordFilter, assetIdFilter, isAdmin, workspaceIdFilter, groupFilter]);

  // 详情抽屉
  const [activeLink, setActiveLink] = useState<LinkDTO | null>(null);
  const [linkAnalytics, setLinkAnalytics] = useState<AnalyticsResponse | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");

  const [metadataTarget, setMetadataTarget] = useState<LinkDTO | null>(null);
  const [metadataTitle, setMetadataTitle] = useState("");
  const [metadataTags, setMetadataTags] = useState<string[]>([]);
  const [metadataGroupId, setMetadataGroupId] = useState<string | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [rulesTarget, setRulesTarget] = useState<LinkDTO | null>(null);
  const [rulesExpiresAt, setRulesExpiresAt] = useState("");
  const [rulesActiveFrom, setRulesActiveFrom] = useState("");
  const [rulesActiveUntil, setRulesActiveUntil] = useState("");
  const initialRulesExpiration = useRef("");
  const [rulesMaxVisits, setRulesMaxVisits] = useState("-1");
  const [rulesCIDRs, setRulesCIDRs] = useState("");
  const [rulesRequirePassword, setRulesRequirePassword] = useState(false);
  const [rulesPassword, setRulesPassword] = useState("");
  const [rulesPasswordStrategy, setRulesPasswordStrategy] = useState<
    "fixed_cooldown" | "progressive_cooldown"
  >("fixed_cooldown");
  const [rulesLoading, setRulesLoading] = useState(false);

  // 续期弹窗
  const [renewTarget, setRenewTarget] = useState<LinkListItem | LinkDTO | null>(null);
  const [renewExpire, setRenewExpire] = useState(dayjs().add(7, "day").format("YYYY-MM-DDTHH:mm"));
  const [renewCodeStrategy, setRenewCodeStrategy] = useState<"keep" | "generated">("keep");
  const [renewLoading, setRenewLoading] = useState(false);

  // 更换短码弹窗
  const [rotateTarget, setRotateTarget] = useState<LinkListItem | LinkDTO | null>(null);
  const [rotateStrategy, setRotateStrategy] = useState<"generated" | "custom">("generated");
  const [rotateCustomCode, setRotateCustomCode] = useState("");
  const [rotateLoading, setRotateLoading] = useState(false);

  // 二维码弹窗
  const [qrTarget, setQrTarget] = useState<{ code: string; url: string } | null>(null);

  const queryScope = JSON.stringify([currentQuery, isAdmin]);
  const scopeRef = useRef(queryScope);
  const scopeChanged = scopeRef.current !== queryScope;
  scopeRef.current = queryScope;
  const [loadedScope, setLoadedScope] = useState("");
  const listPending = loading || loadedScope !== queryScope;
  const visibleItems = loadedScope === queryScope ? items : [];

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      listRequest.current++;
      detailRequest.current++;
      analyticsRequest.current++;
    };
  }, []);

  useEffect(() => {
    const qCode = searchParams.get("code") || "";
    if (qCode !== codeFilter) {
      setCodeFilter(qCode);
      setPage(1);
    }
  }, [searchParams]);

  useEffect(() => {
    setSelectedIds([]);
    if (!batchLock.current) {
      setBatchAction(null);
      setBatchResults([]);
      setBatchTotal(0);
    }
  }, [queryScope]);

  const fetchList = useCallback(async () => {
    const requestId = ++listRequest.current;
    const scope = queryScope;
    setLoading(true);
    setListError("");
    try {
      const res = await linksApi.list(currentQuery);
      if (!mounted.current || requestId !== listRequest.current || scopeRef.current !== scope) return;
      setItems(res.items);
      setTotal(res.pagination.total);
      setAppliedQuery(currentQuery);
      setLoadedScope(scope);
    } catch (error) {
      if (!mounted.current || requestId !== listRequest.current || scopeRef.current !== scope) return;
      setItems([]);
      setTotal(0);
      setLoadedScope(scope);
      setListError(getApiErrorMessage(error, "加载短链列表失败，请重试"));
    } finally {
      if (mounted.current && requestId === listRequest.current && scopeRef.current === scope) setLoading(false);
    }
  }, [currentQuery, queryScope]);
  const fetchListRef = useRef(fetchList);
  fetchListRef.current = fetchList;

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchList(); }, 300);
    return () => { window.clearTimeout(timer); listRequest.current++; };
  }, [fetchList]);

  useEffect(() => {
    const onCreated = () => { void fetchListRef.current(); notifyGroupsChanged(); };
    window.addEventListener("stub:link-created", onCreated);
    return () => window.removeEventListener("stub:link-created", onCreated);
  }, []);

  const fetchAnalytics = useCallback(async (linkId: string) => {
    const requestId = ++analyticsRequest.current;
    setLinkAnalytics(null);
    setAnalyticsError("");
    setAnalyticsLoading(true);
    try {
      const result = await logsApi.analyticsLink(linkId, { range: "7d", timeZone: "Asia/Shanghai" });
      if (mounted.current && requestId === analyticsRequest.current && detailId.current === linkId) setLinkAnalytics(result);
    } catch (error) {
      if (mounted.current && requestId === analyticsRequest.current && detailId.current === linkId) {
        setAnalyticsError(getApiErrorMessage(error, "统计加载失败，请重试"));
      }
    } finally {
      if (mounted.current && requestId === analyticsRequest.current && detailId.current === linkId) setAnalyticsLoading(false);
    }
  }, []);

  const openDetail = useCallback(async (linkId: string) => {
    const requestId = ++detailRequest.current;
    analyticsRequest.current++;
    detailId.current = linkId;
    setActiveLink(null);
    setLinkAnalytics(null);
    setDetailError("");
    setAnalyticsError("");
    setAnalyticsLoading(false);
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const detail = await linksApi.get(linkId);
      if (!mounted.current || requestId !== detailRequest.current || detailId.current !== linkId) return;
      setActiveLink(detail);
      if (hasPermission("links.read")) void fetchAnalytics(linkId);
    } catch (error) {
      if (mounted.current && requestId === detailRequest.current && detailId.current === linkId) {
        setDetailError(getApiErrorMessage(error, "读取短链详情失败，请重试"));
      }
    } finally {
      if (mounted.current && requestId === detailRequest.current && detailId.current === linkId) setDetailLoading(false);
    }
  }, [fetchAnalytics, hasPermission]);

  useEffect(() => {
    if (!requestedLinkId || !initialized) return;
    // A cleanup before the next tick leaves the deep link available to the live mount.
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams(searchParams);
      query.delete("linkId");
      setSearchParams(query, { replace: true });
      if (canRead) void openDetail(requestedLinkId);
      else message.warning("当前账号没有读取短链的权限");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [requestedLinkId, initialized, canRead, searchParams, setSearchParams, openDetail, message]);

  const closeDetail = () => {
    detailId.current = null;
    detailRequest.current++;
    analyticsRequest.current++;
    setDetailOpen(false);
    setActiveLink(null);
    setLinkAnalytics(null);
  };

  const acquireLink = (linkId: string) => {
    if (busyIds.current.has(linkId)) return false;
    busyIds.current.add(linkId);
    setBusyLinkIds(new Set(busyIds.current));
    return true;
  };
  const releaseLink = (linkId: string) => {
    busyIds.current.delete(linkId);
    if (mounted.current) setBusyLinkIds(new Set(busyIds.current));
  };
  const refreshAfterChange = (linkId: string, updated?: LinkDTO) => {
    void fetchListRef.current();
    if (detailId.current !== linkId) return;
    if (updated) {
      detailRequest.current++;
      setActiveLink(updated);
      if (hasPermission("links.read")) void fetchAnalytics(linkId);
    } else {
      void openDetail(linkId);
    }
  };

  const handleToggleStatus = async (item: LinkListItem | LinkDTO) => {
    if (!hasPermission("links.manage") || !acquireLink(item.linkId)) return;
    try {
      if (item.status === "enabled") await linksApi.disable(item.linkId);
      else await linksApi.enable(item.linkId);
      message.success(item.status === "enabled" ? "短链已停用" : "短链已恢复启用");
      refreshAfterChange(item.linkId);
    } catch (error) {
      message.error(getApiErrorMessage(error, "操作失败，请重试"));
    } finally { releaseLink(item.linkId); }
  };

  const handleResetVisits = (item: LinkListItem | LinkDTO) => {
    if (busyIds.current.has(item.linkId)) return;
    setResetTarget(item);
    setResetError("");
  };
  const handleResetSubmit = async () => {
    if (!resetTarget || !hasPermission("links.reset_visits") || !acquireLink(resetTarget.linkId)) return;
    const target = resetTarget;
    setResetLoading(true);
    setResetError("");
    try {
      await linksApi.resetVisits(target.linkId);
      setResetTarget(null);
      message.success("已重置访问计数，历史日志保留");
      refreshAfterChange(target.linkId);
    } catch (error) {
      setResetError(getApiErrorMessage(error, "重置失败，请重试"));
    } finally { setResetLoading(false); releaseLink(target.linkId); }
  };

  const openRenew = (item: LinkListItem | LinkDTO) => {
    if (busyIds.current.has(item.linkId) || actionLock.current.has("renew")) return;
    setRenewTarget(item);
    setRenewExpire(renewalExpiration(item.expiresAt));
    setRenewCodeStrategy("keep");
    setActionError("");
  };
  const openRotate = (item: LinkListItem | LinkDTO) => {
    if (busyIds.current.has(item.linkId) || actionLock.current.has("rotate")) return;
    setRotateTarget(item);
    setRotateStrategy("generated");
    setRotateCustomCode("");
    setActionError("");
  };

  const handleRenewSubmit = async () => {
    if (!renewTarget || actionLock.current.has("renew")) return;
    const parsed = dayjs(renewExpire);
    if (!parsed.isValid() || !parsed.isAfter(dayjs())) {
      setActionError("新到期时间必须晚于当前时间");
      return;
    }
    const target = renewTarget;
    if (!acquireLink(target.linkId)) return;
    actionLock.current.add("renew");
    setRenewLoading(true);
    setActionError("");
    try {
      const res = await linksApi.renew(target.linkId, { expiresAt: parsed.toISOString(), codeStrategy: renewCodeStrategy });
      message.success(res.codeChanged ? `续期成功，新短码 /r/${res.code}` : "续期成功");
      setRenewTarget(null);
      void refreshUsage();
      refreshAfterChange(target.linkId);
    } catch (error) { setActionError(getApiErrorMessage(error, "续期失败，请重试")); }
    finally { actionLock.current.delete("renew"); setRenewLoading(false); releaseLink(target.linkId); }
  };

  const handleRotateSubmit = async () => {
    if (!rotateTarget || actionLock.current.has("rotate")) return;
    const code = rotateCustomCode.trim().toLowerCase();
    if (rotateStrategy === "custom" && !/^[a-z0-9-]{4,64}$/.test(code)) {
      setActionError("新短码必须为 4–64 位小写字母、数字或 -");
      return;
    }
    const target = rotateTarget;
    if (!acquireLink(target.linkId)) return;
    actionLock.current.add("rotate");
    setRotateLoading(true);
    setActionError("");
    try {
      const res = await linksApi.rotateCode(target.linkId, { strategy: rotateStrategy, ...(rotateStrategy === "custom" ? { code } : {}) });
      message.success(`短码已更换：/r/${res.oldCode} → /r/${res.code}`);
      setRotateTarget(null);
      refreshAfterChange(target.linkId);
    } catch (error) { setActionError(getApiErrorMessage(error, "更换短码失败，请重试")); }
    finally { actionLock.current.delete("rotate"); setRotateLoading(false); releaseLink(target.linkId); }
  };

  const handleMetadataSubmit = async () => {
    if (!metadataTarget || actionLock.current.has("metadata")) return;
    if (metadataTitle.trim().length > 120 || metadataTags.length > 20 || metadataTags.some((tag) => tag.trim().length > 32)) {
      setActionError("标题最多 120 字，最多 20 个标签且每个标签不超过 32 字");
      return;
    }
    const target = metadataTarget;
    if (!acquireLink(target.linkId)) return;
    actionLock.current.add("metadata");
    setMetadataLoading(true);
    setActionError("");
    try {
      const updated = await linksApi.updateMetadata(target.linkId, { title: metadataTitle.trim(), tags: metadataTags.map((tag) => tag.trim()).filter(Boolean), groupId: metadataGroupId });
      setMetadataTarget(null);
      message.success("短链标题、标签和分组已更新");
      notifyGroupsChanged();
      refreshAfterChange(target.linkId, updated);
    } catch (error) { setActionError(getApiErrorMessage(error, "更新短链信息失败，请重试")); }
    finally { actionLock.current.delete("metadata"); setMetadataLoading(false); releaseLink(target.linkId); }
  };

  const handleRulesSubmit = async () => {
    if (!rulesTarget || actionLock.current.has("rules")) return;
    let patch;
    try {
      patch = buildRulesPatch(rulesTarget, initialRulesExpiration.current, {
        expiresAt: rulesExpiresAt, activeFrom: rulesActiveFrom, activeUntil: rulesActiveUntil,
        maxVisits: rulesMaxVisits, cidrs: rulesCIDRs,
        requirePassword: rulesRequirePassword, password: rulesPassword, passwordStrategy: rulesPasswordStrategy,
      });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "请检查规则参数");
      return;
    }
    if (Object.keys(patch).length === 0) { message.info("规则未修改"); setRulesTarget(null); return; }
    const target = rulesTarget;
    if (!acquireLink(target.linkId)) return;
    actionLock.current.add("rules");
    setRulesLoading(true);
    setActionError("");
    try {
      const updated = await linksApi.updateRules(target.linkId, patch);
      setRulesTarget(null);
      setRulesPassword("");
      message.success("短链访问规则已更新");
      refreshAfterChange(target.linkId, updated);
    } catch (error) { setActionError(getApiErrorMessage(error, "更新短链规则失败，请重试")); }
    finally { actionLock.current.delete("rules"); setRulesLoading(false); releaseLink(target.linkId); }
  };

  const handleBatchSubmit = async () => {
    if (batchLock.current || !batchAction || !hasPermission("links.manage") || listPending || scopeChanged) return;
    const targets = visibleItems.filter((item) => selectedIds.includes(item.linkId));
    if (!targets.length) return;
    if (targets.some((item) => busyIds.current.has(item.linkId))) { message.warning("所选短链有操作进行中，请稍后重试"); return; }
    const action = batchAction;
    const targetGroupId = batchGroupId;
    const scope = queryScope;
    batchLock.current = true;
    setBatchRunning(true);
    setBatchResults([]);
    setBatchTotal(targets.length);
    batchResultsScope.current = scope;
    targets.forEach((item) => busyIds.current.add(item.linkId));
    setBusyLinkIds(new Set(busyIds.current));
    const results: BatchResult[] = [];
    try {
      // Sequential requests reuse the existing single-link endpoints and cap concurrency at one.
      for (const item of targets) {
        let result: BatchResult;
        try {
          if (action === "enable") await linksApi.enable(item.linkId);
          else if (action === "disable") await linksApi.disable(item.linkId);
          else await linksApi.updateMetadata(item.linkId, { groupId: targetGroupId });
          result = { linkId: item.linkId, code: item.code, success: true, reason: action === "enable" ? "已启用（其它访问限制仍生效）" : action === "disable" ? "已停用" : targetGroupId ? "已移入目标分组" : "已移至未分组" };
        } catch (error) {
          result = { linkId: item.linkId, code: item.code, success: false, reason: getApiErrorMessage(error, "请求失败，请重试") };
        }
        results.push(result);
        if (mounted.current && scopeRef.current === scope) setBatchResults([...results]);
      }
      if (mounted.current && scopeRef.current === scope) setSelectedIds(results.filter((result) => !result.success).map((result) => result.linkId));
      if (mounted.current) {
        const successes = results.filter((result) => result.success).length;
        message.info(`批量${action === "enable" ? "启用" : action === "disable" ? "停用" : "移动分组"}完成：成功 ${successes} 条，失败 ${results.length - successes} 条`);
        if (action === "move_group") notifyGroupsChanged();
        void fetchListRef.current();
        if (detailId.current && targets.some((item) => item.linkId === detailId.current)) void openDetail(detailId.current);
      }
    } finally {
      targets.forEach((item) => busyIds.current.delete(item.linkId));
      batchLock.current = false;
      if (mounted.current) {
        setBusyLinkIds(new Set(busyIds.current));
        setBatchRunning(false);
        setBatchAction(null);
      }
    }
  };

  const handleExport = async () => {
    if (exportLock.current || !appliedQuery || listPending || listError || !hasPermission("links.read")) return;
    exportLock.current = true; setExporting(true); setExportError("");
    try {
      const blob = await linksApi.exportCSV(appliedQuery);
      saveBlob(blob, `links-${dayjs().format("YYYYMMDD-HHmmss")}.csv`);
    } catch (error) { setExportError(getApiErrorMessage(error, "导出短链失败，请稍后重试")); }
    finally { exportLock.current = false; if (mounted.current) setExporting(false); }
  };

  const baseHost = getPublicBaseURL().replace(/^https?:\/\//, "");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-cn-display text-[28px] font-black tracking-tight">短链管理</h1>
          <p className="mt-1 text-[13px] text-[var(--ink-2)]">
            查看生效规则、可用状态和访问趋势；管理续期、短码及访问次数
          </p>
        </div>
        {(hasPermission("links.create_url") || hasPermission("links.create_asset")) && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openCreateLink("burn")}
              className="stub-btn ghost"
              title="1 次访问 + 口令保护 + 24 小时过期"
            >
              <Flame size={15} className="text-[var(--signal)]" />
              阅后即焚
            </button>
            <button type="button" onClick={() => openCreateLink()} className="stub-btn signal">
              <Plus size={15} />
              新建短链
            </button>
          </div>
        )}
      </div>

      {/* 筛选栏 */}
      <fieldset disabled={batchRunning} className="flex min-w-0 flex-wrap items-center gap-2.5 border-0 p-0">
        <div className="inline-flex gap-1 rounded border border-[var(--line-2)] bg-[var(--paper-3)] p-1">
          {[
            ["", "全部类型"],
            ["url", "网址短链"],
            ["minio_asset", "素材短链"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setTargetType(k);
                setPage(1);
              }}
              className={`cursor-pointer rounded px-3 py-1 text-xs ${
                targetType === k ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink-2)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          aria-label="按可用性筛选短链"
          value={availability}
          onChange={(e) => {
            setAvailability(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-2.5 text-xs outline-none"
        >
          <option value="">可用性：全部</option>
          {Object.entries(AVAILABILITY_BADGE).map(([value, badge]) => <option key={value} value={value}>{badge.label}</option>)}
        </select>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-2.5 text-xs outline-none"
        >
          <option value="">管理状态：全部</option>
          <option value="enabled">enabled（启用）</option>
          <option value="disabled">disabled（停用）</option>
        </select>

        <Select
          aria-label="按分组筛选短链"
          value={groupFilter}
          disabled={batchRunning}
          loading={groups.loading}
          onChange={(value: string) => { setGroupFilter(value); setPage(1); setSelectedIds([]); }}
          options={[{ value: "", label: "分组：全部" }, { value: "ungrouped", label: "未分组" }, ...groupOptions(groups.items, groupFilter === "ungrouped" ? null : groupFilter)]}
          className="min-w-44"
        />

        <input
          value={keywordFilter}
          onChange={(e) => {
            setKeywordFilter(e.target.value);
            setPage(1);
          }}
          placeholder="搜索标题、标签、短码或目标 URL"
          className="h-9 w-64 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 text-xs outline-none focus:border-[var(--ink)]"
        />

        <input
          value={assetIdFilter}
          onChange={(e) => {
            setAssetIdFilter(e.target.value);
            setPage(1);
          }}
          placeholder="素材 A_Id 精确筛选"
          className="h-9 w-52 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-xs outline-none focus:border-[var(--ink)]"
        />

        <input
          value={codeFilter}
          onChange={(e) => {
            setCodeFilter(e.target.value);
            setSearchParams(e.target.value ? { code: e.target.value } : {});
            setPage(1);
          }}
          placeholder="短码精确筛选 code"
          className="h-9 w-44 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-xs outline-none focus:border-[var(--ink)]"
        />

        {isAdmin && (
          <input
            value={workspaceIdFilter}
            onChange={(e) => {
              setWorkspaceIdFilter(e.target.value);
              setGroupFilter("");
              setSelectedIds([]);
              setPage(1);
            }}
            placeholder="管理员：工作空间 ID，留空查全平台"
            className="h-9 w-56 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-xs outline-none focus:border-[var(--ink)]"
          />
        )}

        {hasPermission("links.manage") && <button type="button" disabled={batchRunning} onClick={() => setGroupsOpen(true)} className="stub-btn ghost !h-9"><FolderCog size={14} />管理分组</button>}
        {hasPermission("links.read") && <button type="button" disabled={exporting || batchRunning || listPending || Boolean(listError) || !appliedQuery} onClick={() => void handleExport()} className="stub-btn ghost !h-9" title="导出当前已应用筛选；最多 10000 条 / 20 MiB，每小时最多 10 次"><Download size={14} />{exporting ? "正在导出…" : "导出 CSV"}</button>}
        <button type="button" disabled={listPending} onClick={() => { void fetchList(); }} className="stub-btn ghost !h-9 ml-auto">
          <RefreshCw size={13} />
          刷新
        </button>
      </fieldset>
      {groups.error && <p role="alert" className="text-xs text-[var(--signal-ink)]">{groups.error} <button type="button" disabled={groups.loading || batchRunning} className="underline" onClick={() => void groups.reload()}>重试分组</button></p>}
      {exportError && <p role="alert" className="text-xs text-[var(--signal-ink)]">{exportError}</p>}

      {hasPermission("links.manage") && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-4 py-3 text-xs">
          <span>当前页已选 {selectedIds.length} 条</span>
          <button type="button" disabled={!selectedIds.length || batchRunning || listPending || busyLinkIds.size > 0} onClick={() => setBatchAction("enable")} className="stub-btn ghost !h-8 !text-xs">批量启用</button>
          <button type="button" disabled={!selectedIds.length || batchRunning || listPending || busyLinkIds.size > 0} onClick={() => setBatchAction("disable")} className="stub-btn ghost !h-8 !text-xs">批量停用</button>
          <button type="button" disabled={!selectedIds.length || batchRunning || listPending || busyLinkIds.size > 0} onClick={() => { setBatchGroupId(null); setBatchAction("move_group"); }} className="stub-btn ghost !h-8 !text-xs">批量移动分组</button>
          <button type="button" disabled={!selectedIds.length || batchRunning} onClick={() => setSelectedIds([])} className="stub-btn ghost !h-8 !text-xs">清除选择</button>
          <span className="text-[var(--ink-3)]">仅当前页；逐条执行，可能部分成功，不会全量回滚。</span>
        </div>
      )}
      {batchTotal > 0 && batchResultsScope.current === queryScope && (
        <div role="status" aria-live="polite" className="rounded border border-[var(--line-2)] bg-[var(--paper-3)] p-4 text-xs">
          <p className="font-medium">{batchRunning ? "批量操作进行中" : "批量操作完成"}：{batchResults.length} / {batchTotal}；成功 {batchResults.filter((result) => result.success).length} 条，失败 {batchResults.filter((result) => !result.success).length} 条</p>
          <progress value={batchResults.length} max={batchTotal} className="mt-2 w-full accent-[var(--signal)]" />
          <ul className="mt-2 max-h-44 space-y-1 overflow-auto">
            {batchResults.map((result) => <li key={result.linkId} className={result.success ? "text-[var(--ink-2)]" : "text-[var(--signal-ink)]"}>/r/{result.code} · {result.success ? "成功" : "失败"}：{result.reason}</li>)}
          </ul>
          {!batchRunning && batchResults.some((result) => !result.success) && <p className="mt-2 text-[var(--ink-3)]">失败项已保留选择，可通过上方批量按钮再次确认并重试。</p>}
        </div>
      )}

      {/* 列表 */}
      <div className="overflow-hidden rounded-md border border-[var(--line-2)] bg-[var(--paper-3)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--paper-2)] text-left font-mono text-[11px] text-[var(--ink-3)]">
                {hasPermission("links.manage") && <th className="w-10 px-4 py-2.5"><Checkbox aria-label="选择当前页全部短链" disabled={batchRunning || listPending || visibleItems.length === 0 || visibleItems.some((item) => busyLinkIds.has(item.linkId))} checked={visibleItems.length > 0 && visibleItems.every((item) => selectedIds.includes(item.linkId))} indeterminate={visibleItems.some((item) => selectedIds.includes(item.linkId)) && !visibleItems.every((item) => selectedIds.includes(item.linkId))} onChange={(event) => setSelectedIds(event.target.checked ? visibleItems.map((item) => item.linkId) : [])} /></th>}
                <th className="px-4 py-2.5">短码 / 稳定 LinkId</th>
                <th className="px-4 py-2.5">目标类型</th>
                <th className="px-4 py-2.5">管理状态 / 可用性</th>
                <th className="px-4 py-2.5">访问进度</th>
                <th className="px-4 py-2.5">到期时间</th>
                <th className="px-4 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-2)]">
              {listPending && <tr><td colSpan={hasPermission("links.manage") ? 7 : 6} className="py-12 text-center text-xs" role="status">正在加载短链…</td></tr>}
              {!listPending && listError && <tr><td colSpan={hasPermission("links.manage") ? 7 : 6} className="p-6 text-center text-xs" role="alert">{listError} <button type="button" className="stub-btn ghost ml-2" onClick={() => void fetchList()}>重试加载</button></td></tr>}
              {!listPending && !listError && visibleItems.map((item) => {
                const badge = AVAILABILITY_BADGE[item.availability] || {
                  label: item.availability,
                  cls: "neutral",
                };
                return (
                  <tr key={item.linkId} className="hover:bg-[var(--paper-2)]">
                    {hasPermission("links.manage") && <td className="px-4 py-3"><Checkbox aria-label={`选择短链 ${item.code}`} disabled={batchRunning || busyLinkIds.has(item.linkId)} checked={selectedIds.includes(item.linkId)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, item.linkId])] : current.filter((id) => id !== item.linkId))} /></td>}
                    <td className="px-4 py-3">
                      <div className="max-w-64 truncate font-medium" title={item.title || undefined}>
                        {item.title || "未命名短链"}
                      </div>
                      {item.tags.length > 0 && (
        <div className="mt-1 flex max-w-64 flex-wrap gap-1">
          {item.tags.map((tag) => (
            <span key={tag} className="stub-badge neutral">
              {tag}
            </span>
          ))}
        </div>
                      )}
                      <div className="mt-1 text-xs text-[var(--ink-3)]">分组：{item.groupName || item.groupId || "未分组"}</div>
                      <div className="flex items-center gap-2">
                        <span className="stub-code">/r/{item.code}</span>
                        <button
                          type="button"
                          onClick={() => copy(item.url, "已复制短链 URL")}
                          className="cursor-pointer text-[var(--ink-3)] hover:text-[var(--ink)]"
                          title="复制短链 URL"
                        >
                          <Copy size={13} />
                        </button>
                      </div>
                      <div className="mt-0.5 font-mono text-[11px] text-[var(--ink-3)]">{item.linkId}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {item.targetType === "minio_asset" ? (
                        <span className="stub-badge neutral">
                          minio_asset {item.assetSizeBytes ? `· ${formatMB(item.assetSizeBytes)}` : ""}
                        </span>
                      ) : (
                        <>
                          <span className="stub-badge neutral">url · HTTPS</span>
                          {item.targetUrl && (
                            <div
                              className="mt-1 max-w-56 truncate font-sans text-[11px] text-[var(--ink-3)]"
                              title={item.targetUrl}
                            >
                              {item.targetUrl}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`stub-badge ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {item.visitsUsed} / {item.maxVisits === -1 ? "∞ (-1)" : item.maxVisits}
                      {item.maxVisits === 1 && (
                        <span className="stub-badge signal ml-1.5">阅后即焚</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {item.expiresAt ? formatDateTime(item.expiresAt) : "不过期"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setQrTarget({ code: item.code, url: item.url })}
                          className="stub-btn ghost !h-7 !px-2.5 !text-xs"
                        >
                          <QrCode size={12} />
                          二维码
                        </button>
                        <button
                          type="button"
                          onClick={() => openDetail(item.linkId)}
                          className="stub-btn ghost !h-7 !px-2.5 !text-xs"
                        >
                          <Eye size={12} />
                          详情
                        </button>
                        {hasPermission("links.manage") && (
                          <>
                            <button
                              type="button"
                              onClick={() => openRenew(item)}
                              disabled={busyLinkIds.has(item.linkId)}
                              className="stub-btn ghost !h-7 !px-2.5 !text-xs"
                            >
                              续期
                            </button>
                            <button
                              type="button"
                              onClick={() => openRotate(item)}
                              disabled={busyLinkIds.has(item.linkId)}
                              className="stub-btn ghost !h-7 !px-2.5 !text-xs"
                            >
                              换码
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(item)}
                              disabled={busyLinkIds.has(item.linkId)}
                              className="stub-btn ghost !h-7 !px-2.5 !text-xs"
                            >
                              {item.status === "enabled" ? "停用" : "启用"}
                            </button>
                          </>
                        )}
                        {hasPermission("links.reset_visits") && (
                          <button
                            type="button"
                            onClick={() => handleResetVisits(item)}
                            disabled={busyLinkIds.has(item.linkId)}
                            className="stub-btn ghost !h-7 !px-2.5 !text-xs"
                          >
                            重置次数
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!listPending && !listError && visibleItems.length === 0 && (
                <tr>
                  <td colSpan={hasPermission("links.manage") ? 7 : 6} className="py-12 text-center text-xs text-[var(--ink-3)]">
                    未找到匹配的短链记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {total > pageSize && (
          <div className="flex justify-end border-t border-[var(--line)] px-4 py-3">
            <Pagination
              size="small"
              current={page}
              pageSize={pageSize}
              total={total}
              disabled={batchRunning}
              showSizeChanger={false}
              onChange={(p) => setPage(p)}
              showTotal={(t) => `共 ${t} 条`}
            />
          </div>
        )}
      </div>

      {/* 单链详情抽屉 */}
      <Drawer
        title={<span className="font-cn-display text-lg font-black">短链详情与单链趋势</span>}
        width={560}
        open={detailOpen}
        onClose={closeDetail}
      >
        {detailLoading && <p role="status">正在加载详情…</p>}
        {detailError && <div role="alert">{detailError} <button type="button" className="stub-btn ghost" onClick={() => { if (detailId.current) void openDetail(detailId.current); }}>重试详情</button></div>}
        {activeLink && (
          <div className="flex flex-col gap-5">
            {hasPermission(activeLink.target.type === "url" ? "links.create_url" : "links.create_asset") && <button type="button" className="stub-btn signal" disabled={busyLinkIds.has(activeLink.linkId)} onClick={() => { const source = activeLink; closeDetail(); copyLinkConfiguration(source); }}><Copy size={14} />复制配置创建</button>}
            <div className="rounded-md border border-[var(--ink)] bg-[var(--paper-3)] p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-xs text-[var(--ink-3)]">{activeLink.url}</div>
                  <div className="font-display text-4xl leading-none">/r/{activeLink.code}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQrTarget({ code: activeLink.code, url: activeLink.url })}
                    className="stub-btn ghost !h-8 !px-3 !text-xs"
                  >
                    <QrCode size={13} />
                    二维码
                  </button>
                  <button
                    type="button"
                    onClick={() => copy(activeLink.url, "已复制短链 URL")}
                    className="stub-btn signal !h-8 !px-3 !text-xs"
                  >
                    <Copy size={13} />
                    复制短链
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span
                  className={`stub-badge ${
                    AVAILABILITY_BADGE[activeLink.availability]?.cls || "neutral"
                  }`}
                >
                  {AVAILABILITY_BADGE[activeLink.availability]?.label || activeLink.availability}
                </span>
                <span className="stub-badge neutral">status: {activeLink.status}</span>
                <span className="stub-badge neutral">linkId: {activeLink.linkId}</span>
              </div>
              <div className="mt-3">
                <div className="font-medium">{activeLink.title || "未命名短链"}</div>
                <div className="mt-1 text-xs text-[var(--ink-3)]">分组：{activeLink.groupName || activeLink.groupId || "未分组"}</div>
                {activeLink.tags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {activeLink.tags.map((tag) => (
                      <span key={tag} className="stub-badge neutral">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {(hasPermission("links.manage") || hasPermission("links.reset_visits")) && (
              <div className="flex flex-wrap gap-2">
                {hasPermission("links.manage") && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setActionError("");
                        setMetadataTarget(activeLink);
                        setMetadataTitle(activeLink.title);
                        setMetadataTags(activeLink.tags);
                        setMetadataGroupId(activeLink.groupId || null);
                      }}
                      className="stub-btn ghost !h-8 !text-xs"
                    >
                      <Pencil size={13} />
                      编辑标题、标签和分组
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActionError("");
                        setRulesTarget(activeLink);
                        initialRulesExpiration.current = localExpiration(activeLink.expiresAt);
                        setRulesExpiresAt(initialRulesExpiration.current);
                        setRulesActiveFrom(localWindowTime(activeLink.activeFrom));
                        setRulesActiveUntil(localWindowTime(activeLink.activeUntil));
                        setRulesMaxVisits(String(activeLink.rules.maxVisits));
                        setRulesCIDRs(activeLink.rules.allowedIpCidrs.join("\n"));
                        setRulesRequirePassword(activeLink.rules.requirePassword);
                        setRulesPassword("");
                        setRulesPasswordStrategy(activeLink.rules.wrongPasswordPolicy?.strategy || "fixed_cooldown");
                      }}
                      className="stub-btn ghost !h-8 !text-xs"
                    >
                      <SlidersHorizontal size={13} />
                      编辑访问规则
                    </button>
                    <button
                      type="button"
                      onClick={() => openRenew(activeLink)}
                      className="stub-btn ghost !h-8 !text-xs"
                    >
                      续期恢复
                    </button>
                    <button
                      type="button"
                      onClick={() => openRotate(activeLink)}
                      className="stub-btn ghost !h-8 !text-xs"
                    >
                      <Shuffle size={13} />
                      更换短码
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(activeLink)}
                      className="stub-btn ghost !h-8 !text-xs"
                    >
                      <Power size={13} />
                      {activeLink.status === "enabled" ? "停用短链" : "启用短链"}
                    </button>
                  </>
                )}
                {hasPermission("links.reset_visits") && (
                  <button
                    type="button"
                    onClick={() => handleResetVisits(activeLink)}
                    className="stub-btn ghost !h-8 !text-xs"
                  >
                    <RotateCcw size={13} />
                    重置累计访问次数
                  </button>
                )}
              </div>
            )}

            <div className="rounded-md border border-[var(--line-2)] bg-[var(--paper-3)] p-4">
              <div className="mb-2.5 font-mono text-[11px] tracking-widest text-[var(--ink-3)]">
                TARGET & RULES · 生效规则（固定于本条短链）
              </div>
              <dl className="grid grid-cols-[130px_1fr] gap-y-2 text-xs">
                <dt className="text-[var(--ink-3)]">目标类型</dt>
                <dd className="font-mono">{activeLink.target.type}</dd>
                {activeLink.target.type === "url" ? (
                  <>
                    <dt className="text-[var(--ink-3)]">目标网址</dt>
                    <dd className="break-all font-mono">{activeLink.target.url}</dd>
                  </>
                ) : (
                  <>
                    <dt className="text-[var(--ink-3)]">托管素材 ID</dt>
                    <dd className="font-mono">
                      {activeLink.target.assetId} ({formatMB(activeLink.target.assetSizeBytes)})
                    </dd>
                  </>
                )}
                <dt className="text-[var(--ink-3)]">累计访问 / 上限</dt>
                <dd className="font-mono">
                  {activeLink.visitsUsed} /{" "}
                  {activeLink.rules.maxVisits === -1 ? "不限 (-1)" : activeLink.rules.maxVisits}
                </dd>
                <dt className="text-[var(--ink-3)]">允许 IP CIDR</dt>
                <dd className="font-mono">
                  {activeLink.rules.allowedIpCidrs?.length
                    ? activeLink.rules.allowedIpCidrs.join(", ")
                    : "不限制 ([])"}
                </dd>
                <dt className="text-[var(--ink-3)]">访问口令保护</dt>
                <dd className="font-mono">
                  {activeLink.rules.requirePassword
                    ? `启用（错误策略：${activeLink.rules.wrongPasswordPolicy?.strategy || "fixed_cooldown"}）`
                    : "未启用"}
                </dd>
                <dt className="text-[var(--ink-3)]">来源模板审计</dt>
                <dd className="font-mono">
                  {activeLink.ruleTemplate
                    ? `${activeLink.ruleTemplate.templateId} (v${activeLink.ruleTemplate.version})`
                    : "null（内联配置）"}
                </dd>
                <dt className="text-[var(--ink-3)]">到期时间</dt>
                <dd className="font-mono">
                  {activeLink.expiresAt ? formatDateTime(activeLink.expiresAt) : "不过期"}
                </dd>
                <dt className="text-[var(--ink-3)]">开放开始</dt>
                <dd className="font-mono">{activeLink.activeFrom ? formatDateTime(activeLink.activeFrom, "YYYY-MM-DD HH:mm:ss Z") : "不限制"}</dd>
                <dt className="text-[var(--ink-3)]">开放结束</dt>
                <dd className="font-mono">{activeLink.activeUntil ? formatDateTime(activeLink.activeUntil, "YYYY-MM-DD HH:mm:ss Z") : "不限制"}</dd>
                <dt className="text-[var(--ink-3)]">创建时间</dt>
                <dd className="font-mono">{formatDateTime(activeLink.createdAt)}</dd>
              </dl>
            </div>

            {analyticsLoading && <p role="status">正在加载统计…</p>}
            {analyticsError && <p role="alert">{analyticsError} <button type="button" className="underline" onClick={() => void fetchAnalytics(activeLink.linkId)}>重试统计</button></p>}
            {linkAnalytics && (
              <div className="rounded-md border border-[var(--line-2)] bg-[var(--paper-3)] p-4">
                <div className="mb-3 font-mono text-[11px] tracking-widest text-[var(--ink-3)]">
                  SINGLE LINK ANALYTICS · 近 7 天单链统计
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded border border-[var(--line)] bg-[var(--paper-2)] p-2.5">
                    <div className="font-mono text-[10px] text-[var(--ink-3)]">总请求</div>
                    <div className="font-display text-2xl">{linkAnalytics.totals.requestCount}</div>
                  </div>
                  <div className="rounded border border-[var(--line)] bg-[var(--paper-2)] p-2.5">
                    <div className="font-mono text-[10px] text-[var(--ink-3)]">有效尝试</div>
                    <div className="font-display text-2xl">{linkAnalytics.totals.visitAttemptCount}</div>
                  </div>
                  <div className="rounded border border-[var(--line)] bg-[var(--paper-2)] p-2.5">
                    <div className="font-mono text-[10px] text-[var(--ink-3)]">成功跳转</div>
                    <div className="font-display text-2xl">{linkAnalytics.totals.redirectCount}</div>
                  </div>
                  <div className="rounded border border-[var(--line)] bg-[var(--paper-2)] p-2.5">
                    <div className="font-mono text-[10px] text-[var(--ink-3)]">拒绝请求</div>
                    <div className="font-display text-2xl text-[var(--signal)]">
                      {linkAnalytics.totals.failureCount}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        title={batchAction === "enable" ? "确认批量启用" : batchAction === "disable" ? "确认批量停用" : "确认批量移动分组"}
        open={batchAction !== null}
        onCancel={() => { if (!batchRunning) setBatchAction(null); }}
        onOk={() => void handleBatchSubmit()}
        confirmLoading={batchRunning}
        closable={!batchRunning}
        keyboard={!batchRunning}
        maskClosable={false}
        cancelButtonProps={{ disabled: batchRunning }}
        okButtonProps={{ disabled: listPending || selectedIds.length === 0 }}
        okText="确认执行"
        cancelText="取消"
      >
        <p>将处理当前页选中的 {selectedIds.length} 条短链。逐条独立执行，可能部分成功；失败项会保留，便于重试。</p>
        {batchAction === "move_group" ? <div className="mt-3 flex flex-col gap-2 text-xs"><label htmlFor="batch-group">目标分组</label><Select id="batch-group" disabled={batchRunning} loading={groups.loading} value={batchGroupId || ""} onChange={(value: string) => setBatchGroupId(value || null)} options={[{ value: "", label: "未分组（解除关联）" }, ...groupOptions(groups.items, batchGroupId)]} /><p className="text-[var(--ink-3)]">同分组操作可重复执行；跨工作空间的分组会由服务端拒绝，失败项保留选择。</p></div> : <p className="mt-2 text-xs text-[var(--ink-3)]">启用不解除到期、次数、IP 或口令限制；停用不撤销已签发的素材下载地址。</p>}
      </Modal>
      <Modal
        title={`确认清零 /r/${resetTarget?.code || ""}？`}
        open={Boolean(resetTarget)}
        onCancel={() => { if (!resetLoading) setResetTarget(null); }}
        onOk={() => void handleResetSubmit()}
        confirmLoading={resetLoading}
        closable={!resetLoading}
        keyboard={!resetLoading}
        maskClosable={false}
        cancelButtonProps={{ disabled: resetLoading }}
        okText="确认清零"
        cancelText="取消"
      >
        <p>当前累计次数 {resetTarget?.visitsUsed ?? 0} 将变为 0，操作不可撤销。历史日志保留；不会清除口令冷却、到期或停用等限制。</p>
        {resetError && <p role="alert" className="mt-3 text-[var(--signal-ink)]">{resetError}</p>}
      </Modal>
      <Modal
        title={`编辑短链信息 /r/${metadataTarget?.code || ""}`}
        open={Boolean(metadataTarget)}
        onCancel={() => { if (!metadataLoading) setMetadataTarget(null); }}
        onOk={handleMetadataSubmit}
        confirmLoading={metadataLoading}
        closable={!metadataLoading}
        keyboard={!metadataLoading}
        maskClosable={false}
        cancelButtonProps={{ disabled: metadataLoading }}
        okText="保存信息"
        cancelText="取消"
      >
        <div className="flex flex-col gap-4 pt-2">
          {actionError && <p role="alert" className="text-xs text-[var(--signal-ink)]">{actionError}</p>}
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--ink-2)]">
            标题 <span className="font-normal text-[var(--ink-3)]">可选，最多 120 字</span>
            <input value={metadataTitle} maxLength={120} onChange={(e) => setMetadataTitle(e.target.value)} className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 text-sm outline-none" />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--ink-2)]">
            标签 <span className="font-normal text-[var(--ink-3)]">可选，最多 20 个</span>
            <Select
              mode="tags"
              value={metadataTags}
              onChange={(values: string[]) => setMetadataTags(values.slice(0, 20))}
              placeholder="输入后按 Enter 添加标签"
              tokenSeparators={[",", "，"]}
              maxTagCount="responsive"
              options={[]}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--ink-2)]">分组
            <Select disabled={metadataLoading} loading={groups.loading} value={metadataGroupId || ""} onChange={(value: string) => setMetadataGroupId(value || null)} options={[{ value: "", label: "未分组" }, ...groupOptions(groups.items, metadataGroupId, metadataGroupId === metadataTarget?.groupId ? metadataTarget?.groupName : null)]} />
          </label>
        </div>
      </Modal>

      <Modal
        title={`编辑访问规则 /r/${rulesTarget?.code || ""}`}
        open={Boolean(rulesTarget)}
        onCancel={() => { if (!rulesLoading) setRulesTarget(null); }}
        onOk={handleRulesSubmit}
        confirmLoading={rulesLoading}
        closable={!rulesLoading}
        keyboard={!rulesLoading}
        maskClosable={false}
        cancelButtonProps={{ disabled: rulesLoading }}
        okText="保存规则"
        cancelText="取消"
      >
        <div className="flex flex-col gap-4 pt-2">
          {actionError && <p role="alert" className="text-xs text-[var(--signal-ink)]">{actionError}</p>}
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--ink-2)]">
            到期时间 <span className="font-normal text-[var(--ink-3)]">留空表示不过期</span>
            <input
              type="datetime-local"
              value={rulesExpiresAt}
              onChange={(e) => setRulesExpiresAt(e.target.value)}
              className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none"
            />
          </label>
          <div className="flex flex-col gap-2.5 rounded border border-[var(--line-2)] bg-[var(--paper-2)] p-3">
            <div className="text-xs font-medium">定时开放窗口</div>
            <p className="text-[11px] leading-5 text-[var(--ink-3)]">按本机时区 {Intl.DateTimeFormat().resolvedOptions().timeZone} 输入；未改保持原值，清空移除该边界。开始时可访问，结束时停止，实际截止取开放结束与短链到期的较早者。</p>
            <label className="flex flex-col gap-1.5 text-xs text-[var(--ink-2)]">开放开始时间（留空不限制开始）
              <input type="datetime-local" step="1" value={rulesActiveFrom} onChange={(event) => setRulesActiveFrom(event.target.value)} className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none" />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-[var(--ink-2)]">开放结束时间（留空不限制结束）
              <input type="datetime-local" step="1" value={rulesActiveUntil} onChange={(event) => setRulesActiveUntil(event.target.value)} className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none" />
            </label>
            <button type="button" disabled={rulesLoading} onClick={() => { setRulesActiveFrom(""); setRulesActiveUntil(""); }} className="stub-btn ghost !h-8 !text-xs">清除时间窗（保存后生效）</button>
            <p className="text-[11px] text-[var(--ink-3)]">清除时间窗不会解除到期、停用、次数或其它访问限制。</p>
          </div>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--ink-2)]">
            最大访问次数 <span className="font-normal text-[var(--ink-3)]">-1 不限，0 禁止，正整数为上限；不会重置已用次数</span>
            <input
              type="number"
              min={-1}
              step={1}
              value={rulesMaxVisits}
              onChange={(e) => setRulesMaxVisits(e.target.value)}
              className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--ink-2)]">
            允许访问的 IP/CIDR <span className="font-normal text-[var(--ink-3)]">每行一个，留空表示不限制</span>
            <textarea
              rows={3}
              value={rulesCIDRs}
              maxLength={CIDRS_MAX_LENGTH}
              onChange={(e) => setRulesCIDRs(e.target.value)}
              className="rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 py-2 font-mono text-sm outline-none"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium text-[var(--ink-2)]">
            <input type="checkbox" checked={rulesRequirePassword} onChange={(e) => setRulesRequirePassword(e.target.checked)} />
            要求访问口令
          </label>
          {rulesRequirePassword && (
            <>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--ink-2)]">
                新口令 <span className="font-normal text-[var(--ink-3)]">留空保留当前口令；从关闭状态启用时必填</span>
                <input
                  type="password"
                  maxLength={ACCESS_PASSWORD_MAX_BYTES}
                  value={rulesPassword}
                  onChange={(e) => setRulesPassword(e.target.value)}
                  autoComplete="new-password"
                  className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 text-sm outline-none"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--ink-2)]">
                错误口令策略
                <select value={rulesPasswordStrategy} onChange={(e) => setRulesPasswordStrategy(e.target.value as typeof rulesPasswordStrategy)} className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 text-sm outline-none">
                  <option value="fixed_cooldown">固定冷却</option>
                  <option value="progressive_cooldown">逐步冷却</option>
                </select>
              </label>
            </>
          )}
          <p className="text-[11px] leading-5 text-[var(--ink-3)]">规则修改会记录审计；短链目标、短码、累计访问次数和创建时引用的模板版本不会改变。</p>
        </div>
      </Modal>

      {/* 续期弹窗 */}
      <Modal
        title={`续期短链 /r/${renewTarget?.code || ""}`}
        open={Boolean(renewTarget)}
        onCancel={() => { if (!renewLoading) setRenewTarget(null); }}
        onOk={handleRenewSubmit}
        confirmLoading={renewLoading}
        closable={!renewLoading}
        keyboard={!renewLoading}
        maskClosable={false}
        cancelButtonProps={{ disabled: renewLoading }}
        okText="确认续期"
        cancelText="取消"
      >
        <div className="flex flex-col gap-4 pt-2">
          {actionError && <p role="alert" className="text-xs text-[var(--signal-ink)]">{actionError}</p>}
          <div className="rounded border-l-[3px] border-[var(--ink)] bg-[var(--paper-2)] p-3 text-xs text-[var(--ink-2)]">
            续期只调整到期时间。若开放窗口已结束，请另行修改开放结束时间。停用状态和访问次数保持原值。
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--ink-2)]">新到期时间（必须晚于当前时间）</label>
            <input
              type="datetime-local"
              value={renewExpire}
              onChange={(e) => setRenewExpire(e.target.value)}
              className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--ink-2)]">续期时短码策略 (codeStrategy)</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRenewCodeStrategy("keep")}
                className={`cursor-pointer rounded border p-2.5 text-left ${
                  renewCodeStrategy === "keep"
                    ? "border-[var(--ink)] bg-[var(--paper-3)] shadow-[inset_0_0_0_1px_var(--ink)]"
                    : "border-[var(--line-2)]"
                }`}
              >
                <b className="block text-xs">保持原短码 (keep)</b>
                <small className="text-[11px] text-[var(--ink-3)]">原短链地址继续生效</small>
              </button>
              <button
                type="button"
                onClick={() => setRenewCodeStrategy("generated")}
                className={`cursor-pointer rounded border p-2.5 text-left ${
                  renewCodeStrategy === "generated"
                    ? "border-[var(--ink)] bg-[var(--paper-3)] shadow-[inset_0_0_0_1px_var(--ink)]"
                    : "border-[var(--line-2)]"
                }`}
              >
                <b className="block text-xs">同时换随机新码 (generated)</b>
                <small className="text-[11px] text-[var(--ink-3)]">旧码立即失效，请重新分发新地址</small>
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* 更换短码弹窗 */}
      <Modal
        title={`更换短码 /r/${rotateTarget?.code || ""}`}
        open={Boolean(rotateTarget)}
        onCancel={() => { if (!rotateLoading) setRotateTarget(null); }}
        onOk={handleRotateSubmit}
        confirmLoading={rotateLoading}
        closable={!rotateLoading}
        keyboard={!rotateLoading}
        maskClosable={false}
        cancelButtonProps={{ disabled: rotateLoading }}
        okText="确认更换"
        cancelText="取消"
      >
        <div className="flex flex-col gap-4 pt-2">
          {actionError && <p role="alert" className="text-xs text-[var(--signal-ink)]">{actionError}</p>}
          <div className="rounded border-l-[3px] border-[var(--warn)] bg-[#fdf6e9] p-3 text-xs text-[var(--warn)]">
            更换短码后：稳定标识 <code>linkId</code> 不变，旧地址立即失效且不再分配，请重新分发新地址。
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setRotateStrategy("generated")}
              className={`cursor-pointer rounded border p-2.5 text-left ${
                rotateStrategy === "generated"
                  ? "border-[var(--ink)] bg-[var(--paper-3)] shadow-[inset_0_0_0_1px_var(--ink)]"
                  : "border-[var(--line-2)]"
              }`}
            >
              <b className="block text-xs">系统随机生成 (generated)</b>
              <small className="text-[11px] text-[var(--ink-3)]">自动生成 8 位新短码</small>
            </button>
            <button
              type="button"
              onClick={() => setRotateStrategy("custom")}
              className={`cursor-pointer rounded border p-2.5 text-left ${
                rotateStrategy === "custom"
                  ? "border-[var(--ink)] bg-[var(--paper-3)] shadow-[inset_0_0_0_1px_var(--ink)]"
                  : "border-[var(--line-2)]"
              }`}
            >
              <b className="block text-xs">自定义新短码 (custom)</b>
              <small className="text-[11px] text-[var(--ink-3)]">4–64 位小写字母、数字、-</small>
            </button>
          </div>
          {rotateStrategy === "custom" && (
            <div className="flex">
              <span className="flex items-center rounded-l border border-r-0 border-[var(--line-2)] bg-[var(--paper-2)] px-3 font-mono text-xs text-[var(--ink-3)]">
                {baseHost}/r/
              </span>
              <input
                value={rotateCustomCode}
                onChange={(e) => setRotateCustomCode(e.target.value)}
                placeholder="new-custom-code"
                className="h-10 flex-1 rounded-r border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none focus:border-[var(--ink)]"
              />
            </div>
          )}
        </div>
      </Modal>
      <LinkGroupManager open={groupsOpen} workspaceId={groupWorkspace} onClose={() => setGroupsOpen(false)} onDeleted={(groupId) => {
        if (groupFilter === groupId) { setGroupFilter(""); setPage(1); setSelectedIds([]); }
        if (metadataGroupId === groupId) setMetadataGroupId(null);
        if (batchGroupId === groupId) setBatchGroupId(null);
        if (detailId.current) void openDetail(detailId.current);
        void fetchListRef.current();
      }} />
      <LinkQRModal
        open={Boolean(qrTarget)}
        code={qrTarget?.code || ""}
        url={qrTarget?.url || ""}
        onClose={() => setQrTarget(null)}
      />
    </div>
  );
}
