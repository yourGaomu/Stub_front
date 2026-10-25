import { App, Drawer, Input, Modal, QRCode, Select } from "antd";
import dayjs from "dayjs";
import { Download, Flame, Globe, PackageCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCopy } from "@/hooks/use-copy";
import { formatDateTime, formatMB, getPublicBaseURL } from "@/lib/format";
import { assetsApi, linksApi, templatesApi } from "@/services/api";
import { ApiError } from "@/services/api/client";
import type {
  AssetDTO,
  CreateLinkRequest,
  LinkDTO,
  LinkRules,
  TemplateDTO,
  TemplateListItem,
  TemplateVersionListItem,
} from "@/services/api/types";
import { useAuthStore } from "@/stores/auth-store";

export type LinkQuickPreset = "burn" | "delivery" | "public";

interface CreateLinkDrawerProps {
  open: boolean;
  initialTargetType?: "url" | "minio_asset";
  initialAssetId?: string;
  initialPreset?: LinkQuickPreset | null;
  onClose: () => void;
  onSuccess?: (link: LinkDTO) => void;
}

export function CreateLinkDrawer({
  open,
  initialTargetType = "url",
  initialAssetId = "",
  initialPreset = null,
  onClose,
  onSuccess,
}: CreateLinkDrawerProps) {
  const { message } = App.useApp();
  const copy = useCopy();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const refreshUsage = useAuthStore((s) => s.refreshUsage);
  const qrWrapRef = useRef<HTMLDivElement>(null);

  const [activePreset, setActivePreset] = useState<LinkQuickPreset | null>(initialPreset);
  const [targetType, setTargetType] = useState<"url" | "minio_asset">(initialTargetType);
  const [targetUrl, setTargetUrl] = useState("");
  const [assetId, setAssetId] = useState(initialAssetId);
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const [customCode, setCustomCode] = useState("");
  const [expirePreset, setExpirePreset] = useState<"1d" | "7d" | "30d" | "custom" | "never">("7d");
  const [customExpire, setCustomExpire] = useState(dayjs().add(7, "day").format("YYYY-MM-DDTHH:mm"));

  const [ruleMode, setRuleMode] = useState<"inline" | "latest" | "version">("inline");
  const [maxVisits, setMaxVisits] = useState<string>("50");
  const [cidrsText, setCidrsText] = useState("");
  const [requirePassword, setRequirePassword] = useState(false);
  const [strategy, setStrategy] = useState<"fixed_cooldown" | "progressive_cooldown">("fixed_cooldown");
  const [accessPassword, setAccessPassword] = useState("");

  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateDetail, setTemplateDetail] = useState<TemplateDTO | null>(null);
  const [versions, setVersions] = useState<TemplateVersionListItem[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | undefined>(undefined);
  const [versionRules, setVersionRules] = useState<LinkRules | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [createdLink, setCreatedLink] = useState<LinkDTO | null>(null);

  const applyPreset = useCallback((preset: LinkQuickPreset) => {
    setActivePreset(preset);
    setRuleMode("inline");
    if (preset === "burn") {
      // 阅后即焚：1 次有效访问 + 24 小时过期 + 必须口令 + 固定冷却
      setExpirePreset("1d");
      setMaxVisits("1");
      setRequirePassword(true);
      setStrategy("fixed_cooldown");
    } else if (preset === "delivery") {
      // 客户受控交付：10 次访问 + 7 天过期 + 必须口令
      setExpirePreset("7d");
      setMaxVisits("10");
      setRequirePassword(true);
      setStrategy("fixed_cooldown");
    } else {
      // 标准公开分享：不限次数 + 30 天过期 + 无口令
      setExpirePreset("30d");
      setMaxVisits("-1");
      setRequirePassword(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setTargetType(initialTargetType);
    setTitle("");
    setTags([]);
    if (initialAssetId) setAssetId(initialAssetId);
    if (initialPreset) {
      applyPreset(initialPreset);
    } else {
      setActivePreset(null);
    }

    if (hasPermission("assets.read")) {
      assetsApi
        .list({ page: 1, pageSize: 100, includeDeleted: false })
        .then((res) => {
          setAssets(res.items);
          if (!initialAssetId && res.items.length > 0) {
            setAssetId(res.items[0].assetId);
          }
        })
        .catch(() => {});
    }

    if (hasPermission("templates.read_use")) {
      templatesApi
        .list({ status: "active", includeDeleted: false, page: 1, pageSize: 100 })
        .then((res) => {
          setTemplates(res.items);
          if (res.items.length > 0) {
            setSelectedTemplateId(res.items[0].templateId);
          }
        })
        .catch(() => {});
    }
  }, [open, initialTargetType, initialAssetId, initialPreset, hasPermission, applyPreset]);

  useEffect(() => {
    if (!open || ruleMode === "inline" || !selectedTemplateId) {
      setTemplateDetail(null);
      setVersionRules(null);
      return;
    }
    templatesApi
      .get(selectedTemplateId)
      .then((detail) => {
        setTemplateDetail(detail);
        setVersionRules(detail.latestRules);
        setSelectedVersion(detail.latestVersion);
      })
      .catch(() => {});

    if (ruleMode === "version") {
      templatesApi
        .listVersions(selectedTemplateId)
        .then((res) => setVersions(res.versions))
        .catch(() => {});
    }
  }, [open, ruleMode, selectedTemplateId]);

  useEffect(() => {
    if (ruleMode === "version" && selectedTemplateId && selectedVersion) {
      templatesApi
        .getVersion(selectedTemplateId, selectedVersion)
        .then((v) => setVersionRules(v.rules))
        .catch(() => {});
    } else if (ruleMode === "latest" && templateDetail) {
      setVersionRules(templateDetail.latestRules);
    }
  }, [ruleMode, selectedTemplateId, selectedVersion, templateDetail]);

  const effectiveRequirePassword =
    ruleMode === "inline" ? requirePassword : Boolean(versionRules?.requirePassword);

  const handleSubmit = async () => {
    if (targetType === "url" && !targetUrl.trim().startsWith("https://")) {
      message.warning("目标网址必须以 https:// 开头");
      return;
    }
    if (targetType === "minio_asset" && !assetId.trim()) {
      message.warning("请选择或输入素材 ID");
      return;
    }
    if (title.trim().length > 120 || tags.length > 20 || tags.some((tag) => tag.trim().length > 32)) {
      message.warning("标题最多 120 字，最多 20 个标签且每个标签不超过 32 字");
      return;
    }
    if (effectiveRequirePassword && !accessPassword) {
      message.warning("当前规则要求启用访问口令，请填写该短链的访问口令");
      return;
    }

    let expiresAt: string | null = null;
    if (expirePreset === "1d") expiresAt = dayjs().add(1, "day").toISOString();
    else if (expirePreset === "7d") expiresAt = dayjs().add(7, "day").toISOString();
    else if (expirePreset === "30d") expiresAt = dayjs().add(30, "day").toISOString();
    else if (expirePreset === "custom") {
      const parsed = dayjs(customExpire);
      if (!parsed.isValid() || !parsed.isAfter(dayjs())) {
        message.warning("自定义到期时间必须晚于当前时间");
        return;
      }
      expiresAt = parsed.toISOString();
    }

    const payload: CreateLinkRequest = {
      title: title.trim(),
      tags: tags.map((tag) => tag.trim()).filter(Boolean),
      code: customCode.trim() ? customCode.trim().toLowerCase() : undefined,
      target:
        targetType === "url"
          ? { type: "url", url: targetUrl.trim() }
          : { type: "minio_asset", assetId: assetId.trim() },
      expiresAt,
      accessPassword: effectiveRequirePassword ? accessPassword : undefined,
      ruleSource:
        ruleMode === "inline"
          ? {
              type: "inline",
              rules: {
                maxVisits: maxVisits.trim() === "" ? -1 : Number(maxVisits),
                allowedIpCidrs: cidrsText
                  .split(/[\n,]/)
                  .map((s) => s.trim())
                  .filter(Boolean),
                requirePassword,
                wrongPasswordPolicy: requirePassword ? { strategy } : undefined,
              },
            }
          : {
              type: "template",
              template: {
                templateId: selectedTemplateId,
                version: ruleMode === "version" ? selectedVersion : undefined,
              },
            },
    };

    setSubmitting(true);
    try {
      const created = await linksApi.create(payload);
      await refreshUsage();
      setCreatedLink(created);
      onSuccess?.(created);
      onClose();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "创建短链失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadQR = () => {
    if (!createdLink) return;
    const canvas = qrWrapRef.current?.querySelector<HTMLCanvasElement>("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = `stub-${createdLink.code}.png`;
    a.href = canvas.toDataURL("image/png");
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const baseHost = getPublicBaseURL().replace(/^https?:\/\//, "");

  return (
    <>
      <Drawer
        title={<span className="font-cn-display text-xl font-black">新建受控短链</span>}
        width={560}
        open={open}
        onClose={onClose}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="stub-btn ghost">
              取消
            </button>
            <button type="button" disabled={submitting} onClick={handleSubmit} className="stub-btn signal">
              {submitting ? "正在创建…" : "创建短链"}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          {/* 00 · 快捷场景预设（含阅后即焚） */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5 font-mono text-[11px] tracking-widest text-[var(--ink-3)]">
              <span>00 · 快捷受控预设（一键填充参数）</span>
              <span className="h-px flex-1 bg-[var(--line)]" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => applyPreset("burn")}
                className={`cursor-pointer rounded border p-2.5 text-left transition ${
                  activePreset === "burn"
                    ? "border-[var(--signal)] bg-[var(--signal-soft)] shadow-[inset_0_0_0_1px_var(--signal)]"
                    : "border-[var(--line-2)] bg-[var(--paper-3)]"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--signal-ink)]">
                  <Flame size={14} />
                  <span>阅后即焚</span>
                </div>
                <small className="mt-0.5 block text-[11px] text-[var(--ink-3)]">
                  限 1 次 + 口令 + 24h
                </small>
              </button>

              <button
                type="button"
                onClick={() => applyPreset("delivery")}
                className={`cursor-pointer rounded border p-2.5 text-left transition ${
                  activePreset === "delivery"
                    ? "border-[var(--ink)] bg-[var(--paper-3)] shadow-[inset_0_0_0_1px_var(--ink)]"
                    : "border-[var(--line-2)] bg-[var(--paper-3)]"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <PackageCheck size={14} />
                  <span>客户交付</span>
                </div>
                <small className="mt-0.5 block text-[11px] text-[var(--ink-3)]">
                  限 10 次 + 口令 + 7d
                </small>
              </button>

              <button
                type="button"
                onClick={() => applyPreset("public")}
                className={`cursor-pointer rounded border p-2.5 text-left transition ${
                  activePreset === "public"
                    ? "border-[var(--ink)] bg-[var(--paper-3)] shadow-[inset_0_0_0_1px_var(--ink)]"
                    : "border-[var(--line-2)] bg-[var(--paper-3)]"
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold">
                  <Globe size={14} />
                  <span>公开分享</span>
                </div>
                <small className="mt-0.5 block text-[11px] text-[var(--ink-3)]">
                  不限次数 + 无口令 + 30d
                </small>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2.5 font-mono text-[11px] tracking-widest text-[var(--ink-3)]">
            <span>01 · 标题与标签（创建后可编辑）</span>
            <span className="h-px flex-1 bg-[var(--line)]" />
          </div>
          <div className="grid gap-3">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--ink-2)]">
              标题 <span className="font-normal text-[var(--ink-3)]">可选，最多 120 字</span>
              <Input
                value={title}
                maxLength={120}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例如：项目方案预览"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--ink-2)]">
              标签 <span className="font-normal text-[var(--ink-3)]">可选，最多 20 个</span>
              <Select
                mode="tags"
                value={tags}
                onChange={(values: string[]) => setTags(values.slice(0, 20))}
                placeholder="输入后按 Enter 添加标签"
                tokenSeparators={[",", "，"]}
                maxTagCount="responsive"
                options={[]}
              />
            </label>
          </div>

          <div className="flex items-center gap-2.5 font-mono text-[11px] tracking-widest text-[var(--ink-3)]">
            <span>02 · 目标（创建后不可修改）</span>
            <span className="h-px flex-1 bg-[var(--line)]" />
          </div>

          <div className="inline-flex w-fit gap-1 rounded border border-[var(--line-2)] bg-[var(--paper-3)] p-1">
            <button
              type="button"
              onClick={() => setTargetType("url")}
              className={`cursor-pointer rounded px-3.5 py-1 text-[13px] ${
                targetType === "url" ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink-2)]"
              }`}
            >
              HTTPS 网址
            </button>
            <button
              type="button"
              onClick={() => setTargetType("minio_asset")}
              className={`cursor-pointer rounded px-3.5 py-1 text-[13px] ${
                targetType === "minio_asset" ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink-2)]"
              }`}
            >
              MinIO 托管素材
            </button>
          </div>

          {targetType === "url" ? (
            <div className="flex flex-col gap-1.5">
              <label className="flex justify-between text-xs font-medium text-[var(--ink-2)]">
                <span>目标 HTTPS URL</span>
                <span className="font-normal text-[var(--ink-3)]">仅允许 https://</span>
              </label>
              <input
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com/file.png"
                className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none focus:border-[var(--ink)]"
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="flex justify-between text-xs font-medium text-[var(--ink-2)]">
                <span>选择已上传素材</span>
                <span className="font-normal text-[var(--ink-3)]">同一素材建多条短链不重复扣存储容量</span>
              </label>
              {assets.length > 0 ? (
                <select
                  value={assetId}
                  onChange={(e) => setAssetId(e.target.value)}
                  className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 text-sm outline-none focus:border-[var(--ink)]"
                >
                  {assets.map((a) => (
                    <option key={a.assetId} value={a.assetId}>
                      {a.fileName} ({a.businessId} · {formatMB(a.sizeBytes)}) [{a.assetId.slice(0, 12)}…]
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={assetId}
                  onChange={(e) => setAssetId(e.target.value)}
                  placeholder="输入素材 ID（ast_...）"
                  className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none focus:border-[var(--ink)]"
                />
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="flex justify-between text-xs font-medium text-[var(--ink-2)]">
              <span>自定义短码</span>
              <span className="font-normal text-[var(--ink-3)]">
                选填 · 4–64 位小写字母、数字、-；留空自动生成 8 位
              </span>
            </label>
            <div className="flex">
              <span className="flex items-center rounded-l border border-r-0 border-[var(--line-2)] bg-[var(--paper-2)] px-3 font-mono text-xs text-[var(--ink-3)]">
                {baseHost}/r/
              </span>
              <input
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value)}
                placeholder="my-cat"
                className="h-10 flex-1 rounded-r border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none focus:border-[var(--ink)]"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex justify-between text-xs font-medium text-[var(--ink-2)]">
              <span>有效期</span>
              <span className="font-normal text-[var(--ink-3)]">属于单条短链，模板不提供此字段</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["1d", "1 天"],
                  ["7d", "7 天"],
                  ["30d", "30 天"],
                  ["custom", "自定义"],
                  ["never", "不过期"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setExpirePreset(k);
                    setActivePreset(null);
                  }}
                  className={`h-8 cursor-pointer rounded-full border px-3 text-xs ${
                    expirePreset === k
                      ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                      : "border-[var(--line-2)] bg-[var(--paper-3)] text-[var(--ink-2)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {expirePreset === "custom" && (
              <input
                type="datetime-local"
                value={customExpire}
                onChange={(e) => setCustomExpire(e.target.value)}
                className="mt-1 h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none"
              />
            )}
          </div>

          <div className="flex items-center gap-2.5 font-mono text-[11px] tracking-widest text-[var(--ink-3)]">
            <span>03 · 访问规则来源（三选一互斥）</span>
            <span className="h-px flex-1 bg-[var(--line)]" />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["inline", "直接配置", "本次单独设定"],
                ["latest", "模板 · 最新版", "创建时固定版本"],
                ["version", "模板 · 指定版本", "引用历史版本"],
              ] as const
            ).map(([k, title, sub]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setRuleMode(k);
                  if (k !== "inline") setActivePreset(null);
                }}
                className={`cursor-pointer rounded border p-2.5 text-left transition ${
                  ruleMode === k
                    ? "border-[var(--ink)] bg-[var(--paper-3)] shadow-[inset_0_0_0_1px_var(--ink)]"
                    : "border-[var(--line-2)] bg-[var(--paper-3)]/60"
                }`}
              >
                <b className="block text-[13px]">{title}</b>
                <small className="text-[11px] text-[var(--ink-3)]">{sub}</small>
              </button>
            ))}
          </div>

          {ruleMode === "inline" ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <label className="flex justify-between text-xs font-medium text-[var(--ink-2)]">
                    <span>最大访问次数</span>
                    <span className="font-normal text-[var(--ink-3)]">1 阅后即焚 · -1 不限</span>
                  </label>
                  <input
                    type="number"
                    value={maxVisits}
                    onChange={(e) => {
                      setMaxVisits(e.target.value);
                      setActivePreset(null);
                    }}
                    className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="flex justify-between text-xs font-medium text-[var(--ink-2)]">
                    <span>允许的 IP CIDR</span>
                    <span className="font-normal text-[var(--ink-3)]">留空不限</span>
                  </label>
                  <input
                    value={cidrsText}
                    onChange={(e) => setCidrsText(e.target.value)}
                    placeholder="10.0.0.0/8, 203.0.113.0/24"
                    className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-xs outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded border border-[var(--line)] bg-[var(--paper-3)] p-3">
                <div>
                  <b className="text-sm">启用访问口令</b>
                  <p className="text-xs text-[var(--ink-3)]">访问者需先提交正确口令才返回 302 跳转</p>
                </div>
                <input
                  type="checkbox"
                  checked={requirePassword}
                  onChange={(e) => {
                    setRequirePassword(e.target.checked);
                    setActivePreset(null);
                  }}
                  className="h-4 w-4 accent-[var(--signal)]"
                />
              </div>

              {requirePassword && (
                <div className="flex flex-col gap-3 rounded border border-[var(--line-2)] bg-[var(--paper-3)] p-3.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-[var(--ink-2)]">
                      口令错误处理策略（必选，默认预选固定冷却）
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setStrategy("fixed_cooldown")}
                        className={`cursor-pointer rounded border p-2.5 text-left ${
                          strategy === "fixed_cooldown"
                            ? "border-[var(--ink)] bg-white shadow-[inset_0_0_0_1px_var(--ink)]"
                            : "border-[var(--line-2)]"
                        }`}
                      >
                        <b className="block text-xs">固定冷却 (fixed_cooldown)</b>
                        <small className="text-[11px] text-[var(--ink-3)]">
                          15 分钟内连错 5 次，固定冷却 15 分钟
                        </small>
                      </button>
                      <button
                        type="button"
                        onClick={() => setStrategy("progressive_cooldown")}
                        className={`cursor-pointer rounded border p-2.5 text-left ${
                          strategy === "progressive_cooldown"
                            ? "border-[var(--ink)] bg-white shadow-[inset_0_0_0_1px_var(--ink)]"
                            : "border-[var(--line-2)]"
                        }`}
                      >
                        <b className="block text-xs">逐步冷却 (progressive_cooldown)</b>
                        <small className="text-[11px] text-[var(--ink-3)]">15m → 1h → 6h → 24h</small>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--ink-2)]">选择启用中的规则模板</label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 text-sm outline-none"
                  >
                    {templates.map((t) => (
                      <option key={t.templateId} value={t.templateId}>
                        {t.name} (最新 v{t.latestVersion})
                      </option>
                    ))}
                  </select>
                </div>
                {ruleMode === "version" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-[var(--ink-2)]">选择固定版本</label>
                    <select
                      value={selectedVersion}
                      onChange={(e) => setSelectedVersion(Number(e.target.value))}
                      className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none"
                    >
                      {versions.map((v) => (
                        <option key={v.version} value={v.version}>
                          v{v.version} ({formatDateTime(v.createdAt, "MM-DD HH:mm")})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {versionRules && (
                <div className="rounded border-l-[3px] border-[var(--ink)] bg-[var(--paper-2)] p-3 text-xs text-[var(--ink-2)]">
                  <div>
                    <b>所选模板版本规则快照：</b>
                    最大访问次数{" "}
                    <code className="font-mono">
                      {versionRules.maxVisits === -1 ? "不限 (-1)" : versionRules.maxVisits}
                    </code>{" "}
                    · IP 范围{" "}
                    <code className="font-mono">
                      {versionRules.allowedIpCidrs?.length ? versionRules.allowedIpCidrs.join(", ") : "不限"}
                    </code>{" "}
                    · 访问口令{" "}
                    <b>
                      {versionRules.requirePassword
                        ? `要求口令（策略：${
                            versionRules.wrongPasswordPolicy?.strategy === "progressive_cooldown"
                              ? "逐步冷却 progressive_cooldown"
                              : "固定冷却 fixed_cooldown"
                          }）`
                        : "不要求口令"}
                    </b>
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--ink-3)]">
                    创建时会将规则写入短链自身字段，后续模板更新、停用或删除不影响此短链。
                  </div>
                </div>
              )}
            </div>
          )}

          {effectiveRequirePassword && (
            <div className="flex flex-col gap-1.5">
              <label className="flex justify-between text-xs font-medium text-[var(--ink-2)]">
                <span>访问口令（accessPassword · 必填）</span>
                <span className="font-normal text-[var(--ink-3)]">仅用于本条短链，模板不保存口令值</span>
              </label>
              <input
                type="password"
                value={accessPassword}
                onChange={(e) => setAccessPassword(e.target.value)}
                placeholder="输入该条短链的访问口令"
                className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 outline-none focus:border-[var(--ink)]"
              />
            </div>
          )}
        </div>
      </Drawer>

      <Modal
        open={Boolean(createdLink)}
        onCancel={() => setCreatedLink(null)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={handleDownloadQR} className="stub-btn ghost">
              <Download size={14} />
              下载二维码 PNG
            </button>
            <button type="button" onClick={() => setCreatedLink(null)} className="stub-btn">
              完成
            </button>
          </div>
        }
        title="短链已创建"
      >
        {createdLink && (
          <div className="flex flex-col gap-4 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-[var(--ink)] bg-[var(--paper-3)] p-4">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs text-[var(--ink-3)]">{createdLink.url}</div>
                <div className="font-display text-4xl leading-tight">/r/{createdLink.code}</div>
                {createdLink.rules.maxVisits === 1 && (
                  <span className="stub-badge signal mt-1.5">🔥 阅后即焚 · 1 次有效访问后即销毁</span>
                )}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => copy(createdLink.url, "已复制完整短链 URL")}
                    className="stub-btn signal !h-8 !px-3 !text-xs"
                  >
                    复制短链
                  </button>
                </div>
              </div>

              <div
                ref={qrWrapRef}
                className="rounded border border-[var(--line)] bg-[#fbf9f4] p-2"
                title="短链二维码"
              >
                <QRCode
                  value={createdLink.url}
                  size={104}
                  color="#17150f"
                  bgColor="#fbf9f4"
                  icon="/favicon.svg"
                  iconSize={22}
                  bordered={false}
                />
              </div>
            </div>

            <dl className="grid grid-cols-[110px_1fr] gap-y-2 text-xs">
              <dt className="text-[var(--ink-3)]">稳定 LinkId</dt>
              <dd className="font-mono font-medium">{createdLink.linkId}</dd>
              <dt className="text-[var(--ink-3)]">访问次数上限</dt>
              <dd className="font-mono">
                {createdLink.rules.maxVisits === -1 ? "不限 (-1)" : `${createdLink.rules.maxVisits} 次`}
              </dd>
              <dt className="text-[var(--ink-3)]">有效期至</dt>
              <dd className="font-mono">
                {createdLink.expiresAt ? formatDateTime(createdLink.expiresAt) : "不过期"}
              </dd>
              <dt className="text-[var(--ink-3)]">模板版本引用</dt>
              <dd className="font-mono">
                {createdLink.ruleTemplate
                  ? `${createdLink.ruleTemplate.templateId} (v${createdLink.ruleTemplate.version})`
                  : "内联规则 (null)"}
              </dd>
            </dl>
          </div>
        )}
      </Modal>
    </>
  );
}
