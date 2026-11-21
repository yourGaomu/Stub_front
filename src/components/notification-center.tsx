import { Badge, Button, Checkbox, Drawer } from "antd";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { useNotifications } from "../hooks/use-notifications";
import type { NotificationSettings } from "../services/notification-api";

export function NotificationCenter({ token, onOpenLink }: { token: string; onOpenLink: (linkId: string) => void }) {
  const inbox = useNotifications(token);
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [draft, setDraft] = useState<NotificationSettings | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setDraft(inbox.settings), [inbox.settings]);

  const patch: Partial<NotificationSettings> = {};
  if (draft && inbox.settings) {
    if (draft.expiryEnabled !== inbox.settings.expiryEnabled) patch.expiryEnabled = draft.expiryEnabled;
    if (draft.visitsEnabled !== inbox.settings.visitsEnabled) patch.visitsEnabled = draft.visitsEnabled;
  }
  const hasUnread = inbox.unreadCount > 0 || inbox.items.some((item) => !item.readAt);
  const refreshError = inbox.error || inbox.countError || inbox.settingsError;

  return <>
    <button type="button" aria-label={`通知，${inbox.unreadCount} 条未读`} onClick={() => { setOpen(true); void inbox.refresh(unreadOnly); }} className="shrink-0 cursor-pointer rounded p-2 text-[var(--ink-2)] hover:bg-black/5">
      <Badge count={inbox.unreadCount} overflowCount={99}><Bell size={18} /></Badge>
    </button>
    <Drawer title="通知与提醒" open={open} onClose={() => setOpen(false)} width="min(440px, 100vw)">
      <p className="mb-3 text-xs text-[var(--ink-3)]">在站内接收到期和访问次数提醒。</p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Checkbox checked={unreadOnly} disabled={inbox.busy} onChange={(event) => { setUnreadOnly(event.target.checked); inbox.refresh(event.target.checked); }}>仅未读</Checkbox>
        <Button size="small" disabled={inbox.busy || inbox.loading} onClick={() => inbox.refresh(unreadOnly)}>刷新</Button>
        <Button size="small" disabled={inbox.busy || !hasUnread} onClick={() => void inbox.readAll()}>全部已读</Button>
      </div>
      {refreshError && <p role="alert" className="mb-3 text-xs text-[var(--signal-ink)]">{refreshError} <button type="button" className="underline" disabled={inbox.loading || inbox.busy} onClick={inbox.retry}>重试加载</button></p>}
      {inbox.operationError && <p role="alert" className="mb-3 text-xs text-[var(--signal-ink)]">{inbox.operationError}</p>}
      {inbox.loading && <p role="status" className="mb-3 text-xs">正在加载通知…</p>}
      {!inbox.loading && !inbox.error && inbox.items.length === 0 && <p className="py-8 text-center text-sm text-[var(--ink-3)]">{unreadOnly ? "暂无未读通知" : "暂无通知"}</p>}
      <ul className="space-y-3">
        {inbox.items.map((item) => {
          const linkId = item.linkId;
          return <li key={item.notificationId} className="rounded border border-[var(--line-2)] bg-[var(--paper-3)] p-3 text-sm">
            <div className="flex items-start justify-between gap-2"><b className="break-words">{item.title}</b>{!item.readAt && <span className="shrink-0 text-xs text-[var(--signal-ink)]">未读</span>}</div>
            <p className="mt-1 break-words text-xs text-[var(--ink-2)]">{item.summary}</p>
            <time dateTime={item.createdAt} className="mt-2 block text-[11px] text-[var(--ink-3)]">{new Date(item.createdAt).toLocaleString()}</time>
            <div className="mt-2 flex flex-wrap gap-2">
              {!item.readAt && <Button size="small" disabled={inbox.busy} onClick={() => void inbox.markRead(item)}>标为已读</Button>}
              {linkId && <Button size="small" disabled={inbox.busy} onClick={async () => {
                if (await inbox.markRead(item)) {
                  setOpen(false);
                  onOpenLink(linkId);
                }
              }}>查看短链</Button>}
            </div>
          </li>;
        })}
      </ul>
      {inbox.hasMore && <Button block className="mt-3" disabled={!!inbox.error || inbox.loading || inbox.busy} onClick={inbox.loadMore}>加载更多通知</Button>}
      {draft && <fieldset className="mt-6 space-y-3 rounded border border-[var(--line-2)] p-3" disabled={inbox.busy}>
        <legend className="px-1 text-sm font-bold">提醒设置</legend>
        <Checkbox className="block" checked={draft.expiryEnabled} onChange={(event) => { setSaved(false); setDraft({ ...draft, expiryEnabled: event.target.checked }); }}>截止前 24 小时提醒</Checkbox>
        <Checkbox className="block" checked={draft.visitsEnabled} onChange={(event) => { setSaved(false); setDraft({ ...draft, visitsEnabled: event.target.checked }); }}>次数使用达到 80% 提醒</Checkbox>
        <Button size="small" disabled={inbox.busy || !Object.keys(patch).length} onClick={async () => { if (await inbox.updateSettings(patch)) setSaved(true); }}>保存设置</Button>
        {saved && <p role="status" className="text-xs">提醒设置已保存</p>}
        <p className="text-[11px] text-[var(--ink-3)]">关闭提醒后，历史通知仍可查阅。</p>
      </fieldset>}
    </Drawer>
  </>;
}
