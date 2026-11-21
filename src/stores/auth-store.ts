import { create } from "zustand";
import { authApi } from "@/services/api";
import { getStoredToken, setStoredToken } from "@/services/api/client";
import type { BusinessItem, PermissionState, UsageResponse, User } from "@/services/api/types";

const DEVICE_ID_KEY = "stub_device_instance_id";

export function getDeviceInfo() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `web_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const platform =
    ua.includes("Win") ? "Windows" : ua.includes("Mac") ? "macOS" : ua.includes("Linux") ? "Linux" : "Web";
  const browser =
    ua.includes("Edg") ? "Edge" : ua.includes("Chrome") ? "Chrome" : ua.includes("Firefox") ? "Firefox" : "Browser";
  return {
    deviceInstanceId: id,
    deviceName: `${browser} · ${platform}`,
    platform,
  };
}

interface AuthState {
  token: string | null;
  user: User | null;
  isAdmin: boolean;
  permissions: Record<string, boolean>;
  permissionItems: PermissionState[];
  businesses: BusinessItem[];
  usage: UsageResponse | null;
  loading: boolean;
  initialized: boolean;
  setLoginResult: (token: string, user: User) => Promise<void>;
  refreshBootstrap: () => Promise<void>;
  refreshUsage: () => Promise<void>;
  hasPermission: (code: string) => boolean;
  logout: () => Promise<void>;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: getStoredToken(),
  user: null,
  isAdmin: false,
  permissions: {},
  permissionItems: [],
  businesses: [],
  usage: null,
  loading: false,
  initialized: false,

  setLoginResult: async (token, user) => {
    setStoredToken(token);
    set({
      token, user, isAdmin: user.role === "admin", permissions: {}, permissionItems: [],
      businesses: [], usage: null, initialized: false,
    });
    await get().refreshBootstrap();
  },

  refreshBootstrap: async () => {
    const token = getStoredToken();
    if (!token) {
      set({
        token: null,
        user: null,
        isAdmin: false,
        permissions: {},
        permissionItems: [],
        businesses: [],
        usage: null,
        initialized: true,
      });
      return;
    }
    set({ loading: true });
    try {
      const [user, perms, biz, usage] = await Promise.all([
        authApi.me(),
        authApi.myPermissions(),
        authApi.myBusinesses(),
        authApi.myUsage(),
      ]);
      if (getStoredToken() !== token) return;
      const permMap: Record<string, boolean> = {};
      perms.items.forEach((p) => {
        permMap[p.code] = p.enabled;
      });
      set({
        token,
        user,
        isAdmin: user.role === "admin" || perms.isAdmin,
        permissions: permMap,
        permissionItems: perms.items,
        businesses: biz.items,
        usage,
        loading: false,
        initialized: true,
      });
    } catch {
      if (getStoredToken() !== token) return;
      get().clearSession();
    }
  },

  refreshUsage: async () => {
    const token = get().token;
    if (!token) return;
    try {
      const usage = await authApi.myUsage();
      if (get().token === token && getStoredToken() === token) set({ usage });
    } catch {
      // ignore
    }
  },

  hasPermission: (code: string) => {
    const { isAdmin, permissions } = get();
    if (isAdmin) return true;
    return Boolean(permissions[code]);
  },

  logout: async () => {
    try {
      if (get().token) {
        await authApi.logout();
      }
    } catch {
      // ignore
    } finally {
      get().clearSession();
    }
  },

  clearSession: () => {
    setStoredToken(null);
    set({
      token: null,
      user: null,
      isAdmin: false,
      permissions: {},
      permissionItems: [],
      businesses: [],
      usage: null,
      initialized: true,
      loading: false,
    });
  },
}));

window.addEventListener("stub:unauthorized", () => {
  if (!getStoredToken()) useAuthStore.getState().clearSession();
});
