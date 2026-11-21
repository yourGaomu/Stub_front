import { App, Input, Modal } from "antd";
import { useEffect, useRef, useState } from "react";
import { notifyGroupsChanged, useLinkGroups } from "@/hooks/use-link-groups";
import { linkGroupsApi } from "@/services/api";
import { getApiErrorMessage } from "@/services/api/client";
import type { GroupDTO } from "@/services/api/types";
import { useAuthStore } from "@/stores/auth-store";

export function LinkGroupManager({ open, workspaceId, onClose, onDeleted }: {
  open: boolean;
  workspaceId?: string;
  onClose: () => void;
  onDeleted?: (groupId: string) => void;
}) {
  const { message } = App.useApp();
  const canManage = useAuthStore((state) => state.hasPermission("links.manage"));
  const groups = useLinkGroups(open && canManage, workspaceId);
  const [editing, setEditing] = useState<GroupDTO | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<GroupDTO | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const identity = JSON.stringify([open, workspaceId]);
  const identityRef = useRef(identity);
  const generation = useRef(0);
  const alive = useRef(true);
  if (identityRef.current !== identity) { identityRef.current = identity; generation.current++; }
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; generation.current++; };
  }, []);
  useEffect(() => {
    if (!open) return;
    setEditing(null); setName(""); setDescription(""); setError(""); setDeleteTarget(null);
  }, [open, workspaceId]);
  const save = async () => {
    if (lock.current || !canManage) return;
    const cleanName = name.trim();
    if (!cleanName) { setError("请输入分组名称"); return; }
    if (groups.items.some((group) => group.groupId !== editing?.groupId && group.name.toLowerCase() === cleanName.toLowerCase())) {
      setError("当前工作空间已有同名分组（名称不区分大小写）"); return;
    }
    if (!editing && (!groups.loaded || groups.items.length >= 50)) { setError("请成功加载分组列表后重试，每个工作空间最多 50 个分组"); return; }
    lock.current = true; setBusy(true); setError("");
    const requestGeneration = generation.current;
    try {
      const body = { name: cleanName, description: description.trim() };
      if (editing) await linkGroupsApi.update(editing.groupId, body);
      else await linkGroupsApi.create({ ...body, ...(workspaceId ? { workspaceId } : {}) });
      notifyGroupsChanged();
      if (!alive.current || requestGeneration !== generation.current) return;
      setEditing(null); setName(""); setDescription("");
      message.success(editing ? "分组已更新" : "分组已创建");
    } catch (reason) {
      if (alive.current && requestGeneration === generation.current) setError(getApiErrorMessage(reason, "保存分组失败，请重试"));
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  const remove = async () => {
    if (!deleteTarget || lock.current || !canManage) return;
    lock.current = true; setBusy(true); setError("");
    const requestGeneration = generation.current;
    try {
      const result = await linkGroupsApi.remove(deleteTarget.groupId);
      notifyGroupsChanged();
      if (!alive.current || requestGeneration !== generation.current) return;
      onDeleted?.(result.groupId);
      if (editing?.groupId === result.groupId) { setEditing(null); setName(""); setDescription(""); }
      setDeleteTarget(null);
      message.success(`分组已删除，已解除 ${result.unlinkedCount} 条短链关联`);
    } catch (reason) {
      if (alive.current && requestGeneration === generation.current) setError(getApiErrorMessage(reason, "删除分组失败，请重试"));
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  return <>
    <Modal title="管理短链分组" open={open && canManage} width={620} onCancel={() => { if (!lock.current) onClose(); }} footer={null} closable={!busy} keyboard={!busy} maskClosable={!busy}>
      <p className="mb-3 text-xs text-[var(--ink-3)]">{workspaceId ? `工作空间：${workspaceId}` : "当前工作空间"} · 最多 50 个分组，名称不区分大小写。</p>
      {(groups.error || error) && <p role="alert" className="mb-3 text-xs text-[var(--signal-ink)]">{error || groups.error} {groups.error && <button type="button" disabled={busy || groups.loading} onClick={() => void groups.reload()} className="underline">重试列表</button>}</p>}
      {groups.loading && <p role="status" className="mb-2 text-xs">正在加载分组…</p>}
      <ul className="mb-4 max-h-64 divide-y divide-[var(--line-2)] overflow-auto rounded border border-[var(--line-2)]">
        {groups.items.map((group) => <li key={group.groupId} className="flex items-start justify-between gap-3 p-3 text-xs">
          <div className="min-w-0"><b className="break-all">{group.name}</b><span className="ml-2 text-[var(--ink-3)]">{group.linkCount} 条短链</span>{group.description && <p className="mt-1 break-all text-[var(--ink-3)]">{group.description}</p>}</div>
          <div className="flex shrink-0 gap-2"><button type="button" disabled={busy} className="stub-btn ghost !h-7 !text-xs" onClick={() => { setEditing(group); setName(group.name); setDescription(group.description); setError(""); }}>编辑</button><button type="button" disabled={busy} className="stub-btn ghost !h-7 !text-xs" onClick={() => { setError(""); setDeleteTarget(group); }}>删除</button></div>
        </li>)}
        {groups.loaded && groups.items.length === 0 && <li className="p-4 text-xs text-[var(--ink-3)]">暂无分组，可在下方创建。</li>}
      </ul>
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-3 border-0 p-0">
        <b className="text-xs">{editing ? `编辑分组：${editing.name}` : "新建分组"}</b>
        <label className="flex flex-col gap-1 text-xs">名称<Input value={name} onChange={(event) => setName(event.target.value)} placeholder="分组名称" /></label>
        <label className="flex flex-col gap-1 text-xs">描述（可选）<Input.TextArea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <div className="flex justify-end gap-2">{editing && <button type="button" className="stub-btn ghost" onClick={() => { setEditing(null); setName(""); setDescription(""); setError(""); }}>取消编辑</button>}<button type="button" disabled={busy || (!editing && (!groups.loaded || groups.items.length >= 50))} className="stub-btn signal" onClick={() => void save()}>{busy ? "正在保存…" : editing ? "保存修改" : "创建分组"}</button></div>
      </fieldset>
    </Modal>
    <Modal title={`删除分组「${deleteTarget?.name || ""}」？`} open={Boolean(deleteTarget) && open && canManage} onCancel={() => { if (!busy) { setDeleteTarget(null); setError(""); } }} onOk={() => void remove()} confirmLoading={busy} closable={!busy} keyboard={!busy} maskClosable={false} cancelButtonProps={{ disabled: busy }} okText="删除分组" cancelText="取消">
      <p>只解除此分组中 {deleteTarget?.linkCount ?? 0} 条短链的关联，短链、访问规则及历史记录都会保留。</p>
      {error && <p role="alert" className="mt-3 text-xs text-[var(--signal-ink)]">{error}</p>}
    </Modal>
  </>;
}
