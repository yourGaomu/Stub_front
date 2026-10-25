import { App, Drawer, Modal, Pagination, Select } from "antd";
import dayjs from "dayjs";
import {
  Copy,
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
import { useCallback, useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import type { LinkQuickPreset } from "@/components/create-link-drawer";
import { LinkQRModal } from "@/components/link-qr-modal";
import { useCopy } from "@/hooks/use-copy";
import { formatDateTime, formatMB, getPublicBaseURL } from "@/lib/format";
import { linksApi, logsApi } from "@/services/api";
import { ApiError } from "@/services/api/client";
import type { AnalyticsResponse, LinkDTO, LinkListItem } from "@/services/api/types";
import { useAuthStore } from "@/stores/auth-store";

interface ConsoleOutletContext {
  openCreateLink: (preset?: LinkQuickPreset) => void;
}

const AVAILABILITY_BADGE: Record<string, { label: string; cls: string }> = {
  available: { label: "available · 可用", cls: "ok" },
  expired: { label: "expired · 已过期", cls: "warn" },
  visit_limit_reached: { label: "visit_limit_reached · 次数耗尽", cls: "warn" },
  disabled: { label: "disabled · 已停用", cls: "bad" },
};

export default function LinksPage() {
  const { message, modal } = App.useApp();
  const copy = useCopy();
  const { openCreateLink } = useOutletContext<ConsoleOutletContext>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, hasPermission, refreshUsage } = useAuthStore();

  const [items, setItems] = useState<LinkListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [targetType, setTargetType] = useState<string>("");
  const [availability, setAvailability] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [codeFilter, setCodeFilter] = useState<string>(searchParams.get("code") || "");
  const [keywordFilter, setKeywordFilter] = useState("");
  const [assetIdFilter, setAssetIdFilter] = useState("");
  const [workspaceIdFilter, setWorkspaceIdFilter] = useState<string>("");

  // 详情抽屉
  const [activeLink, setActiveLink] = useState<LinkDTO | null>(null);
  const [linkAnalytics, setLinkAnalytics] = useState<AnalyticsResponse | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [metadataTarget, setMetadataTarget] = useState<LinkDTO | null>(null);
  const [metadataTitle, setMetadataTitle] = useState("");
  const [metadataTags, setMetadataTags] = useState<string[]>([]);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [rulesTarget, setRulesTarget] = useState<LinkDTO | null>(null);
  const [rulesExpiresAt, setRulesExpiresAt] = useState("");
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

  useEffect(() => {
    const qCode = searchParams.get("code");
    if (qCode !== null && qCode !== codeFilter) {
      setCodeFilter(qCode);
    }
  }, [searchParams, codeFilter]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await linksApi.list({
        page,
        pageSize,
        targetType: targetType || undefined,
        availability: availability || undefined,
        status: status || undefined,
        code: codeFilter.trim() || undefined,
        keyword: keywordFilter.trim() || undefined,
        assetId: assetIdFilter.trim() || undefined,
        workspaceId: isAdmin && workspaceIdFilter.trim() ? workspaceIdFilter.trim() : undefined,
      });
      setItems(res.items);
      setTotal(res.pagination.total);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "加载短链列表失败");
    } finally {
      setLoading(false);
    }
  }, [
    page,
    pageSize,
    targetType,
    availability,
    status,
    codeFilter,
    keywordFilter,
    assetIdFilter,
    isAdmin,
    workspaceIdFilter,
    message,
  ]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  useEffect(() => {
    const onCreated = () => fetchList();
    window.addEventListener("stub:link-created", onCreated);
    return () => window.removeEventListener("stub:link-created", onCreated);
  }, [fetchList]);

  const openDetail = async (linkId: string) => {
    try {
      const detail = await linksApi.get(linkId);
      setActiveLink(detail);
      setDetailOpen(true);
      if (hasPermission("links.read")) {
        logsApi
          .analyticsLink(linkId, { range: "7d", timeZone: "Asia/Shanghai" })
          .then(setLinkAnalytics)
          .catch(() => setLinkAnalytics(null));
      }
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "读取短链详情失败");
    }
  };

  const handleToggleStatus = async (item: LinkListItem | LinkDTO) => {
    try {
      if (item.status === "enabled") {
        await linksApi.disable(item.linkId);
        message.success("短链已停用");
      } else {
        await linksApi.enable(item.linkId);
        message.success("短链已恢复启用");
      }
      fetchList();
      if (activeLink?.linkId === item.linkId) {
        openDetail(item.linkId);
      }
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "操作失败");
    }
  };

  const handleResetVisits = (item: LinkListItem | LinkDTO) => {
    modal.confirm({
      title: `重置短链 /r/${item.code} 的累计访问次数？`,
      content: "重置后 visitsUsed 清零，不影响历史访问日志与审计日志。",
      okText: "确认重置",
      cancelText: "取消",
      onOk: async () => {
        try {
          await linksApi.resetVisits(item.linkId);
          message.success("已重置访问计数");
          fetchList();
          if (activeLink?.linkId === item.linkId) openDetail(item.linkId);
        } catch (err) {
          message.error(err instanceof ApiError ? err.message : "重置失败");
        }
      },
    });
  };

  const handleRenewSubmit = async () => {
    if (!renewTarget) return;
    const parsed = dayjs(renewExpire);
    if (!parsed.isValid() || !parsed.isAfter(dayjs())) {
      message.warning("新到期时间必须晚于当前时间");
      return;
    }
    setRenewLoading(true);
    try {
      const res = await linksApi.renew(renewTarget.linkId, {
        expiresAt: parsed.toISOString(),
        codeStrategy: renewCodeStrategy,
      });
      message.success(res.codeChanged ? `续期成功，新短码 /r/${res.code}` : "续期成功");
      setRenewTarget(null);
      await refreshUsage();
      fetchList();
      if (activeLink?.linkId === renewTarget.linkId) openDetail(renewTarget.linkId);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "续期失败");
    } finally {
      setRenewLoading(false);
    }
  };

  const handleRotateSubmit = async () => {
    if (!rotateTarget) return;
    if (rotateStrategy === "custom" && !rotateCustomCode.trim()) {
      message.warning("请输入新的自定义短码");
      return;
    }
    setRotateLoading(true);
    try {
      const res = await linksApi.rotateCode(rotateTarget.linkId, {
        strategy: rotateStrategy,
        code: rotateStrategy === "custom" ? rotateCustomCode.trim().toLowerCase() : undefined,
      });
      message.success(`短码已更换：/r/${res.oldCode} → /r/${res.code}`);
      setRotateTarget(null);
      setRotateCustomCode("");
      fetchList();
      if (activeLink?.linkId === rotateTarget.linkId) openDetail(rotateTarget.linkId);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "更换短码失败");
    } finally {
      setRotateLoading(false);
    }
  };

  const handleMetadataSubmit = async () => {
    if (!metadataTarget) return;
    if (
      metadataTitle.trim().length > 120 ||
      metadataTags.length > 20 ||
      metadataTags.some((tag) => tag.trim().length > 32)
    ) {
      message.warning("标题最多 120 字，最多 20 个标签且每个标签不超过 32 字");
      return;
    }
    setMetadataLoading(true);
    try {
      const updated = await linksApi.updateMetadata(metadataTarget.linkId, {
        title: metadataTitle.trim(),
        tags: metadataTags.map((tag) => tag.trim()).filter(Boolean),
      });
      setActiveLink(updated);
      setMetadataTarget(null);
      message.success("短链标题和标签已更新");
      fetchList();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "更新短链信息失败");
    } finally {
      setMetadataLoading(false);
    }
  };

  const handleRulesSubmit = async () => {
    if (!rulesTarget) return;
    if (!rulesMaxVisits.trim()) {
      message.warning("请输入访问次数上限，-1 表示不限");
      return;
    }
    const maxVisits = Number(rulesMaxVisits);
    if (!Number.isInteger(maxVisits) || maxVisits < -1) {
      message.warning("访问次数必须为 -1、0 或正整数");
      return;
    }
    const expiration = rulesExpiresAt ? dayjs(rulesExpiresAt) : null;
    if (expiration && (!expiration.isValid() || !expiration.isAfter(dayjs()))) {
      message.warning("到期时间必须晚于当前时间，留空表示不过期");
      return;
    }
    if (rulesRequirePassword && !rulesTarget.rules.requirePassword && !rulesPassword.trim()) {
      message.warning("启用访问口令时必须设置新口令");
      return;
    }
    setRulesLoading(true);
    try {
      const updated = await linksApi.updateRules(rulesTarget.linkId, {
        expiresAt: expiration?.toISOString() ?? null,
        maxVisits,
        allowedIpCidrs: rulesCIDRs.split(/[\n,]/).map((value) => value.trim()).filter(Boolean),
        requirePassword: rulesRequirePassword,
        accessPassword: rulesPassword.trim() || undefined,
        wrongPasswordPolicy: rulesRequirePassword ? { strategy: rulesPasswordStrategy } : undefined,
      });
      setActiveLink(updated);
      setRulesTarget(null);
      setRulesPassword("");
      message.success("短链访问规则已更新");
      fetchList();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "更新短链规则失败");
    } finally {
      setRulesLoading(false);
    }
  };

  const baseHost = getPublicBaseURL().replace(/^https?:\/\//, "");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-cn-display text-[28px] font-black tracking-tight">短链管理</h1>
          <p className="mt-1 text-[13px] text-[var(--ink-2)]">
            查看短链规则、运行态可用性、续期恢复（含过期额度重检）、更换短码与重置访问次数
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
      <div className="flex flex-wrap items-center gap-2.5">
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
          value={availability}
          onChange={(e) => {
            setAvailability(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-2.5 text-xs outline-none"
        >
          <option value="">可用性：全部</option>
          <option value="available">available（可用）</option>
          <option value="expired">expired（已过期）</option>
          <option value="visit_limit_reached">visit_limit_reached（次数耗尽）</option>
          <option value="disabled">disabled（已停用）</option>
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
              setPage(1);
            }}
            placeholder="管理员：workspaceId (all 查全平台)"
            className="h-9 w-56 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-xs outline-none focus:border-[var(--ink)]"
          />
        )}

        <button type="button" onClick={fetchList} className="stub-btn ghost !h-9 ml-auto">
          <RefreshCw size={13} />
          刷新
        </button>
      </div>

      {/* 列表 */}
      <div className="overflow-hidden rounded-md border border-[var(--line-2)] bg-[var(--paper-3)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--paper-2)] text-left font-mono text-[11px] text-[var(--ink-3)]">
                <th className="px-4 py-2.5">短码 / 稳定 LinkId</th>
                <th className="px-4 py-2.5">目标类型</th>
                <th className="px-4 py-2.5">管理状态 / 可用性</th>
                <th className="px-4 py-2.5">访问进度</th>
                <th className="px-4 py-2.5">到期时间</th>
                <th className="px-4 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-2)]">
              {items.map((item) => {
                const badge = AVAILABILITY_BADGE[item.availability] || {
                  label: item.availability,
                  cls: "neutral",
                };
                return (
                  <tr key={item.linkId} className="hover:bg-[#fffdf8]">
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
                              onClick={() => {
                                setRenewTarget(item);
                                setRenewExpire(
                                  dayjs(
                                    item.expiresAt && dayjs(item.expiresAt).isAfter(dayjs())
                                      ? item.expiresAt
                                      : undefined,
                                  )
                                    .add(7, "day")
                                    .format("YYYY-MM-DDTHH:mm"),
                                );
                                setRenewCodeStrategy("keep");
                              }}
                              className="stub-btn ghost !h-7 !px-2.5 !text-xs"
                            >
                              续期
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRotateTarget(item);
                                setRotateStrategy("generated");
                                setRotateCustomCode("");
                              }}
                              className="stub-btn ghost !h-7 !px-2.5 !text-xs"
                            >
                              换码
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(item)}
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
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-[var(--ink-3)]">
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
        onClose={() => setDetailOpen(false)}
      >
        {activeLink && (
          <div className="flex flex-col gap-5">
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
                        setMetadataTarget(activeLink);
                        setMetadataTitle(activeLink.title);
                        setMetadataTags(activeLink.tags);
                      }}
                      className="stub-btn ghost !h-8 !text-xs"
                    >
                      <Pencil size={13} />
                      编辑标题和标签
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRulesTarget(activeLink);
                        setRulesExpiresAt(activeLink.expiresAt ? dayjs(activeLink.expiresAt).format("YYYY-MM-DDTHH:mm") : "");
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
                      onClick={() => {
                        setRenewTarget(activeLink);
                        setRenewCodeStrategy("keep");
                      }}
                      className="stub-btn ghost !h-8 !text-xs"
                    >
                      续期恢复
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRotateTarget(activeLink);
                        setRotateStrategy("generated");
                      }}
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
                <dt className="text-[var(--ink-3)]">创建时间</dt>
                <dd className="font-mono">{formatDateTime(activeLink.createdAt)}</dd>
              </dl>
            </div>

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
                    <div className="font-mono text-[10px] text-[var(--ink-3)]">拒绝/挑战</div>
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
        title={`编辑短链信息 /r/${metadataTarget?.code || ""}`}
        open={Boolean(metadataTarget)}
        onCancel={() => setMetadataTarget(null)}
        onOk={handleMetadataSubmit}
        confirmLoading={metadataLoading}
        okText="保存信息"
        cancelText="取消"
      >
        <div className="flex flex-col gap-4 pt-2">
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
        </div>
      </Modal>

      <Modal
        title={`编辑访问规则 /r/${rulesTarget?.code || ""}`}
        open={Boolean(rulesTarget)}
        onCancel={() => setRulesTarget(null)}
        onOk={handleRulesSubmit}
        confirmLoading={rulesLoading}
        okText="保存规则"
        cancelText="取消"
      >
        <div className="flex flex-col gap-4 pt-2">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--ink-2)]">
            到期时间 <span className="font-normal text-[var(--ink-3)]">留空表示不过期</span>
            <input
              type="datetime-local"
              value={rulesExpiresAt}
              onChange={(e) => setRulesExpiresAt(e.target.value)}
              className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none"
            />
          </label>
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
        onCancel={() => setRenewTarget(null)}
        onOk={handleRenewSubmit}
        confirmLoading={renewLoading}
        okText="确认续期"
        cancelText="取消"
      >
        <div className="flex flex-col gap-4 pt-2">
          <div className="rounded border-l-[3px] border-[var(--ink)] bg-[var(--paper-2)] p-3 text-xs text-[var(--ink-2)]">
            若短链当前处于已过期状态，续期恢复为有效时会重新校验对应类型的短链数量配额；续期不会自动重置已用访问次数。
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
                <small className="text-[11px] text-[var(--ink-3)]">旧码立即失效，并进入 7 天冷却期</small>
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* 更换短码弹窗 */}
      <Modal
        title={`更换短码 /r/${rotateTarget?.code || ""}`}
        open={Boolean(rotateTarget)}
        onCancel={() => setRotateTarget(null)}
        onOk={handleRotateSubmit}
        confirmLoading={rotateLoading}
        okText="确认更换"
        cancelText="取消"
      >
        <div className="flex flex-col gap-4 pt-2">
          <div className="rounded border-l-[3px] border-[var(--warn)] bg-[#fdf6e9] p-3 text-xs text-[var(--warn)]">
            更换短码后：稳定标识 <code>linkId</code> 不变，旧短码立即失效并进入 7 天冷却期（冷却期内不可被任何短链复用）。
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
      <LinkQRModal
        open={Boolean(qrTarget)}
        code={qrTarget?.code || ""}
        url={qrTarget?.url || ""}
        onClose={() => setQrTarget(null)}
      />
    </div>
  );
}
