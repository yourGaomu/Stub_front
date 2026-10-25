import { App, Modal, Pagination, Switch } from "antd";
import dayjs from "dayjs";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Copy,
  KeyRound,
  Plus,
  Power,
  RefreshCw,
  Search,
  Sliders,
  Terminal,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useCopy } from "@/hooks/use-copy";
import { bytesToMB, formatDateTime, formatMB, getPublicBaseURL, mbToBytes } from "@/lib/format";
import { apiKeysApi } from "@/services/api";
import { ApiError } from "@/services/api/client";
import type {
  APIKeyDTO,
  APIKeyStatus,
  CreateAPIKeyRequest,
  CreateAPIKeyResponse,
  UpdateAPIKeyRequest,
} from "@/services/api/types";
import { useAuthStore } from "@/stores/auth-store";

const STATUS_BADGE: Record<APIKeyStatus, { label: string; cls: string }> = {
  active: { label: "active · 正常生效", cls: "ok" },
  disabled: { label: "disabled · 已暂停", cls: "neutral" },
  revoked: { label: "revoked · 已吊销", cls: "bad" },
};

const SCOPE_GROUPS: { group: string; scopes: { code: string; label: string; desc: string }[] }[] = [
  {
    group: "短链权限 (Links)",
    scopes: [
      { code: "links.read", label: "读取短链与趋势", desc: "查询短链详情、列表和访问量" },
      { code: "links.create_url", label: "创建 URL 短链", desc: "创建普通网址重定向短链" },
      { code: "links.create_asset", label: "创建素材短链", desc: "创建 MinIO 素材直连/下载短链" },
      { code: "links.manage", label: "管理/续期/换码", desc: "修改短链规则、续期、重置短码" },
      { code: "links.reset_visits", label: "清零访问计数", desc: "清零短链已使用访问次数" },
    ],
  },
  {
    group: "素材权限 (Assets)",
    scopes: [
      { code: "assets.read", label: "读取素材", desc: "查询素材列表与下载凭证" },
      { code: "assets.upload", label: "上传素材", desc: "向绑定业务桶上传新素材文件" },
      { code: "assets.delete", label: "软删素材", desc: "软删除已上传的素材" },
      { code: "assets.restore", label: "恢复素材", desc: "恢复已软删除的素材" },
    ],
  },
  {
    group: "规则模板 (Templates)",
    scopes: [
      { code: "templates.read_use", label: "使用规则模板", desc: "读取模板并在建链时引用" },
      { code: "templates.manage", label: "管理规则模板", desc: "创建、编辑和禁用规则模板" },
    ],
  },
];

export default function ApiKeysPage() {
  const { message, modal } = App.useApp();
  const copy = useCopy();
  const { user, isAdmin, businesses, usage, refreshUsage, hasPermission } = useAuthStore();

  const [items, setItems] = useState<APIKeyDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [snippetTab, setSnippetTab] = useState<"links" | "assets">("links");

  // 新建 API Key 弹窗
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formBizId, setFormBizId] = useState("");
  const [formScopes, setFormScopes] = useState<string[]>([
    "links.read",
    "links.create_url",
    "links.create_asset",
    "assets.read",
    "assets.upload",
  ]);
  const [formAccountAccess, setFormAccountAccess] = useState(false);
  const [formIpCidrs, setFormIpCidrs] = useState("");
  const [formRateLimit, setFormRateLimit] = useState("60");
  const [formMaxUploadMB, setFormMaxUploadMB] = useState("");
  const [formMaxCreatedLinks, setFormMaxCreatedLinks] = useState("");
  const [formMaxRequests, setFormMaxRequests] = useState("");
  const [formExpirePreset, setFormExpirePreset] = useState<"never" | "30d" | "90d" | "180d" | "1y">("never");

  // 编辑 API Key 弹窗
  const [editItem, setEditItem] = useState<APIKeyDTO | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editBizId, setEditBizId] = useState("");
  const [editScopes, setEditScopes] = useState<string[]>([]);
  const [editAccountAccess, setEditAccountAccess] = useState(false);
  const [editIpCidrs, setEditIpCidrs] = useState("");
  const [editRateLimit, setEditRateLimit] = useState("60");
  const [editMaxUploadMB, setEditMaxUploadMB] = useState("");
  const [editMaxCreatedLinks, setEditMaxCreatedLinks] = useState("");
  const [editMaxRequests, setEditMaxRequests] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState<string | null>(null);
  const [editExpireAction, setEditExpireAction] = useState<
    "keep" | "never" | "30d" | "90d" | "180d" | "1y"
  >("keep");

  // 一次性明文展示弹窗
  const [createdResult, setCreatedResult] = useState<CreateAPIKeyResponse | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiKeysApi.list({
        status: statusFilter || undefined,
        page,
        pageSize,
      });
      setItems(res.items);
      setTotal(res.pagination.total);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "加载 API Key 列表失败");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, pageSize, message]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const resetCreateForm = () => {
    setFormName("");
    setFormDesc("");
    setFormBizId(businesses[0]?.businessId || "");
    setFormScopes([
      "links.read",
      "links.create_url",
      "links.create_asset",
      "assets.read",
      "assets.upload",
    ]);
    setFormAccountAccess(false);
    setFormIpCidrs("");
    setFormRateLimit("60");
    setFormMaxUploadMB("");
    setFormMaxCreatedLinks("");
    setFormMaxRequests("");
    setFormExpirePreset("never");
  };

  const handleOpenCreate = () => {
    resetCreateForm();
    if (businesses.length > 0 && !formBizId) {
      setFormBizId(businesses[0].businessId);
    }
    setCreateOpen(true);
  };

  const handleCreateSubmit = async () => {
    if (!formName.trim()) {
      message.warning("请输入 API Key 名称");
      return;
    }
    if (!formBizId) {
      message.warning("请选择绑定的业务桶");
      return;
    }
    if (formScopes.length === 0) {
      message.warning("请至少勾选一项功能权限");
      return;
    }

    let expiresAt: string | null = null;
    if (formExpirePreset === "30d") expiresAt = dayjs().add(30, "day").toISOString();
    else if (formExpirePreset === "90d") expiresAt = dayjs().add(90, "day").toISOString();
    else if (formExpirePreset === "180d") expiresAt = dayjs().add(180, "day").toISOString();
    else if (formExpirePreset === "1y") expiresAt = dayjs().add(1, "year").toISOString();

    const cidrs = formIpCidrs
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: CreateAPIKeyRequest = {
      name: formName.trim(),
      description: formDesc.trim() || undefined,
      businessId: formBizId,
      scopes: formScopes,
      allowedIpCidrs: cidrs.length > 0 ? cidrs : undefined,
      rateLimitPerMin: Math.min(600, Math.max(1, Number(formRateLimit) || 60)),
      maxUploadBytes: formMaxUploadMB.trim() ? mbToBytes(Number(formMaxUploadMB)) : null,
      maxCreatedLinks: formMaxCreatedLinks.trim() ? Number(formMaxCreatedLinks) : null,
      maxRequests: formMaxRequests.trim() ? Number(formMaxRequests) : null,
      expiresAt,
      allowAccountAccess: formAccountAccess,
    };

    setCreating(true);
    try {
      const res = await apiKeysApi.create(payload);
      setCreateOpen(false);
      setCreatedResult(res);
      fetchList();
      refreshUsage();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "创建 API Key 失败");
    } finally {
      setCreating(false);
    }
  };

  const handleOpenEdit = (item: APIKeyDTO) => {
    const q = item.quotas || item;
    setEditItem(item);
    setEditName(item.name);
    setEditDesc(item.description || "");
    setEditBizId(item.businessId);
    setEditScopes(item.scopes || []);
    setEditAccountAccess(Boolean(item.allowAccountAccess));
    setEditIpCidrs((item.allowedIpCidrs || []).join(", "));
    setEditRateLimit(String(item.rateLimitPerMin || 60));
    setEditMaxUploadMB(q.maxUploadBytes ? String(bytesToMB(q.maxUploadBytes)) : "");
    setEditMaxCreatedLinks(q.maxCreatedLinks ? String(q.maxCreatedLinks) : "");
    setEditMaxRequests(q.maxRequests ? String(q.maxRequests) : "");
    setEditExpiresAt(item.expiresAt || null);
    setEditExpireAction("keep");
  };

  const handleEditSubmit = async () => {
    if (!editItem) return;
    if (!editName.trim()) {
      message.warning("请输入 API Key 名称");
      return;
    }
    if (!editBizId) {
      message.warning("请选择绑定的业务桶");
      return;
    }
    if (editScopes.length === 0) {
      message.warning("请至少保留一项功能权限");
      return;
    }

    const eq = editItem.quotas || editItem;
    if (editMaxUploadMB.trim() && mbToBytes(Number(editMaxUploadMB)) < eq.uploadedBytesUsed) {
      message.error(
        `累计上传上限不能低于当前已消耗量 (${formatMB(eq.uploadedBytesUsed)})，额度规则只增不减`
      );
      return;
    }
    if (editMaxCreatedLinks.trim() && Number(editMaxCreatedLinks) < eq.createdLinksUsed) {
      message.error(
        `累计建链上限不能低于当前已建条数 (${eq.createdLinksUsed} 条)，额度规则只增不减`
      );
      return;
    }
    if (editMaxRequests.trim() && Number(editMaxRequests) < eq.requestsUsed) {
      message.error(
        `累计总请求上限不能低于当前已请求次数 (${eq.requestsUsed} 次)，额度规则只增不减`
      );
      return;
    }

    let nextExpiresAt: string | null = editExpiresAt;
    if (editExpireAction === "never") nextExpiresAt = null;
    else if (editExpireAction === "30d") nextExpiresAt = dayjs().add(30, "day").toISOString();
    else if (editExpireAction === "90d") nextExpiresAt = dayjs().add(90, "day").toISOString();
    else if (editExpireAction === "180d") nextExpiresAt = dayjs().add(180, "day").toISOString();
    else if (editExpireAction === "1y") nextExpiresAt = dayjs().add(1, "year").toISOString();

    const cidrs = editIpCidrs
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: UpdateAPIKeyRequest = {
      name: editName.trim(),
      description: editDesc.trim(),
      businessId: editBizId,
      scopes: editScopes,
      allowedIpCidrs: cidrs,
      rateLimitPerMin: Math.min(600, Math.max(1, Number(editRateLimit) || 60)),
      maxUploadBytes: editMaxUploadMB.trim() ? mbToBytes(Number(editMaxUploadMB)) : null,
      maxCreatedLinks: editMaxCreatedLinks.trim() ? Number(editMaxCreatedLinks) : null,
      maxRequests: editMaxRequests.trim() ? Number(editMaxRequests) : null,
      expiresAt: nextExpiresAt,
      allowAccountAccess: editAccountAccess,
    };

    setEditing(true);
    try {
      await apiKeysApi.update(editItem.apiKeyId, payload);
      message.success("API Key 配置已更新");
      setEditItem(null);
      fetchList();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "更新配置失败");
    } finally {
      setEditing(false);
    }
  };

  const handleToggleStatus = async (item: APIKeyDTO) => {
    try {
      if (item.status === "active") {
        await apiKeysApi.disable(item.apiKeyId);
        message.success(`已暂停凭证「${item.name}」`);
      } else if (item.status === "disabled") {
        await apiKeysApi.enable(item.apiKeyId);
        message.success(`已重新启用凭证「${item.name}」`);
      }
      fetchList();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "状态切换失败");
    }
  };

  const handleRevoke = (item: APIKeyDTO) => {
    modal.confirm({
      title: `确认永久吊销 API Key「${item.name}」？`,
      icon: <AlertTriangle className="text-[var(--danger)]" />,
      content: (
        <div className="text-xs text-[var(--ink-2)]">
          <p>
            前缀：<code className="font-mono font-bold">{item.keyPrefix}…</code>
          </p>
          <p className="mt-1 text-[var(--danger)]">
            吊销为不可逆操作！所有依赖此凭证的外部自动化服务、爬虫或机器脚本将立即收到 401 Unauthorized 失败。
          </p>
        </div>
      ),
      okText: "确认吊销",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await apiKeysApi.revoke(item.apiKeyId);
          message.success("凭证已吊销");
          fetchList();
          refreshUsage();
        } catch (err) {
          message.error(err instanceof ApiError ? err.message : "吊销失败");
        }
      },
    });
  };

  const publicBase = getPublicBaseURL();

  return (
    <div className="flex flex-col gap-6">
      {/* 顶部标题与操作栏 */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-cn-display text-[28px] font-black tracking-tight">API Key · 机器调用凭证</h1>
            <span className="rounded border border-[var(--ink)] bg-[var(--ink)] px-2 py-0.5 font-mono text-[11px] font-bold text-[var(--paper)]">
              M2M / stub_sk_
            </span>
          </div>
          <p className="mt-1 text-[13px] text-[var(--ink-2)]">
            面向工业系统、工作流脚本与自动化工具的长期调用密钥 · 采用 <code>baseURL + apiKey</code>，无需模拟用户登录
          </p>
        </div>

        <div className="flex items-center gap-2">
          {usage?.apiKeys && (
            <div className="mr-2 hidden rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 py-1.5 font-mono text-xs md:block">
              <span className="text-[var(--ink-3)]">凭证配额：</span>
              <b>{usage.apiKeys.used}</b> / {usage.apiKeys.limit ?? "不限"}
            </div>
          )}
          {hasPermission("api_keys.manage") ? (
            <button type="button" onClick={handleOpenCreate} className="stub-btn signal">
              <Plus size={15} />
              创建 API Key
            </button>
          ) : (
            <span className="text-xs text-[var(--ink-3)]">当前账号暂无创建凭证权限</span>
          )}
        </div>
      </div>

      {/* 工业调用指引卡片 */}
      <div className="rounded-md border border-[var(--line)] bg-[var(--paper-2)] p-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line-2)] pb-2.5 font-mono">
          <div className="flex items-center gap-2 font-bold text-[var(--ink)]">
            <Terminal size={15} className="text-[var(--signal)]" />
            <span>快速调用示例 · Quick Integration Snippet</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex gap-1 rounded border border-[var(--line-2)] bg-[var(--paper-3)] p-0.5 text-[11px]">
              <button
                type="button"
                onClick={() => setSnippetTab("links")}
                className={`cursor-pointer rounded px-2.5 py-0.5 ${
                  snippetTab === "links"
                    ? "bg-[var(--ink)] text-[var(--paper)]"
                    : "text-[var(--ink-2)]"
                }`}
              >
                1. 创建短链
              </button>
              <button
                type="button"
                onClick={() => setSnippetTab("assets")}
                className={`cursor-pointer rounded px-2.5 py-0.5 ${
                  snippetTab === "assets"
                    ? "bg-[var(--ink)] text-[var(--paper)]"
                    : "text-[var(--ink-2)]"
                }`}
              >
                2. 上传素材
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                const code =
                  snippetTab === "links"
                    ? `curl -X POST "${publicBase}/api/v1/links" \\\n  -H "Authorization: Bearer stub_sk_YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"target":{"type":"url","url":"https://example.com"}}'`
                    : `curl -X POST "${publicBase}/api/v1/assets" \\\n  -H "Authorization: Bearer stub_sk_YOUR_KEY" \\\n  -F "file=@example.jpg"`;
                copy(code, "已复制 curl 命令");
              }}
              className="stub-btn ghost !h-6 !px-2 !text-[11px]"
            >
              <Copy size={11} /> 复制 curl 命令
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 font-mono text-[11px]">
          <div>
            <div className="text-[var(--ink-3)]">1. Base URL</div>
            <div className="mt-0.5 flex items-center justify-between rounded bg-[var(--paper-3)] p-2">
              <span className="font-bold select-all">{publicBase}/api/v1</span>
              <button
                type="button"
                onClick={() => copy(`${publicBase}/api/v1`, "已复制 Base URL")}
                className="hover:text-[var(--ink)]"
                title="复制 Base URL"
              >
                <Copy size={11} />
              </button>
            </div>
          </div>
          <div>
            <div className="text-[var(--ink-3)]">2. 认证请求头 (二选一)</div>
            <div className="mt-0.5 rounded bg-[var(--paper-3)] p-2 select-all">
              <code>Authorization: Bearer stub_sk_xxxx</code> 或 <code>X-API-Key: stub_sk_xxxx</code>
            </div>
          </div>
        </div>
        <div className="mt-2 rounded bg-[var(--paper-3)] p-2.5 font-mono text-[11px] text-[var(--ink-2)] select-all overflow-x-auto">
          {snippetTab === "links" ? (
            <code>
              curl -X POST "{publicBase}/api/v1/links" \<br />
              &nbsp;&nbsp;-H "Authorization: Bearer stub_sk_YOUR_KEY" \<br />
              &nbsp;&nbsp;-H "Content-Type: application/json" \<br />
              &nbsp;&nbsp;-d '{'{"target":{"type":"url","url":"https://example.com"}}'}'
            </code>
          ) : (
            <code>
              curl -X POST "{publicBase}/api/v1/assets" \<br />
              &nbsp;&nbsp;-H "Authorization: Bearer stub_sk_YOUR_KEY" \<br />
              &nbsp;&nbsp;-F "file=@example.jpg"
            </code>
          )}
        </div>
      </div>

      {/* 明确规则说明条 (用户重点要求) */}
      <div className="flex items-start gap-2.5 rounded-md border border-[var(--signal)]/40 bg-[#fff8f4] p-3.5 text-xs text-[var(--ink-2)]">
        <AlertTriangle size={16} className="shrink-0 text-[var(--signal)] mt-0.5" />
        <div className="leading-relaxed">
          <b className="font-semibold text-[var(--ink)]">
            额度消耗特别说明（累计消耗制 · 只增不减）：
          </b>
          <span>
            API Key 的上传流量额度（MB）与建链额度均为「累计消耗制」——即仅统计通过该 Key
            累计上传的数据量与累计创建的短链数，后续删除素材或停用短链
            <b>不会退还该 Key 的已用额度</b>。当达到指定额度上限后，该 Key 将拒绝新的写操作。
          </span>
        </div>
      </div>

      {/* 筛选与列表工具栏 */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="inline-flex gap-1 rounded border border-[var(--line-2)] bg-[var(--paper-3)] p-1">
          {[
            ["", "全部状态"],
            ["active", "生效中 (active)"],
            ["disabled", "已暂停 (disabled)"],
            ["revoked", "已吊销 (revoked)"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setStatusFilter(k);
                setPage(1);
              }}
              className={`cursor-pointer rounded px-3 py-1 text-xs ${
                statusFilter === k ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink-2)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-[var(--ink-3)]" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="按名称或前缀搜索"
            className="h-8.5 w-44 rounded border border-[var(--line-2)] bg-[var(--paper-3)] pr-2.5 pl-7 text-xs outline-none focus:border-[var(--ink)]"
          />
        </div>

        <button type="button" onClick={fetchList} className="stub-btn ghost !h-9 ml-auto">
          <RefreshCw size={13} />
          刷新列表
        </button>
      </div>

      {/* API Key 列表卡片 */}
      <div className="grid grid-cols-1 gap-4">
        {items
          .filter(
            (it) =>
              !keyword.trim() ||
              it.name.toLowerCase().includes(keyword.trim().toLowerCase()) ||
              it.keyPrefix.toLowerCase().includes(keyword.trim().toLowerCase()),
          )
          .map((item) => {
            const q = item.quotas || item;
            const isExpired = item.expiresAt && dayjs(item.expiresAt).isBefore(dayjs());
            const badge =
              item.status === "revoked"
                ? { label: "revoked · 已吊销", cls: "bad" }
                : isExpired
                ? { label: "expired · 已过期", cls: "bad" }
                : STATUS_BADGE[item.status] || { label: item.status, cls: "neutral" };

            const uploadPercent =
              q.maxUploadBytes && q.maxUploadBytes > 0
                ? Math.min(100, (q.uploadedBytesUsed / q.maxUploadBytes) * 100)
                : null;
            const linksPercent =
              q.maxCreatedLinks && q.maxCreatedLinks > 0
                ? Math.min(100, (q.createdLinksUsed / q.maxCreatedLinks) * 100)
                : null;
            const reqPercent =
              q.maxRequests && q.maxRequests > 0
                ? Math.min(100, (q.requestsUsed / q.maxRequests) * 100)
                : null;

            return (
              <div
                key={item.apiKeyId}
                className={`rounded-md border p-4 transition ${
                  item.status === "active" && !isExpired
                    ? "border-[var(--line-2)] bg-[var(--paper-3)] hover:border-[var(--ink)]"
                    : item.status === "disabled"
                    ? "border-[var(--line)] bg-[var(--paper-2)] opacity-75"
                    : "border-[var(--line)] bg-[var(--paper-2)] opacity-50"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--line-2)] pb-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <KeyRound size={16} className="text-[var(--signal)] shrink-0" />
                      <span className="font-cn-display text-base font-bold text-[var(--ink)]">
                        {item.name}
                      </span>
                      <span className={`stub-badge ${badge.cls}`}>{badge.label}</span>
                      <span className="rounded bg-black/5 px-2 py-0.5 font-mono text-[11px] text-[var(--ink-2)]">
                        桶: {item.businessId}
                      </span>
                      {item.allowAccountAccess && (
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700">
                          允许读取账户
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <p className="mt-1 text-xs text-[var(--ink-3)]">{item.description}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2.5 font-mono text-[11px] text-[var(--ink-3)]">
                      <span className="flex items-center gap-1">
                        前缀标识：
                        <code className="rounded bg-black/5 px-1 py-0.5 font-bold text-[var(--ink)] select-all">
                          {item.keyPrefix}
                        </code>
                        <button
                          type="button"
                          onClick={() => copy(item.keyPrefix, "已复制凭证前缀")}
                          className="cursor-pointer hover:text-[var(--ink)]"
                          title="复制前缀"
                        >
                          <Copy size={11} />
                        </button>
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        ID:
                        <code className="text-[10px] select-all">{item.apiKeyId}</code>
                        <button
                          type="button"
                          onClick={() => copy(item.apiKeyId, "已复制凭证 ID")}
                          className="cursor-pointer hover:text-[var(--ink)]"
                          title="复制 ID"
                        >
                          <Copy size={11} />
                        </button>
                      </span>
                      <span>·</span>
                      <span>创建于 {formatDateTime(item.createdAt)}</span>
                      <span>·</span>
                      <span>
                        到期：{item.expiresAt ? formatDateTime(item.expiresAt) : "永久有效"}
                      </span>
                      <span>·</span>
                      <span>
                        最近调用：
                        {item.lastUsedAt
                          ? formatDateTime(item.lastUsedAt) +
                            (item.lastUsedIp ? ` (${item.lastUsedIp})` : "")
                          : "从未使用"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {item.status !== "revoked" && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(item)}
                          className="stub-btn ghost !h-7 !px-2.5 !text-xs"
                        >
                          <Sliders size={12} />
                          配置限制
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(item)}
                          className="stub-btn ghost !h-7 !px-2.5 !text-xs"
                          title={item.status === "active" ? "暂停此凭证" : "恢复启用"}
                        >
                          <Power size={12} />
                          {item.status === "active" ? "暂停" : "启用"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevoke(item)}
                          className="stub-btn ghost !h-7 !px-2.5 !text-xs text-[var(--danger)]"
                        >
                          <Ban size={12} />
                          吊销
                        </button>
                      </>
                    )}
                    {item.status === "revoked" && (
                      <span className="font-mono text-xs text-[var(--danger)]">
                        已于 {formatDateTime(item.revokedAt)} 吊销
                      </span>
                    )}
                  </div>
                </div>

                {/* 额度消耗指示条 (累计消耗制) */}
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {/* 累计上传流量 */}
                  <div className="rounded border border-[var(--line-2)] bg-[var(--paper-2)] p-2.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--ink-3)]">累计上传流量 (只增不减)</span>
                      <span className="font-mono font-medium">
                        {formatMB(q.uploadedBytesUsed)} /{" "}
                        {q.maxUploadBytes ? formatMB(q.maxUploadBytes, 0) : "不限"}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-[var(--line)]">
                      <div
                        className={`h-full ${
                          uploadPercent && uploadPercent > 90 ? "bg-[var(--danger)]" : "bg-[var(--ink)]"
                        }`}
                        style={{ width: `${uploadPercent !== null ? uploadPercent : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* 累计创建短链数 */}
                  <div className="rounded border border-[var(--line-2)] bg-[var(--paper-2)] p-2.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--ink-3)]">累计创建短链 (只增不减)</span>
                      <span className="font-mono font-medium">
                        {q.createdLinksUsed} / {q.maxCreatedLinks ?? "不限"} 条
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-[var(--line)]">
                      <div
                        className={`h-full ${
                          linksPercent && linksPercent > 90 ? "bg-[var(--danger)]" : "bg-[var(--ink)]"
                        }`}
                        style={{ width: `${linksPercent !== null ? linksPercent : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* 累计调用总请求数 */}
                  <div className="rounded border border-[var(--line-2)] bg-[var(--paper-2)] p-2.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--ink-3)]">累计调用请求</span>
                      <span className="font-mono font-medium">
                        {q.requestsUsed} / {q.maxRequests ?? "不限"} 次
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-[var(--line)]">
                      <div
                        className={`h-full ${
                          reqPercent && reqPercent > 90 ? "bg-[var(--danger)]" : "bg-[var(--ink)]"
                        }`}
                        style={{ width: `${reqPercent !== null ? reqPercent : 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 细粒度权限标签与控制参数 */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--line-2)] pt-2.5">
                <span className="mr-1 text-[11px] font-mono text-[var(--ink-3)]">授权范围:</span>
                {(item.scopes || []).map((sc) => (
                  <span
                    key={sc}
                    className="rounded bg-black/5 px-2 py-0.5 font-mono text-[10px] text-[var(--ink-2)]"
                  >
                    {sc}
                  </span>
                ))}
                <span className="ml-auto font-mono text-[11px] text-[var(--ink-3)]">
                  频控: {item.rateLimitPerMin} 次/分
                  {item.allowedIpCidrs?.length > 0 &&
                    ` · IP 白名单 (${item.allowedIpCidrs.length}段)`}
                </span>
              </div>
            </div>
          );
        })}

        {!loading && items.length === 0 && (
          <div className="rounded-md border border-[var(--line-2)] bg-[var(--paper-3)] py-16 text-center text-xs text-[var(--ink-3)]">
            {statusFilter || keyword.trim()
              ? "未找到符合当前状态筛选或关键字搜索条件的 API Key 凭证。"
              : "尚未创建任何 API Key 机器调用凭证。点击右上角「创建 API Key」开始集成自动化工作流。"}
          </div>
        )}
      </div>

      {total > pageSize && (
        <div className="flex justify-end pt-2">
          <Pagination
            size="small"
            current={page}
            pageSize={pageSize}
            total={total}
            onChange={(p) => setPage(p)}
            showTotal={(t) => `共 ${t} 个凭证`}
          />
        </div>
      )}

      {/* 创建 API Key 弹窗 */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-[var(--signal)]" />
            <span className="font-cn-display text-lg font-bold">创建 API Key · 机器凭证</span>
          </div>
        }
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreateSubmit}
        confirmLoading={creating}
        okText="立即生成凭证"
        cancelText="取消"
        width={680}
      >
        <div className="flex flex-col gap-4.5 pt-2 text-xs">
          {businesses.length === 0 && (
            <div className="rounded border border-red-300 bg-red-50 p-3 text-xs text-red-700">
              当前账号尚未被授予任何 MinIO 业务桶，无法创建机器 API Key。请联系管理员在「用户管理」中授予业务桶访问权限。
            </div>
          )}

          {/* 基本信息 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="font-medium text-[var(--ink)]">凭证名称 *</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="例如: 网页自动化截屏机器"
                className="h-9 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 text-xs outline-none focus:border-[var(--ink)]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-medium text-[var(--ink)]">绑定业务桶 (MinIO) *</label>
              <select
                value={formBizId}
                onChange={(e) => setFormBizId(e.target.value)}
                className="h-9 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-2.5 font-mono text-xs outline-none focus:border-[var(--ink)]"
              >
                {businesses.map((b) => (
                  <option key={b.businessId} value={b.businessId}>
                    {b.displayName} ({b.businessId})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-[var(--ink-2)]">凭证用途说明 (选填)</label>
            <input
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="简要描述该凭证的使用方系统、部署服务器或负责人"
              className="h-9 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 text-xs outline-none focus:border-[var(--ink)]"
            />
          </div>

          {/* 权限范围选择 */}
          <div className="flex flex-col gap-2 rounded border border-[var(--line-2)] bg-[var(--paper-2)] p-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-[var(--ink)]">授权范围 (Scopes · 细粒度操作限制)</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setFormScopes(SCOPE_GROUPS.flatMap((g) => g.scopes.map((s) => s.code)))
                  }
                  className="cursor-pointer text-[11px] text-[var(--signal)] underline"
                >
                  全选
                </button>
                <button
                  type="button"
                  onClick={() => setFormScopes([])}
                  className="cursor-pointer text-[11px] text-[var(--ink-3)] underline"
                >
                  清空
                </button>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              {SCOPE_GROUPS.map((g) => (
                <div key={g.group}>
                  <div className="font-mono text-[10px] text-[var(--ink-3)]">{g.group}</div>
                  <div className="mt-1.5 grid grid-cols-2 gap-2">
                    {g.scopes.map((sc) => {
                      const canGrant = isAdmin || hasPermission(sc.code);
                      const checked = formScopes.includes(sc.code);
                      return (
                        <label
                          key={sc.code}
                          className={`flex items-start gap-2 rounded border p-2 transition ${
                            !canGrant
                              ? "cursor-not-allowed border-[var(--line-2)] opacity-40 bg-[var(--paper-2)]"
                              : checked
                              ? "cursor-pointer border-[var(--ink)] bg-[var(--paper-3)]"
                              : "cursor-pointer border-[var(--line-2)] opacity-75 hover:opacity-100"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked && canGrant}
                            disabled={!canGrant}
                            onChange={(e) => {
                              if (e.target.checked) setFormScopes((prev) => [...prev, sc.code]);
                              else setFormScopes((prev) => prev.filter((c) => c !== sc.code));
                            }}
                            className="mt-0.5"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-mono text-[11px] font-bold text-[var(--ink)]">
                                {sc.code}
                              </span>
                              {!canGrant && (
                                <span className="text-[9px] text-[var(--danger)]">
                                  (无此权限)
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-[var(--ink-3)]">{sc.desc}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2 flex items-center justify-between border-t border-[var(--line)] pt-2">
              <div>
                <span className="font-medium text-[var(--ink)]">允许访问 /api/v1/me 相关接口</span>
                <span className="block text-[11px] text-[var(--ink-3)]">
                  若开启，持有此 Key 可调用查看账户信息、权限列表、存储用量及可用业务
                </span>
              </div>
              <Switch checked={formAccountAccess} onChange={setFormAccountAccess} />
            </div>
          </div>

          {/* 累计额度限制（累计消耗制只增不减说明） */}
          <div className="flex flex-col gap-2 rounded border border-[var(--line-2)] bg-[var(--paper-2)] p-3">
            <div className="flex items-center justify-between">
              <label className="font-bold text-[var(--ink)]">
                累计额度限制 (累计消耗制 · 留空表示不限制)
              </label>
              <span className="text-[10px] text-[var(--signal)]">注：只增不减，删除不退还</span>
            </div>

            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <div>
                <label className="text-[11px] text-[var(--ink-2)]">累计上传上限 (十进制 MB)</label>
                <input
                  type="number"
                  value={formMaxUploadMB}
                  onChange={(e) => setFormMaxUploadMB(e.target.value)}
                  placeholder="如 500 (MB)"
                  className="mt-1 h-8.5 w-full rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-2.5 font-mono text-xs outline-none focus:border-[var(--ink)]"
                />
              </div>
              <div>
                <label className="text-[11px] text-[var(--ink-2)]">累计建链上限 (条数)</label>
                <input
                  type="number"
                  value={formMaxCreatedLinks}
                  onChange={(e) => setFormMaxCreatedLinks(e.target.value)}
                  placeholder="如 1000"
                  className="mt-1 h-8.5 w-full rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-2.5 font-mono text-xs outline-none focus:border-[var(--ink)]"
                />
              </div>
              <div>
                <label className="text-[11px] text-[var(--ink-2)]">累计总请求数 (次)</label>
                <input
                  type="number"
                  value={formMaxRequests}
                  onChange={(e) => setFormMaxRequests(e.target.value)}
                  placeholder="如 100000"
                  className="mt-1 h-8.5 w-full rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-2.5 font-mono text-xs outline-none focus:border-[var(--ink)]"
                />
              </div>
            </div>
          </div>

          {/* 网络与频控 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-medium text-[var(--ink-2)]">
                频率限制 (次/分钟 · 默认 60，上限 600)
              </label>
              <input
                type="number"
                value={formRateLimit}
                onChange={(e) => setFormRateLimit(e.target.value)}
                min={1}
                max={600}
                className="mt-1 h-8.5 w-full rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-2.5 font-mono text-xs outline-none focus:border-[var(--ink)]"
              />
            </div>
            <div>
              <label className="font-medium text-[var(--ink-2)]">凭证有效期</label>
              <select
                value={formExpirePreset}
                onChange={(e) => setFormExpirePreset(e.target.value as any)}
                className="mt-1 h-8.5 w-full rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-2.5 text-xs outline-none focus:border-[var(--ink)]"
              >
                <option value="never">永久有效 (无到期时间)</option>
                <option value="30d">30 天</option>
                <option value="90d">90 天</option>
                <option value="180d">180 天</option>
                <option value="1y">1 年</option>
              </select>
            </div>
          </div>

          <div>
            <label className="font-medium text-[var(--ink-2)]">
              IP CIDR 白名单 (选填 · 多个以逗号或换行分隔，例如 1.2.3.4/32)
            </label>
            <input
              value={formIpCidrs}
              onChange={(e) => setFormIpCidrs(e.target.value)}
              placeholder="留空则不限制调用端来源 IP"
              className="mt-1 h-8.5 w-full rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-2.5 font-mono text-xs outline-none focus:border-[var(--ink)]"
            />
          </div>
        </div>
      </Modal>

      {/* 编辑 API Key 弹窗 */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <Sliders size={18} className="text-[var(--signal)]" />
            <span className="font-cn-display text-lg font-bold">
              配置凭证限制 · {editItem?.name || ""}
            </span>
          </div>
        }
        open={Boolean(editItem)}
        onCancel={() => setEditItem(null)}
        onOk={handleEditSubmit}
        confirmLoading={editing}
        okText="保存配置"
        cancelText="取消"
        width={680}
      >
        {editItem && (() => {
          const eq = editItem.quotas || editItem;
          const uploadBelow =
            Boolean(editMaxUploadMB.trim()) &&
            mbToBytes(Number(editMaxUploadMB)) < eq.uploadedBytesUsed;
          const linksBelow =
            Boolean(editMaxCreatedLinks.trim()) &&
            Number(editMaxCreatedLinks) < eq.createdLinksUsed;
          const reqBelow =
            Boolean(editMaxRequests.trim()) &&
            Number(editMaxRequests) < eq.requestsUsed;

          return (
            <div className="flex flex-col gap-4 pt-2 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="font-medium text-[var(--ink)]">凭证名称 *</label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-9 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 text-xs outline-none focus:border-[var(--ink)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="font-medium text-[var(--ink)]">绑定业务桶 (MinIO) *</label>
                  <select
                    value={editBizId}
                    onChange={(e) => setEditBizId(e.target.value)}
                    className="h-9 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-2.5 font-mono text-xs outline-none focus:border-[var(--ink)]"
                  >
                    {businesses.map((b) => (
                      <option key={b.businessId} value={b.businessId}>
                        {b.displayName} ({b.businessId})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="font-medium text-[var(--ink-2)]">凭证用途说明 (选填)</label>
                <input
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="简要描述该凭证的使用方系统、部署服务器或负责人"
                  className="h-9 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 text-xs outline-none focus:border-[var(--ink)]"
                />
              </div>

              {/* 权限范围选择 */}
              <div className="flex flex-col gap-2 rounded border border-[var(--line-2)] bg-[var(--paper-2)] p-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[var(--ink)]">
                    授权范围 (Scopes · 细粒度操作限制)
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setEditScopes(
                          SCOPE_GROUPS.flatMap((g) => g.scopes.map((s) => s.code)).filter(
                            (code) => isAdmin || hasPermission(code),
                          ),
                        )
                      }
                      className="cursor-pointer text-[11px] text-[var(--signal)] underline"
                    >
                      全选可用
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditScopes([])}
                      className="cursor-pointer text-[11px] text-[var(--ink-3)] underline"
                    >
                      清空
                    </button>
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  {SCOPE_GROUPS.map((g) => (
                    <div key={g.group}>
                      <div className="font-mono text-[10px] text-[var(--ink-3)]">{g.group}</div>
                      <div className="mt-1.5 grid grid-cols-2 gap-2">
                        {g.scopes.map((sc) => {
                          const canGrant = isAdmin || hasPermission(sc.code);
                          const checked = editScopes.includes(sc.code);
                          return (
                            <label
                              key={sc.code}
                              className={`flex items-start gap-2 rounded border p-2 transition ${
                                !canGrant
                                  ? "cursor-not-allowed border-[var(--line-2)] opacity-40 bg-[var(--paper-2)]"
                                  : checked
                                  ? "cursor-pointer border-[var(--ink)] bg-[var(--paper-3)]"
                                  : "cursor-pointer border-[var(--line-2)] opacity-75 hover:opacity-100"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked && canGrant}
                                disabled={!canGrant}
                                onChange={(e) => {
                                  if (e.target.checked) setEditScopes((prev) => [...prev, sc.code]);
                                  else setEditScopes((prev) => prev.filter((c) => c !== sc.code));
                                }}
                                className="mt-0.5"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1">
                                  <span className="font-mono text-[11px] font-bold text-[var(--ink)]">
                                    {sc.code}
                                  </span>
                                  {!canGrant && (
                                    <span className="text-[9px] text-[var(--danger)]">
                                      (无此权限)
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-[var(--ink-3)]">{sc.desc}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-2 flex items-center justify-between border-t border-[var(--line)] pt-2">
                  <div>
                    <span className="font-medium text-[var(--ink)]">允许访问 /api/v1/me 相关接口</span>
                    <span className="block text-[11px] text-[var(--ink-3)]">
                      若开启，持有此 Key 可调用查看账户信息、权限列表、存储用量及可用业务
                    </span>
                  </div>
                  <Switch checked={editAccountAccess} onChange={setEditAccountAccess} />
                </div>
              </div>

              {/* 累计额度限制（累计消耗制只增不减说明） */}
              <div className="flex flex-col gap-2 rounded border border-[var(--line-2)] bg-[var(--paper-2)] p-3">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-[var(--ink)]">
                    累计额度限制 (累计消耗制 · 留空表示不限制)
                  </label>
                  <span className="font-mono text-[10px] text-[var(--ink-3)]">
                    已累计用量: 上传 {formatMB(eq.uploadedBytesUsed)} · 建链 {eq.createdLinksUsed} 条 · 请求 {eq.requestsUsed} 次
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <div>
                    <label className="text-[11px] text-[var(--ink-2)]">累计上传上限 (MB)</label>
                    <input
                      type="number"
                      value={editMaxUploadMB}
                      onChange={(e) => setEditMaxUploadMB(e.target.value)}
                      placeholder="留空为不限"
                      className={`mt-1 h-8.5 w-full rounded border bg-[var(--paper-3)] px-2.5 font-mono text-xs outline-none ${
                        uploadBelow ? "border-[var(--danger)] text-[var(--danger)]" : "border-[var(--line-2)] focus:border-[var(--ink)]"
                      }`}
                    />
                    {uploadBelow && (
                      <span className="mt-0.5 block text-[10px] text-[var(--danger)]">
                        不可低于已用 {formatMB(eq.uploadedBytesUsed)}
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--ink-2)]">累计建链上限 (条数)</label>
                    <input
                      type="number"
                      value={editMaxCreatedLinks}
                      onChange={(e) => setEditMaxCreatedLinks(e.target.value)}
                      placeholder="留空为不限"
                      className={`mt-1 h-8.5 w-full rounded border bg-[var(--paper-3)] px-2.5 font-mono text-xs outline-none ${
                        linksBelow ? "border-[var(--danger)] text-[var(--danger)]" : "border-[var(--line-2)] focus:border-[var(--ink)]"
                      }`}
                    />
                    {linksBelow && (
                      <span className="mt-0.5 block text-[10px] text-[var(--danger)]">
                        不可低于已用 {eq.createdLinksUsed} 条
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="text-[11px] text-[var(--ink-2)]">累计总请求数 (次)</label>
                    <input
                      type="number"
                      value={editMaxRequests}
                      onChange={(e) => setEditMaxRequests(e.target.value)}
                      placeholder="留空为不限"
                      className={`mt-1 h-8.5 w-full rounded border bg-[var(--paper-3)] px-2.5 font-mono text-xs outline-none ${
                        reqBelow ? "border-[var(--danger)] text-[var(--danger)]" : "border-[var(--line-2)] focus:border-[var(--ink)]"
                      }`}
                    />
                    {reqBelow && (
                      <span className="mt-0.5 block text-[10px] text-[var(--danger)]">
                        不可低于已用 {eq.requestsUsed} 次
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 网络与频控与有效期 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-[var(--ink-2)]">
                    频率限制 (次/分钟 · 默认 60，上限 600)
                  </label>
                  <input
                    type="number"
                    value={editRateLimit}
                    onChange={(e) => setEditRateLimit(e.target.value)}
                    min={1}
                    max={600}
                    className="mt-1 h-8.5 w-full rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-2.5 font-mono text-xs outline-none focus:border-[var(--ink)]"
                  />
                </div>
                <div>
                  <label className="font-medium text-[var(--ink-2)]">
                    到期时间 (当前: {editItem.expiresAt ? formatDateTime(editItem.expiresAt) : "永久有效"})
                  </label>
                  <select
                    value={editExpireAction}
                    onChange={(e) => setEditExpireAction(e.target.value as any)}
                    className="mt-1 h-8.5 w-full rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-2.5 text-xs outline-none focus:border-[var(--ink)]"
                  >
                    <option value="keep">保持现有到期时间</option>
                    <option value="never">设为永久有效 (无到期)</option>
                    <option value="30d">延长至 30 天后</option>
                    <option value="90d">延长至 90 天后</option>
                    <option value="180d">延长至 180 天后</option>
                    <option value="1y">延长至 1 年后</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-medium text-[var(--ink-2)]">
                  IP CIDR 白名单 (选填 · 多个以逗号分隔，例如 1.2.3.4/32)
                </label>
                <input
                  value={editIpCidrs}
                  onChange={(e) => setEditIpCidrs(e.target.value)}
                  placeholder="留空则不限制调用端来源 IP"
                  className="mt-1 h-8.5 w-full rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-2.5 font-mono text-xs outline-none focus:border-[var(--ink)]"
                />
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* 一次性展示生成的 SecretKey 明文 */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-[var(--ok)]">
            <CheckCircle2 size={18} />
            <span className="font-cn-display text-lg font-bold">API Key 生成成功</span>
          </div>
        }
        open={Boolean(createdResult)}
        onCancel={() => setCreatedResult(null)}
        footer={
          <button type="button" onClick={() => setCreatedResult(null)} className="stub-btn">
            我已妥善复制并保存
          </button>
        }
        width={580}
      >
        {createdResult && (
          <div className="flex flex-col gap-3.5 pt-2 text-xs">
            <div className="rounded border-l-[3px] border-[var(--signal)] bg-[#fff5f0] p-3 leading-relaxed text-[var(--ink-2)]">
              <b className="font-bold text-[var(--signal)]">重要安全提醒：</b>
              出于安全考量，系统仅保存此凭证的加密哈希，<b>明文 API Key 仅在此处展示一次</b>
              。关闭此窗口后将无法再次找回！
            </div>

            <div className="rounded border border-[var(--ink)] bg-[var(--paper-3)] p-3.5">
              <div className="font-mono text-[11px] text-[var(--ink-3)]">
                API Key 完整密钥 (Secret Key)
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <code className="font-mono text-sm font-bold text-[var(--ink)] break-all select-all">
                  {createdResult.secretKey}
                </code>
                <button
                  type="button"
                  onClick={() => copy(createdResult.secretKey, "已复制 API Key")}
                  className="stub-btn signal !h-8 !px-3 shrink-0"
                >
                  <Copy size={13} />
                  一键复制
                </button>
              </div>
            </div>

            <div className="rounded bg-[var(--paper-2)] p-2.5 font-mono text-[11px] text-[var(--ink-2)]">
              <div>绑定业务桶: {createdResult.businessId}</div>
              <div className="mt-0.5">凭证名称: {createdResult.name}</div>
              <div className="mt-0.5">
                到期时间: {createdResult.expiresAt ? formatDateTime(createdResult.expiresAt) : "永久有效"}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
