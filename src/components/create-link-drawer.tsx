import { App, Drawer, Input, Modal, QRCode, Select } from "antd";
import dayjs from "dayjs";
import { Download, Flame, Globe, PackageCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCopy } from "@/hooks/use-copy";
import { groupOptions, notifyGroupsChanged, useLinkGroups } from "@/hooks/use-link-groups";
import { useRemoteOptions } from "@/hooks/use-remote-options";
import { formatDateTime, formatMB, getPublicBaseURL } from "@/lib/format";
import {
  ACCESS_PASSWORD_MAX_BYTES,
  CIDRS_MAX_LENGTH,
  buildCreateWindow,
  hasWindowEnded,
  localExpiration,
  localWindowTime,
  parseAllowedIpCidrs,
  parseMaxVisits,
  validateAccessPassword,
} from "@/lib/link-form";
import { assetsApi, linkGroupsApi, linksApi, templatesApi } from "@/services/api";
import { getApiErrorMessage } from "@/services/api/client";
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

const assetOptionId = (asset: AssetDTO) => asset.assetId;
const templateOptionId = (template: TemplateListItem) => template.templateId;
const loadAssetOptions = (query: { page: number; pageSize: number; keyword?: string }) => assetsApi.list({ ...query, includeDeleted: false });
const loadTemplateOptions = (query: { page: number; pageSize: number; keyword?: string }) => templatesApi.list({ ...query, status: "active", includeDeleted: false });

export type LinkQuickPreset = "burn" | "delivery" | "public";

interface CreateLinkDrawerProps {
  open: boolean;
  initialTargetType?: "url" | "minio_asset";
  initialAssetId?: string;
  initialPreset?: LinkQuickPreset | null;
  source?: LinkDTO | null;
  onClose: () => void;
  onSuccess?: (link: LinkDTO) => void;
}

export function CreateLinkDrawer({
  open,
  initialTargetType = "url",
  initialAssetId = "",
  initialPreset = null,
  source = null,
  onClose,
  onSuccess,
}: CreateLinkDrawerProps) {
  const { message } = App.useApp();
  const copy = useCopy();
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const refreshUsage = useAuthStore((s) => s.refreshUsage);
  const qrWrapRef = useRef<HTMLDivElement>(null);
  const submitLock = useRef(false);
  const groupCreateLock = useRef(false);
  const userWorkspace = useAuthStore((state) => state.user?.defaultWorkspaceId);
  const formIdentity = JSON.stringify([open, source?.linkId, userWorkspace, initialAssetId, initialTargetType, initialPreset]);
  const formIdentityRef = useRef(formIdentity);
  const formGeneration = useRef(0);
  const alive = useRef(true);
  if (formIdentityRef.current !== formIdentity) {
    formIdentityRef.current = formIdentity;
    formGeneration.current++;
  }
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; formGeneration.current++; };
  }, []);
  const [groupId, setGroupId] = useState<string | null>(null);
  const groups = useLinkGroups(open && hasPermission("links.read"));
  const [quickGroupOpen, setQuickGroupOpen] = useState(false);
  const [quickGroupName, setQuickGroupName] = useState("");
  const [quickGroupDescription, setQuickGroupDescription] = useState("");
  const [quickGroupError, setQuickGroupError] = useState("");
  const [quickGroupBusy, setQuickGroupBusy] = useState(false);

  const [activePreset, setActivePreset] = useState<LinkQuickPreset | null>(initialPreset);
  const [targetType, setTargetType] = useState<"url" | "minio_asset">(initialTargetType);
  const [targetUrl, setTargetUrl] = useState("");
  const [assetId, setAssetId] = useState(initialAssetId);
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const [customCode, setCustomCode] = useState("");
  const [expirePreset, setExpirePreset] = useState<"1d" | "7d" | "30d" | "custom" | "never">("7d");
  const [customExpire, setCustomExpire] = useState(dayjs().add(7, "day").format("YYYY-MM-DDTHH:mm"));
  const [activeFrom, setActiveFrom] = useState("");
  const [activeUntil, setActiveUntil] = useState("");

  const [ruleMode, setRuleMode] = useState<"inline" | "latest" | "version">("inline");
  const [maxVisits, setMaxVisits] = useState<string>("50");
  const [cidrsText, setCidrsText] = useState("");
  const [requirePassword, setRequirePassword] = useState(false);
  const [strategy, setStrategy] = useState<"fixed_cooldown" | "progressive_cooldown">("fixed_cooldown");
  const [accessPassword, setAccessPassword] = useState("");

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const optionResetKey = JSON.stringify([open, source?.linkId, initialAssetId, initialTargetType]);
  const assetOptions = useRemoteOptions({ enabled: open && hasPermission("assets.read"), resetKey: optionResetKey, selectedId: assetId, getId: assetOptionId, loadPage: loadAssetOptions });
  const templateOptions = useRemoteOptions({ enabled: open && hasPermission("templates.read_use"), resetKey: optionResetKey, selectedId: selectedTemplateId, getId: templateOptionId, loadPage: loadTemplateOptions });
  const [templateDetail, setTemplateDetail] = useState<TemplateDTO | null>(null);
  const [versions, setVersions] = useState<TemplateVersionListItem[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | undefined>(undefined);
  const [versionRules, setVersionRules] = useState<LinkRules | null>(null);
  const [validatedTemplate, setValidatedTemplate] = useState<{ templateId: string; mode: string; version: number } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [createdLink, setCreatedLink] = useState<LinkDTO | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState("");
  const [versionLoading, setVersionLoading] = useState(false);
  const [versionError, setVersionError] = useState("");
  const [expirationConfirmed, setExpirationConfirmed] = useState(false);

  const applyPreset = useCallback((preset: LinkQuickPreset) => {
    setActivePreset(preset);
    setRuleMode("inline");
    setExpirationConfirmed(true);
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
    const requestedAsset = source?.target.type === "minio_asset" ? source.target.assetId || "" : initialAssetId;
    const defaultTarget = hasPermission("links.create_url") ? initialTargetType : "minio_asset";
    setTargetType(source?.target.type || defaultTarget);
    setTargetUrl(source?.target.type === "url" ? source.target.url || "" : "");
    setAssetId(requestedAsset);
    setGroupId(source?.groupId || null);
    setQuickGroupOpen(false);
    setQuickGroupName("");
    setQuickGroupDescription("");
    setQuickGroupError("");
    setTitle(source?.title || "");
    setTags(source?.tags.slice() || []);
    setCustomCode("");
    setExpirePreset(source ? (source.expiresAt ? "custom" : "never") : "7d");
    setCustomExpire(source?.expiresAt ? localExpiration(source.expiresAt) : dayjs().add(7, "day").format("YYYY-MM-DDTHH:mm"));
    setExpirationConfirmed(!source?.expiresAt || dayjs(source.expiresAt).isAfter(dayjs()));
    setActiveFrom(localWindowTime(source?.activeFrom));
    setActiveUntil(localWindowTime(source?.activeUntil));
    setRuleMode("inline");
    setMaxVisits(String(source?.rules.maxVisits ?? 50));
    setCidrsText(source?.rules.allowedIpCidrs.join("\n") || "");
    setRequirePassword(source?.rules.requirePassword || false);
    setStrategy(source?.rules.wrongPasswordPolicy?.strategy || "fixed_cooldown");
    setAccessPassword("");
    setActivePreset(null);
    setSelectedTemplateId("");
    setSelectedVersion(undefined);
    setTemplateDetail(null);
    setValidatedTemplate(null);
    setVersionRules(null);
    setVersions([]);
    setCreatedLink(null);
    setSubmitError("");
    setRulesError("");
    setVersionError("");
    if (!source && initialPreset) applyPreset(initialPreset);
  }, [open, source, userWorkspace, initialTargetType, initialAssetId, initialPreset, hasPermission, applyPreset]);

  useEffect(() => {
    setTemplateDetail(null);
    setValidatedTemplate(null);
    setVersionRules(null);
    setVersions([]);
    setSelectedVersion(undefined);
    setRulesError("");
    setVersionError("");
    setRulesLoading(false);
    if (!open || ruleMode === "inline" || !selectedTemplateId) return;
    let cancelled = false;
    setRulesLoading(true);
    const load = async () => {
      try {
        const [detail, history] = await Promise.all([
          templatesApi.get(selectedTemplateId),
          ruleMode === "version" ? templatesApi.listVersions(selectedTemplateId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        if (detail.status !== "active" || detail.deletedAt) throw new Error("该模板已停用或删除，请重新选择");
        setTemplateDetail(detail);
        setVersions(history?.versions || []);
        setSelectedVersion(detail.latestVersion);
        if (ruleMode === "latest") {
          setVersionRules(detail.latestRules);
          setValidatedTemplate({ templateId: selectedTemplateId, mode: ruleMode, version: detail.latestVersion });
        }
      } catch (error) {
        if (!cancelled) setRulesError(getApiErrorMessage(error, "模板规则加载失败，请重新选择模板"));
      } finally {
        if (!cancelled) setRulesLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [open, ruleMode, selectedTemplateId]);

  useEffect(() => {
    setVersionError("");
    setVersionLoading(false);
    if (!open || ruleMode !== "version" || !selectedTemplateId || !selectedVersion) return;
    let cancelled = false;
    setVersionRules(null);
    setValidatedTemplate(null);
    setVersionLoading(true);
    templatesApi.getVersion(selectedTemplateId, selectedVersion)
      .then((version) => {
        if (cancelled) return;
        setVersionRules(version.rules);
        setValidatedTemplate({ templateId: selectedTemplateId, mode: ruleMode, version: version.version });
      })
      .catch((error) => {
        if (!cancelled) setVersionError(getApiErrorMessage(error, "模板版本加载失败，请重新选择版本"));
      })
      .finally(() => { if (!cancelled) setVersionLoading(false); });
    return () => { cancelled = true; };
  }, [open, ruleMode, selectedTemplateId, selectedVersion]);

  const effectiveRequirePassword =
    ruleMode === "inline" ? requirePassword : Boolean(versionRules?.requirePassword);

  const createQuickGroup = async () => {
    if (groupCreateLock.current || !hasPermission("links.manage")) return;
    const name = quickGroupName.trim();
    if (!name) { setQuickGroupError("请输入分组名称"); return; }
    if (!groups.loaded || groups.items.length >= 50) { setQuickGroupError("请成功加载分组列表后重试，每个工作空间最多 50 个分组"); return; }
    if (groups.items.some((group) => group.name.toLowerCase() === name.toLowerCase())) { setQuickGroupError("当前工作空间已有同名分组（名称不区分大小写）"); return; }
    groupCreateLock.current = true; setQuickGroupBusy(true); setQuickGroupError("");
    const generation = formGeneration.current;
    try {
      const created = await linkGroupsApi.create({ name, description: quickGroupDescription.trim() });
      notifyGroupsChanged();
      if (!alive.current || generation !== formGeneration.current) return;
      setGroupId(created.groupId);
      setQuickGroupOpen(false);
      message.success("分组已创建并选中");
    } catch (error) {
      if (alive.current && generation === formGeneration.current) setQuickGroupError(getApiErrorMessage(error, "创建分组失败，请重试"));
    } finally { groupCreateLock.current = false; if (alive.current) setQuickGroupBusy(false); }
  };

  const handleSubmit = async () => {
    if (submitLock.current) return;
    let payload: CreateLinkRequest;
    try {
      if (!hasPermission(targetType === "url" ? "links.create_url" : "links.create_asset")) {
        throw new Error("没有创建该目标类型短链的权限");
      }
      if (targetType === "url") {
        let url: URL;
        try { url = new URL(targetUrl.trim()); } catch { throw new Error("请输入完整的 HTTPS 目标网址"); }
        if (url.protocol !== "https:" || targetUrl.trim().length > 8192) {
          throw new Error("目标网址必须使用 HTTPS，且不超过 8192 个字符");
        }
      } else if (!assetId.trim() || assetId.trim().length > 128) {
        throw new Error("请选择或输入素材 ID，最多 128 个字符");
      }
      if (title.trim().length > 120 || tags.length > 20 || tags.some((tag) => tag.trim().length > 32)) {
        throw new Error("标题最多 120 字，最多 20 个标签且每个标签不超过 32 字");
      }
      const code = customCode.trim().toLowerCase();
      if (code && !/^[a-z0-9-]{4,64}$/.test(code)) {
        throw new Error("自定义短码必须为 4–64 位小写字母、数字或 -");
      }
      if (ruleMode !== "inline" && (
        !hasPermission("templates.read_use") || !selectedTemplateId || !templateDetail ||
        !versionRules || rulesLoading || versionLoading || rulesError || versionError ||
        !validatedTemplate || validatedTemplate.templateId !== selectedTemplateId || validatedTemplate.mode !== ruleMode ||
        (ruleMode === "version" && validatedTemplate.version !== selectedVersion)
      )) {
        throw new Error("请先选择并成功加载模板规则");
      }
      if (effectiveRequirePassword) validateAccessPassword(accessPassword);
      if (source && !expirationConfirmed) throw new Error("复制配置后请重新选择有效期（也可明确选择不过期）");
      let expiresAt: string | null = null;
      if (expirePreset === "1d") expiresAt = dayjs().add(1, "day").toISOString();
      else if (expirePreset === "7d") expiresAt = dayjs().add(7, "day").toISOString();
      else if (expirePreset === "30d") expiresAt = dayjs().add(30, "day").toISOString();
      else if (expirePreset === "custom") {
        const parsed = source?.expiresAt && customExpire === localExpiration(source.expiresAt)
          ? dayjs(source.expiresAt) : dayjs(customExpire);
        if (!parsed.isValid() || !parsed.isAfter(dayjs())) throw new Error("自定义到期时间必须晚于当前时间");
        expiresAt = source?.expiresAt && customExpire === localExpiration(source.expiresAt) ? source.expiresAt : parsed.toISOString();
      }
      const window = buildCreateWindow({ activeFrom, activeUntil }, expiresAt, source);
      if (groupId && groups.loaded && !groups.items.some((group) => group.groupId === groupId && (!userWorkspace || group.workspaceId === userWorkspace))) {
        throw new Error("所选分组不属于当前工作空间或已删除，请重新选择分组，或明确选择未分组");
      }
      if (groupId && !groups.loaded && groupId !== source?.groupId) throw new Error("请先成功加载分组列表以确认分组工作空间");
      payload = {
        groupId,
        title: title.trim(),
        tags: tags.map((tag) => tag.trim()).filter(Boolean),
        code: code || undefined,
        target: targetType === "url"
          ? { type: "url", url: targetUrl.trim() }
          : { type: "minio_asset", assetId: assetId.trim() },
        expiresAt,
        ...window,
        ...(effectiveRequirePassword ? { accessPassword } : {}),
        ruleSource: ruleMode === "inline"
          ? {
              type: "inline",
              rules: {
                maxVisits: parseMaxVisits(maxVisits),
                allowedIpCidrs: parseAllowedIpCidrs(cidrsText),
                requirePassword,
                ...(requirePassword ? { wrongPasswordPolicy: { strategy } } : {}),
              },
            }
          : {
              type: "template",
              template: {
                templateId: selectedTemplateId,
                version: validatedTemplate!.version,
              },
            },
      };
    } catch (error) {
      const text = error instanceof Error ? error.message : "请检查创建参数";
      setSubmitError(text);
      message.warning(text);
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      const created = await linksApi.create(payload);
      setCreatedLink(created);
      onSuccess?.(created);
      onClose();
      void refreshUsage();
    } catch (error) {
      setSubmitError(getApiErrorMessage(error, "创建短链失败，请稍后重试"));
    } finally {
      submitLock.current = false;
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
        title={<span className="font-cn-display text-xl font-black">{source ? "复制配置 · 新建受控短链" : "新建受控短链"}</span>}
        width={560}
        open={open}
        onClose={() => { if (!submitLock.current) onClose(); }}
        closable={!submitting}
        maskClosable={!submitting}
        keyboard={!submitting}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" disabled={submitting} onClick={onClose} className="stub-btn ghost">
              取消
            </button>
            <button type="button" disabled={submitting} onClick={handleSubmit} className="stub-btn signal">
              {submitting ? "正在创建…" : "创建短链"}
            </button>
          </div>
        }
      >
        <fieldset disabled={submitting} className="flex min-w-0 flex-col gap-5 border-0 p-0">
          {source && (
            <div className="rounded border border-[var(--line-2)] bg-[var(--paper-2)] p-3 text-xs leading-5 text-[var(--ink-2)]">
              已复制 /r/{source.code} 的标题、标签、目标、分组及当前生效规则，规则以直接配置保存，不关联原模板。
              <div>分组仅可用于同一工作空间；跨工作空间复制时请重新选择分组或明确选择未分组。</div>
              新短码由本次创建生成，访问次数从 0 开始。原口令不会复制，要求口令时必须重新设置；原有效期已过期时需重新选择。
              {source.expiresAt && <div>原到期时间：{formatDateTime(source.expiresAt, "YYYY-MM-DD HH:mm:ss.SSS Z")}</div>}
              {source.activeFrom && <div>原开放开始：{formatDateTime(source.activeFrom, "YYYY-MM-DD HH:mm:ss.SSS Z")}</div>}
              {source.activeUntil && <div>原开放结束：{formatDateTime(source.activeUntil, "YYYY-MM-DD HH:mm:ss.SSS Z")}</div>}
              {hasWindowEnded(source.activeUntil) && <div className="font-bold text-[var(--warn)]">原开放窗口已结束，创建前请明确修改或清除开放结束时间。</div>}
            </div>
          )}
          {submitError && <div role="alert" className="rounded border border-[var(--signal)] bg-[var(--signal-soft)] p-3 text-xs text-[var(--signal-ink)]">{submitError}</div>}
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

          <div className="flex flex-col gap-2">
            <label htmlFor="create-link-group" className="text-xs font-medium text-[var(--ink-2)]">分组（当前工作空间）</label>
            <div className="flex gap-2">
              <Select id="create-link-group" className="min-w-0 flex-1" disabled={submitting} loading={groups.loading} value={groupId || ""} onChange={(value: string) => setGroupId(value || null)} options={[{ value: "", label: "未分组" }, ...groupOptions(groups.items, groupId, groupId === source?.groupId ? source?.groupName : null)]} />
              {hasPermission("links.manage") && <button type="button" disabled={submitting || quickGroupBusy || groups.loading || !groups.loaded || groups.items.length >= 50} className="stub-btn ghost !h-8 !text-xs" onClick={() => { setQuickGroupName(""); setQuickGroupDescription(""); setQuickGroupError(""); setQuickGroupOpen(true); }}>新建分组</button>}
            </div>
            {groups.error && <p role="alert" className="text-xs text-[var(--signal-ink)]">{groups.error} <button type="button" disabled={groups.loading} className="underline" onClick={() => void groups.reload()}>重试分组</button></p>}
            {groupId && groups.loaded && !groups.items.some((group) => group.groupId === groupId) && <p role="alert" className="text-xs text-[var(--warn)]">原分组不在当前工作空间可用列表中，请重新选择或明确选择未分组。</p>}
          </div>

          <div className="flex items-center gap-2.5 font-mono text-[11px] tracking-widest text-[var(--ink-3)]">
            <span>02 · 目标（创建后不可修改）</span>
            <span className="h-px flex-1 bg-[var(--line)]" />
          </div>

          <div className="inline-flex w-fit gap-1 rounded border border-[var(--line-2)] bg-[var(--paper-3)] p-1">
            <button
              type="button"
              onClick={() => setTargetType("url")}
              disabled={!hasPermission("links.create_url")}
              title={!hasPermission("links.create_url") ? "需要网址短链创建权限" : undefined}
              className={`cursor-pointer rounded px-3.5 py-1 text-[13px] ${
                targetType === "url" ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink-2)]"
              }`}
            >
              HTTPS 网址
            </button>
            <button
              type="button"
              onClick={() => setTargetType("minio_asset")}
              disabled={!hasPermission("links.create_asset")}
              title={!hasPermission("links.create_asset") ? "需要素材短链创建权限" : undefined}
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
                maxLength={8192}
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
              <Select
                aria-label="选择已上传素材"
                showSearch={{ filterOption: false, onSearch: assetOptions.setSearch }}
                loading={assetOptions.loading}
                disabled={submitting || !hasPermission("assets.read")}
                value={assetId || undefined}
                placeholder="搜索素材名称后选择"
                onChange={(value: string) => { assetOptions.cacheSelection(value); setAssetId(value); }}
                options={[
                  ...(assetId && !assetOptions.options.some((asset) => asset.assetId === assetId) ? [{ value: assetId, label: `指定素材 · ${assetId}` }] : []),
                  ...assetOptions.options.map((asset) => ({ value: asset.assetId, label: `${asset.fileName} (${asset.businessId} · ${formatMB(asset.sizeBytes)}) [${asset.assetId}]` })),
                ]}
                notFoundContent={assetOptions.loading ? "正在加载…" : "无匹配素材，可输入素材 ID"}
              />
              <input aria-label="素材 ID" value={assetId} maxLength={128} onChange={(event) => setAssetId(event.target.value.trim())} placeholder="也可输入列表外素材 ID（ast_...）" className="h-9 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-xs outline-none" />
              {assetOptions.loading && <p role="status" className="text-xs text-[var(--ink-3)]">正在加载素材…</p>}
              {assetOptions.error && <p role="alert" className="text-xs text-[var(--signal-ink)]">{assetOptions.error} <button type="button" disabled={assetOptions.loading} className="underline" onClick={assetOptions.retry}>重试素材</button></p>}
              {assetOptions.hasMore && <button type="button" disabled={assetOptions.loading || Boolean(assetOptions.error)} onClick={assetOptions.loadMore} className="stub-btn ghost !h-8 !text-xs">加载更多素材</button>}
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
                maxLength={64}
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
                    setExpirationConfirmed(true);
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
                onChange={(e) => { setCustomExpire(e.target.value); setExpirationConfirmed(true); }}
                className="mt-1 h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none"
              />
            )}
            {source && !expirationConfirmed && <p className="text-xs text-[var(--warn)]">请重新选择有效期后创建；可选择新的到期时间或明确选择不过期。</p>}
          </div>

          <div className="flex flex-col gap-2.5 rounded border border-[var(--line-2)] bg-[var(--paper-2)] p-3">
            <div className="text-xs font-medium">定时开放窗口（可选）</div>
            <p className="text-[11px] leading-5 text-[var(--ink-3)]">按本机时区 {Intl.DateTimeFormat().resolvedOptions().timeZone} 输入，保存为 UTC。开始时刻可访问，结束时刻起停止；实际截止取开放结束与短链到期的较早者。时间窗独立于模板。</p>
            <label className="flex flex-col gap-1.5 text-xs text-[var(--ink-2)]">开放开始时间（留空不限制开始）
              <input type="datetime-local" step="1" value={activeFrom} onChange={(event) => setActiveFrom(event.target.value)} className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none" />
            </label>
            <label className="flex flex-col gap-1.5 text-xs text-[var(--ink-2)]">开放结束时间（留空不限制结束）
              <input type="datetime-local" step="1" value={activeUntil} onChange={(event) => setActiveUntil(event.target.value)} className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none" />
            </label>
            <button type="button" onClick={() => { setActiveFrom(""); setActiveUntil(""); }} className="stub-btn ghost !h-8 !text-xs">清除时间窗</button>
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
                disabled={k !== "inline" && !hasPermission("templates.read_use")}
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
                    <span className="font-normal text-[var(--ink-3)]">-1 不限 · 0 禁止 · 正整数上限</span>
                  </label>
                  <input
                    type="number"
                    min={-1}
                    max={Number.MAX_SAFE_INTEGER}
                    step={1}
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
                    maxLength={CIDRS_MAX_LENGTH}
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
                            ? "border-[var(--ink)] bg-[var(--paper-3)] shadow-[inset_0_0_0_1px_var(--ink)]"
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
                            ? "border-[var(--ink)] bg-[var(--paper-3)] shadow-[inset_0_0_0_1px_var(--ink)]"
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
              {(templateOptions.loading || rulesLoading || versionLoading) && <p role="status" className="text-xs text-[var(--ink-3)]">正在加载模板规则…</p>}
              {(templateOptions.error || rulesError || versionError) && <p role="alert" className="text-xs text-[var(--signal-ink)]">{templateOptions.error || rulesError || versionError} {templateOptions.error && <button type="button" disabled={templateOptions.loading} className="underline" onClick={templateOptions.retry}>重试模板列表</button>}</p>}
              {!templateOptions.loading && !templateOptions.error && templateOptions.items.length === 0 && <p className="text-xs text-[var(--ink-3)]">没有匹配模板，可调整搜索或使用直接配置。</p>}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--ink-2)]">选择启用中的规则模板</label>
                  <Select
                    aria-label="选择启用中的规则模板"
                    showSearch={{ filterOption: false, onSearch: templateOptions.setSearch }}
                    loading={templateOptions.loading}
                    disabled={submitting}
                    value={selectedTemplateId || undefined}
                    placeholder="搜索规则模板"
                    onChange={(value: string) => { templateOptions.cacheSelection(value); setValidatedTemplate(null); setSelectedTemplateId(value); }}
                    options={[
                      ...(selectedTemplateId && !templateOptions.options.some((template) => template.templateId === selectedTemplateId) ? [{ value: selectedTemplateId, label: `指定模板 · ${selectedTemplateId}` }] : []),
                      ...templateOptions.options.map((template) => ({ value: template.templateId, label: `${template.name} (最新 v${template.latestVersion})` })),
                    ]}
                    notFoundContent={templateOptions.loading ? "正在加载…" : "无匹配模板"}
                  />
                  <input aria-label="模板 ID" value={selectedTemplateId} maxLength={128} onChange={(event) => { setValidatedTemplate(null); setSelectedTemplateId(event.target.value.trim()); }} placeholder="也可输入列表外模板 ID" className="h-9 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-xs outline-none" />
                  {templateOptions.hasMore && <button type="button" disabled={templateOptions.loading || Boolean(templateOptions.error)} onClick={templateOptions.loadMore} className="stub-btn ghost !h-8 !text-xs">加载更多模板</button>}
                </div>
                {ruleMode === "version" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-[var(--ink-2)]">选择固定版本</label>
                    <select
                      value={selectedVersion}
                      onChange={(e) => { setValidatedTemplate(null); setSelectedVersion(Number(e.target.value)); }}
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
                maxLength={ACCESS_PASSWORD_MAX_BYTES}
                autoComplete="new-password"
                value={accessPassword}
                onChange={(e) => setAccessPassword(e.target.value)}
                placeholder="设置新口令，首尾空格会保留，最多 1024 字节"
                className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 outline-none focus:border-[var(--ink)]"
              />
            </div>
          )}
        </fieldset>
      </Drawer>

      <Modal title="快捷新建分组" open={open && quickGroupOpen && hasPermission("links.manage")} onCancel={() => { if (!groupCreateLock.current) setQuickGroupOpen(false); }} onOk={() => void createQuickGroup()} confirmLoading={quickGroupBusy} closable={!quickGroupBusy} keyboard={!quickGroupBusy} maskClosable={false} cancelButtonProps={{ disabled: quickGroupBusy }} okText="创建并选中" cancelText="取消">
        <fieldset disabled={quickGroupBusy} className="flex min-w-0 flex-col gap-3 border-0 p-0">
          <p className="text-xs text-[var(--ink-3)]">创建到当前工作空间，每个空间最多 50 个分组。</p>
          <label className="flex flex-col gap-1 text-xs">名称<Input value={quickGroupName} onChange={(event) => setQuickGroupName(event.target.value)} /></label>
          <label className="flex flex-col gap-1 text-xs">描述（可选）<Input.TextArea value={quickGroupDescription} onChange={(event) => setQuickGroupDescription(event.target.value)} rows={2} /></label>
          {quickGroupError && <p role="alert" className="text-xs text-[var(--signal-ink)]">{quickGroupError}</p>}
        </fieldset>
      </Modal>
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
                  <span className="stub-badge signal mt-1.5">阅后即焚 · 1 次有效访问后不可再访问</span>
                )}
                {createdLink.rules.maxVisits === 1 && <p className="mt-1 text-xs text-[var(--ink-3)]">访问耗尽后保留短链及历史记录，不会删除素材。</p>}
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
