import { Copy, Flame, Plus, QrCode } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import type { LinkQuickPreset } from "@/components/create-link-drawer";
import { LinkQRModal } from "@/components/link-qr-modal";
import { useCopy } from "@/hooks/use-copy";
import { formatDateTime, formatMB } from "@/lib/format";
import { linksApi, logsApi } from "@/services/api";
import type { AnalyticsResponse, LinkListItem } from "@/services/api/types";
import { useAuthStore } from "@/stores/auth-store";

interface ConsoleOutletContext {
  openCreateLink: (preset?: LinkQuickPreset) => void;
}

const AVAILABILITY_BADGE: Record<string, { label: string; cls: string }> = {
  available: { label: "可用", cls: "ok" },
  expired: { label: "已过期", cls: "warn" },
  visit_limit_reached: { label: "次数耗尽", cls: "warn" },
  disabled: { label: "已停用", cls: "bad" },
};

export default function OverviewPage() {
  const { openCreateLink } = useOutletContext<ConsoleOutletContext>();
  const copy = useCopy();
  const { usage, hasPermission, refreshUsage } = useAuthStore();

  const [range, setRange] = useState<"24h" | "7d" | "30d">("24h");
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [recentLinks, setRecentLinks] = useState<LinkListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [qrTarget, setQrTarget] = useState<{ code: string; url: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const tasks: Promise<unknown>[] = [refreshUsage()];
      if (hasPermission("logs.read")) {
        tasks.push(
          logsApi
            .analyticsSummary({ range, timeZone: "Asia/Shanghai" })
            .then((res) => setAnalytics(res))
            .catch(() => {}),
        );
      }
      if (hasPermission("links.read")) {
        tasks.push(
          linksApi
            .list({ page: 1, pageSize: 6 })
            .then((res) => setRecentLinks(res.items))
            .catch(() => {}),
        );
      }
      await Promise.all(tasks);
    } finally {
      setLoading(false);
    }
  }, [range, hasPermission, refreshUsage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const onCreated = () => loadData();
    window.addEventListener("stub:link-created", onCreated);
    return () => window.removeEventListener("stub:link-created", onCreated);
  }, [loadData]);

  const storagePercent =
    usage && usage.storage.quotaBytes > 0
      ? Math.min(100, (usage.storage.usedBytes / usage.storage.quotaBytes) * 100)
      : 0;
  const urlPercent =
    usage?.urlLinks.limit && usage.urlLinks.limit > 0
      ? Math.min(100, (usage.urlLinks.used / usage.urlLinks.limit) * 100)
      : 0;
  const assetLinkPercent =
    usage?.minioAssetLinks.limit && usage.minioAssetLinks.limit > 0
      ? Math.min(100, (usage.minioAssetLinks.used / usage.minioAssetLinks.limit) * 100)
      : 0;
  const apiKeyPercent =
    usage?.apiKeys?.limit && usage.apiKeys.limit > 0
      ? Math.min(100, (usage.apiKeys.used / usage.apiKeys.limit) * 100)
      : 0;

  const series = analytics?.series || [];
  const maxRequestInBucket = Math.max(1, ...series.map((b) => b.requestCount));
  const maxReasonCount = Math.max(1, ...(analytics?.failureReasons?.map((r) => r.count) || [1]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-cn-display text-[28px] font-black tracking-tight">工作空间概览</h1>
          <p className="mt-1 text-[13px] text-[var(--ink-2)]">
            时区 Asia/Shanghai · 统计口径区分总请求、有效尝试、成功跳转与拒绝挑战
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex gap-1 rounded border border-[var(--line-2)] bg-[var(--paper-3)] p-1">
            {(["24h", "7d", "30d"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`cursor-pointer rounded px-3 py-1 font-mono text-xs ${
                  range === r ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink-2)]"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => openCreateLink("burn")}
            className="stub-btn ghost !h-9"
            title="1 次访问 + 口令保护 + 24 小时过期"
          >
            <Flame size={15} className="text-[var(--signal)]" />
            阅后即焚
          </button>
          <button type="button" onClick={() => openCreateLink()} className="stub-btn signal !h-9">
            <Plus size={15} />
            新建短链
          </button>
        </div>
      </div>

      {/* 账户与额度 4 列 */}
      <div className="grid grid-cols-1 divide-y divide-[var(--line)] overflow-hidden rounded-md border border-[var(--line-2)] bg-[var(--paper-3)] sm:grid-cols-2 lg:grid-cols-4 sm:divide-x sm:divide-y-0">
        <div className="p-5">
          <div className="flex justify-between font-mono text-[11px] text-[var(--ink-3)]">
            <span>STORAGE · 总存储额度</span>
            <span>单文件上限 {formatMB(usage?.storage.maxSingleFileBytes, 0)}</span>
          </div>
          <div className="mt-2 font-display text-4xl leading-none">
            {formatMB(usage?.storage.usedBytes)}{" "}
            <small className="font-sans text-sm text-[var(--ink-3)]">
              / {formatMB(usage?.storage.quotaBytes, 0)}
            </small>
          </div>
          <div className="my-2.5 h-1.5 overflow-hidden rounded bg-[var(--line)]">
            <i className="block h-full bg-[var(--ink)]" style={{ width: `${storagePercent}%` }} />
          </div>
          <div className="text-xs text-[var(--ink-2)]">
            剩余 {formatMB(usage?.storage.remainingBytes)} · 回收站中未彻底清理的素材仍占用额度
          </div>
        </div>

        <div className="p-5">
          <div className="flex justify-between font-mono text-[11px] text-[var(--ink-3)]">
            <span>URL LINKS · 普通网址短链配额</span>
            <span>仅统计未过期</span>
          </div>
          <div className="mt-2 font-display text-4xl leading-none">
            {usage?.urlLinks.used ?? 0}{" "}
            <small className="font-sans text-sm text-[var(--ink-3)]">
              / {usage?.urlLinks.limit === null ? "不限" : (usage?.urlLinks.limit ?? "—")} 条
            </small>
          </div>
          <div className="my-2.5 h-1.5 overflow-hidden rounded bg-[var(--line)]">
            <i className="block h-full bg-[var(--ink)]" style={{ width: `${urlPercent}%` }} />
          </div>
          <div className="text-xs text-[var(--ink-2)]">
            剩余 {usage?.urlLinks.remaining === null ? "不限" : (usage?.urlLinks.remaining ?? "—")} 条 ·
            到期后自动释放
          </div>
        </div>

        <div className="p-5">
          <div className="flex justify-between font-mono text-[11px] text-[var(--ink-3)]">
            <span>MINIO LINKS · 素材短链配额</span>
            <span>仅统计未过期</span>
          </div>
          <div className="mt-2 font-display text-4xl leading-none">
            {usage?.minioAssetLinks.used ?? 0}{" "}
            <small className="font-sans text-sm text-[var(--ink-3)]">
              / {usage?.minioAssetLinks.limit === null ? "不限" : (usage?.minioAssetLinks.limit ?? "—")} 条
            </small>
          </div>
          <div className="my-2.5 h-1.5 overflow-hidden rounded bg-[var(--line)]">
            <i className="block h-full bg-[var(--signal)]" style={{ width: `${assetLinkPercent}%` }} />
          </div>
          <div className="text-xs text-[var(--ink-2)]">
            剩余{" "}
            {usage?.minioAssetLinks.remaining === null ? "不限" : (usage?.minioAssetLinks.remaining ?? "—")}{" "}
            条 · 同素材多短链不重复扣存储
          </div>
        </div>

        <div className="p-5">
          <div className="flex justify-between font-mono text-[11px] text-[var(--ink-3)]">
            <span>API KEYS · 机器与 Agent 凭证</span>
            <span>REST API & MCP</span>
          </div>
          <div className="mt-2 font-display text-4xl leading-none">
            {usage?.apiKeys?.used ?? 0}{" "}
            <small className="font-sans text-sm text-[var(--ink-3)]">
              / {usage?.apiKeys?.limit === null ? "不限" : (usage?.apiKeys?.limit ?? "—")} 个
            </small>
          </div>
          <div className="my-2.5 h-1.5 overflow-hidden rounded bg-[var(--line)]">
            <i className="block h-full bg-[var(--ink)]" style={{ width: `${apiKeyPercent}%` }} />
          </div>
          <div className="text-xs text-[var(--ink-2)]">
            剩余 {usage?.apiKeys?.remaining === null ? "不限" : (usage?.apiKeys?.remaining ?? "—")} 个 ·{" "}
            <Link to="/console/api-keys" className="text-[var(--signal)] underline">
              管理凭证
            </Link>
          </div>
        </div>
      </div>

      {/* 4 项统计指标 */}
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line)] overflow-hidden rounded-md border border-[var(--line-2)] bg-[var(--paper-3)] lg:grid-cols-4 lg:divide-y-0">
        {[
          {
            code: "REQUEST_COUNT",
            val: analytics?.totals.requestCount ?? 0,
            desc: "进入已识别短链流程的总请求数",
            accent: false,
          },
          {
            code: "VISIT_ATTEMPT_COUNT",
            val: analytics?.totals.visitAttemptCount ?? 0,
            desc: "未过期、未停用且进入规则校验的尝试",
            accent: false,
          },
          {
            code: "REDIRECT_COUNT",
            val: analytics?.totals.redirectCount ?? 0,
            desc: "校验通过 · 返回 302 跳转并扣减次数",
            accent: false,
          },
          {
            code: "FAILURE_COUNT",
            val: analytics?.totals.failureCount ?? 0,
            desc: "denied + challenge（口令挑战与错误）",
            accent: true,
          },
        ].map((m) => (
          <div key={m.code} className="p-4">
            <div className="font-mono text-[11px] text-[var(--ink-3)]">{m.code}</div>
            <div
              className={`mt-1.5 font-display text-4xl leading-none ${
                m.accent ? "text-[var(--signal)]" : ""
              }`}
            >
              {m.val.toLocaleString()}
            </div>
            <div className="mt-1.5 text-xs text-[var(--ink-2)]">{m.desc}</div>
          </div>
        ))}
      </div>

      {/* 分桶趋势 + 失败原因 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.65fr_1fr]">
        <div className="rounded-md border border-[var(--line-2)] bg-[var(--paper-3)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
            <div>
              <h3 className="text-[15px] font-bold">
                访问分桶趋势（{range === "24h" ? "按小时" : "按自然日"} · {range}）
              </h3>
              <p className="text-xs text-[var(--ink-3)]">深墨：成功跳转 redirectCount · 橙色：拒绝与挑战 failureCount</p>
            </div>
            {loading && <span className="font-mono text-xs text-[var(--ink-3)]">同步中…</span>}
          </div>
          <div className="p-5">
            {series.length > 0 ? (
              <div className="flex h-44 items-end gap-1.5 border-b border-[var(--line)] pt-4 pb-2">
                {series.map((b) => {
                  const redirectH = Math.round((b.redirectCount / maxRequestInBucket) * 130);
                  const failH = Math.round((b.failureCount / maxRequestInBucket) * 130);
                  return (
                    <div
                      key={b.at}
                      title={`${formatDateTime(b.at)} | 跳转: ${b.redirectCount} | 拒绝/挑战: ${b.failureCount}`}
                      className="group flex flex-1 flex-col items-center justify-end gap-0.5"
                    >
                      {failH > 0 && (
                        <div
                          className="w-full max-w-[22px] rounded-t-xs bg-[var(--signal)]"
                          style={{ height: `${Math.max(3, failH)}px` }}
                        />
                      )}
                      <div
                        className="w-full max-w-[22px] rounded-t-xs bg-[var(--ink)] opacity-85 group-hover:opacity-100"
                        style={{ height: `${Math.max(3, redirectH)}px` }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid h-44 place-items-center font-mono text-xs text-[var(--ink-3)]">
                暂无分桶访问记录
              </div>
            )}
          </div>
        </div>

        <div className="rounded-md border border-[var(--line-2)] bg-[var(--paper-3)]">
          <div className="border-b border-[var(--line)] px-5 py-3.5">
            <h3 className="text-[15px] font-bold">失败与挑战原因分布 (failureReasons)</h3>
            <p className="text-xs text-[var(--ink-3)]">对应访问日志 reason 标准枚举</p>
          </div>
          <div className="flex flex-col gap-3 p-5">
            {analytics?.failureReasons?.length ? (
              analytics.failureReasons.map((r) => (
                <div key={r.reason} className="grid grid-cols-[150px_1fr_48px] items-center gap-2.5 text-xs">
                  <code className="truncate font-mono text-[11px]">{r.reason}</code>
                  <div className="h-2 overflow-hidden rounded bg-[var(--paper-2)]">
                    <i
                      className="block h-full bg-[var(--ink)]"
                      style={{ width: `${Math.min(100, (r.count / maxReasonCount) * 100)}%` }}
                    />
                  </div>
                  <span className="text-right font-mono">{r.count}</span>
                </div>
              ))
            ) : (
              <div className="py-10 text-center font-mono text-xs text-[var(--ink-3)]">
                当前时间窗口无拒绝或挑战记录
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 最近短链 */}
      <div className="overflow-hidden rounded-md border border-[var(--line-2)] bg-[var(--paper-3)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3.5">
          <div>
            <h3 className="text-[15px] font-bold">最近创建的短链</h3>
            <p className="text-xs text-[var(--ink-3)]">点击右侧管理进入短链列表查看单链趋势、续期与换码</p>
          </div>
          <Link to="/console/links" className="stub-btn ghost !h-8 !px-3 !text-xs">
            查看全部短链 →
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--paper-2)] text-left font-mono text-[11px] text-[var(--ink-3)]">
                <th className="px-4 py-2.5">短码 / URL</th>
                <th className="px-4 py-2.5">目标类型</th>
                <th className="px-4 py-2.5">可用性</th>
                <th className="px-4 py-2.5">已访问 / 上限</th>
                <th className="px-4 py-2.5">到期时间</th>
                <th className="px-4 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-2)]">
              {recentLinks.map((item) => {
                const badge = AVAILABILITY_BADGE[item.availability] || {
                  label: item.availability,
                  cls: "neutral",
                };
                return (
                  <tr key={item.linkId} className="hover:bg-[#fffdf8]">
                    <td className="px-4 py-3">
                      <span className="stub-code">/r/{item.code}</span>
                      <div className="mt-0.5 font-mono text-[11px] text-[var(--ink-3)]">{item.linkId}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {item.targetType === "minio_asset" ? (
                        <span>
                          minio_asset{" "}
                          {item.assetSizeBytes ? `(${formatMB(item.assetSizeBytes)})` : ""}
                        </span>
                      ) : (
                        "url (HTTPS)"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`stub-badge ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {item.visitsUsed} / {item.maxVisits === -1 ? "∞" : item.maxVisits}
                      {item.maxVisits === 1 && (
                        <span className="stub-badge signal ml-1.5">阅后即焚</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {item.expiresAt ? formatDateTime(item.expiresAt) : "不过期"}
                    </td>
                    <td className="px-4 py-3 text-right">
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
                          onClick={() => copy(item.url, "已复制短链 URL")}
                          className="stub-btn ghost !h-7 !px-2.5 !text-xs"
                        >
                          <Copy size={12} />
                          复制
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {recentLinks.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-xs text-[var(--ink-3)]">
                    暂无短链，点击右上角「新建短链」创建第一条短链
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <LinkQRModal
        open={Boolean(qrTarget)}
        code={qrTarget?.code || ""}
        url={qrTarget?.url || ""}
        onClose={() => setQrTarget(null)}
      />
    </div>
  );
}
