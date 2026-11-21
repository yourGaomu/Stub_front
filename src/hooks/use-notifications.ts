import { useCallback, useEffect, useRef, useState } from "react";
import { getStoredToken } from "../services/api/client";
import { NOTIFICATION_PAGE_SIZE, notificationsApi, type InboxNotification, type NotificationSettings } from "../services/notification-api";

interface InboxState {
  items: InboxNotification[];
  page: number;
  total: number;
  settings: NotificationSettings | null;
  loading: boolean;
  busy: boolean;
  unreadCount: number;
  error: string;
  countError: string;
  settingsError: string;
  operationError: string;
}

interface CountRequest {
  controller: AbortController;
  done: Promise<void>;
}

interface InboxSession {
  token: string;
  unreadOnly: boolean;
  page: number;
  failedPage: number;
  writing: boolean;
  settingsLoaded: boolean;
  listRequest?: AbortController;
  settingsRequest?: AbortController;
  countRequest?: CountRequest;
}

const emptyInbox: InboxState = {
  items: [], page: 0, total: 0, settings: null, loading: false, busy: false, unreadCount: 0,
  error: "", countError: "", settingsError: "", operationError: "",
};

function cancelCount(owner: InboxSession) {
  const request = owner.countRequest;
  owner.countRequest = undefined;
  request?.controller.abort();
}

function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

export function useNotifications(token: string | null) {
  const session = useRef<InboxSession | null>(null);
  const [state, setState] = useState<{ owner: InboxSession | null; inbox: InboxState }>({ owner: null, inbox: emptyInbox });
  const isCurrent = useCallback((owner: InboxSession) => session.current === owner && getStoredToken() === owner.token, []);
  const change = useCallback((owner: InboxSession, patch: Partial<InboxState> | ((inbox: InboxState) => Partial<InboxState>)) => {
    if (!isCurrent(owner)) return;
    setState((previous) => previous.owner === owner ? {
      owner, inbox: { ...previous.inbox, ...(typeof patch === "function" ? patch(previous.inbox) : patch) },
    } : previous);
  }, [isCurrent]);

  const refreshCount = useCallback((owner: InboxSession) => {
    if (!isCurrent(owner) || document.hidden) return Promise.resolve();
    if (owner.countRequest) return owner.countRequest.done;
    const request: CountRequest = { controller: new AbortController(), done: Promise.resolve() };
    owner.countRequest = request;
    request.done = notificationsApi.unreadCount(request.controller.signal).then((result) => {
      if (owner.countRequest === request) change(owner, { unreadCount: result.unreadCount, countError: "" });
    }).catch((reason) => {
      if (owner.countRequest === request) change(owner, { countError: errorMessage(reason, "未读数量加载失败") });
    }).finally(() => {
      if (owner.countRequest === request) owner.countRequest = undefined;
    });
    return request.done;
  }, [change, isCurrent]);

  const loadPage = useCallback(async (owner: InboxSession, page: number, unread: boolean) => {
    if (!isCurrent(owner)) return;
    const changedQuery = unread !== owner.unreadOnly;
    owner.unreadOnly = unread;
    owner.failedPage = page;
    if (changedQuery) owner.page = 0;
    owner.listRequest?.abort();
    const controller = new AbortController();
    owner.listRequest = controller;
    change(owner, { loading: true, error: "", ...(changedQuery ? { items: [], page: 0, total: 0 } : {}) });
    try {
      const result = await notificationsApi.list(page, unread, controller.signal);
      if (!isCurrent(owner) || owner.listRequest !== controller) return;
      owner.page = page;
      change(owner, (previous) => {
        const items = new Map((page === 1 ? [] : previous.items).map((item) => [item.notificationId, item]));
        for (const item of result.items) items.set(item.notificationId, item);
        return { items: [...items.values()], page, total: result.pagination.total, loading: false };
      });
    } catch (reason) {
      if (owner.listRequest === controller) change(owner, { loading: false, error: errorMessage(reason, "通知加载失败，请重试") });
    } finally {
      if (owner.listRequest === controller) owner.listRequest = undefined;
    }
  }, [change, isCurrent]);

  const loadSettings = async (owner: InboxSession) => {
    if (!isCurrent(owner) || owner.settingsLoaded || owner.settingsRequest) return;
    const controller = new AbortController();
    owner.settingsRequest = controller;
    change(owner, { settingsError: "" });
    try {
      const settings = await notificationsApi.settings(controller.signal);
      if (!isCurrent(owner) || owner.settingsRequest !== controller) return;
      owner.settingsLoaded = true;
      change(owner, { settings });
    } catch (reason) {
      if (owner.settingsRequest === controller) change(owner, { settingsError: errorMessage(reason, "提醒设置加载失败，请重试") });
    } finally {
      if (owner.settingsRequest === controller) owner.settingsRequest = undefined;
    }
  };

  useEffect(() => {
    const owner: InboxSession | null = token ? {
      token, unreadOnly: false, page: 0, failedPage: 1, writing: false, settingsLoaded: false,
    } : null;
    session.current = owner;
    setState({ owner, inbox: emptyInbox });
    if (!owner) return;

    let generation = 0;
    let timer: number | undefined;
    const poll = async () => {
      const turn = ++generation;
      if (document.hidden || !isCurrent(owner)) return;
      if (!owner.writing) await refreshCount(owner);
      if (turn === generation && !document.hidden && isCurrent(owner)) {
        timer = window.setTimeout(() => void poll(), 60_000);
      }
    };
    const visibility = () => {
      generation++;
      window.clearTimeout(timer);
      if (document.hidden) cancelCount(owner);
      else void poll();
    };
    document.addEventListener("visibilitychange", visibility);
    void poll();
    return () => {
      session.current = null;
      generation++;
      window.clearTimeout(timer);
      owner.listRequest?.abort();
      owner.settingsRequest?.abort();
      cancelCount(owner);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [token, isCurrent, refreshCount]);

  const perform = async (operation: (owner: InboxSession) => Promise<void>) => {
    const owner = session.current;
    if (!owner || !isCurrent(owner) || owner.writing) return false;
    owner.writing = true;
    change(owner, { busy: true, operationError: "" });
    try {
      await operation(owner);
      return isCurrent(owner);
    } catch (reason) {
      change(owner, { operationError: errorMessage(reason, "通知操作失败，请重试") });
      return false;
    } finally {
      owner.writing = false;
      change(owner, { busy: false });
    }
  };

  const saveRead = (operation: () => Promise<unknown>) => perform(async (owner) => {
    await operation();
    if (!isCurrent(owner)) return;
    cancelCount(owner);
    void loadPage(owner, 1, owner.unreadOnly);
    void refreshCount(owner);
  });

  const reload = (unread?: boolean, retry = false) => {
    const owner = session.current;
    if (!owner || !isCurrent(owner) || owner.writing) return;
    const filter = unread ?? owner.unreadOnly;
    if (!retry || state.inbox.error) void loadPage(owner, retry ? owner.failedPage : 1, filter);
    void loadSettings(owner);
    void refreshCount(owner);
  };

  const inbox = state.owner?.token === token ? state.inbox : emptyInbox;
  const hasMore = inbox.page > 0 && inbox.page * NOTIFICATION_PAGE_SIZE < inbox.total;
  return {
    ...inbox, hasMore,
    refresh: (unread: boolean) => reload(unread),
    loadMore: () => {
      const owner = session.current;
      if (owner && hasMore && !owner.listRequest && !owner.writing) void loadPage(owner, owner.page + 1, owner.unreadOnly);
    },
    retry: () => reload(undefined, true),
    markRead: (item: InboxNotification) => item.readAt
      ? Promise.resolve(session.current !== null && isCurrent(session.current))
      : saveRead(() => notificationsApi.markRead(item.notificationId)),
    readAll: () => saveRead(() => notificationsApi.readAll()),
    updateSettings: (patch: Partial<NotificationSettings>) => perform(async (owner) => {
      const settings = await notificationsApi.updateSettings(patch);
      change(owner, { settings, settingsError: "" });
    }),
  };
}
