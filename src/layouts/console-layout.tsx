import { App, Drawer } from "antd";
import {
  Briefcase,
  FileText,
  Flame,
  FolderOpen,
  KeyRound,
  LayoutGrid,
  Link2,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldAlert,
  Sun,
  Ticket,
  UserCircle,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { CreateLinkDrawer, type LinkQuickPreset } from "@/components/create-link-drawer";
import { formatMB } from "@/lib/format";
import { authApi } from "@/services/api";
import { useAuthStore } from "@/stores/auth-store";
import { useThemeStore } from "@/stores/theme-store";

const NAV_LABELS: Record<string, string> = {
  "/console": "概览",
  "/console/links": "短链",
  "/console/assets": "素材",
  "/console/templates": "规则模板",
  "/console/invites": "邀请码",
  "/console/api-keys": "API Key 凭证",
  "/console/logs": "日志",
  "/console/account": "账号与会话",
  "/console/admin/users": "用户管理",
  "/console/admin/businesses": "业务登记",
  "/console/admin/settings": "注册设置",
  "/console/admin/security": "未知短码安全事件",
};

export default function ConsoleLayout() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user, isAdmin, usage, initialized, hasPermission, refreshBootstrap, logout } =
    useAuthStore();
  const { dark, toggleTheme } = useThemeStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [createPreset, setCreatePreset] = useState<LinkQuickPreset | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickCode, setQuickCode] = useState("");

  const openCreateLink = (preset?: LinkQuickPreset) => {
    setCreatePreset(preset ?? null);
    setCreateOpen(true);
  };

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    if (!initialized) {
      refreshBootstrap();
    }
  }, [token, initialized, navigate, refreshBootstrap]);

  // 方案要求：客户端每 5 分钟发送一次会话心跳；不延长 7 天 Token 有效期
  useEffect(() => {
    if (!token) return;
    const timer = setInterval(() => {
      authApi.heartbeat().catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [token]);

  useEffect(() => {
    const onUnauthorized = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      message.warning(detail || "登录已失效，请重新登录");
      navigate("/login", { replace: true });
    };
    window.addEventListener("stub:unauthorized", onUnauthorized);
    return () => window.removeEventListener("stub:unauthorized", onUnauthorized);
  }, [message, navigate]);

  if (!token) return null;

  const storagePercent =
    usage && usage.storage.quotaBytes > 0
      ? Math.min(100, (usage.storage.usedBytes / usage.storage.quotaBytes) * 100)
      : 0;

  const currentCrumb = NAV_LABELS[location.pathname] || "控制台";

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCode.trim()) return;
    navigate(`/console/links?code=${encodeURIComponent(quickCode.trim())}`);
  };

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[236px_1fr]">
      {/* 侧栏 */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-[var(--line)] bg-[var(--paper-2)] px-3 py-4 md:flex">
        <Link to="/" className="flex items-center gap-2.5 px-2.5 pt-1 pb-4 font-display text-[25px] leading-none">
          <img src="/favicon.svg" alt="Stub" className="h-6 w-6 shrink-0" />
          <span>Stub</span>
        </Link>

        <div className="mb-3.5 flex items-center gap-2.5 rounded border border-[var(--line-2)] bg-[var(--paper-3)] p-2.5 text-[13px]">
          <b className="grid h-6 w-6 place-items-center rounded bg-[var(--ink)] text-xs text-[var(--paper)]">默</b>
          <div className="min-w-0 flex-1">
            <div className="font-medium">默认空间</div>
            <small className="block truncate font-mono text-[11px] text-[var(--ink-3)]">
              {user?.defaultWorkspaceId || "ws_…"}
            </small>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5 text-sm">
          <div className="px-2.5 pt-3 pb-1.5 font-mono text-[10px] tracking-widest text-[var(--ink-3)]">工作台</div>
          {[
            { to: "/console", label: "概览", icon: LayoutGrid, end: true },
            { to: "/console/links", label: "短链", icon: Link2 },
            { to: "/console/assets", label: "素材", icon: FolderOpen },
            { to: "/console/templates", label: "规则模板", icon: FileText },
            { to: "/console/invites", label: "邀请码", icon: Ticket },
            { to: "/console/api-keys", label: "API Key", icon: KeyRound },
            { to: "/console/logs", label: "日志", icon: FileText },
            { to: "/console/account", label: "账号与会话", icon: UserCircle },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded px-2.5 py-2 transition ${
                    isActive
                      ? "bg-[var(--ink)] text-[var(--paper)]"
                      : "text-[var(--ink-2)] hover:bg-black/5 hover:text-[var(--ink)]"
                  }`
                }
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          {isAdmin && (
            <>
              <div className="px-2.5 pt-4 pb-1.5 font-mono text-[10px] tracking-widest text-[var(--ink-3)]">
                管理员
              </div>
              {[
                { to: "/console/admin/users", label: "用户管理", icon: Users },
                { to: "/console/admin/businesses", label: "业务登记", icon: Briefcase },
                { to: "/console/admin/settings", label: "注册设置", icon: Settings },
                { to: "/console/admin/security", label: "安全事件", icon: ShieldAlert },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded px-2.5 py-2 transition ${
                        isActive
                          ? "bg-[var(--ink)] text-[var(--paper)]"
                          : "text-[var(--ink-2)] hover:bg-black/5 hover:text-[var(--ink)]"
                      }`
                    }
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </>
          )}
        </nav>

        <div className="mt-auto border-t border-[var(--line-2)] px-2.5 pt-3.5">
          {usage && (
            <div className="mb-3.5 text-xs text-[var(--ink-2)]">
              <div className="flex justify-between">
                <span>存储用量</span>
                <span className="font-mono text-[11px]">
                  {formatMB(usage.storage.usedBytes)} / {formatMB(usage.storage.quotaBytes, 0)}
                </span>
              </div>
              <div className="my-1.5 h-1 overflow-hidden rounded bg-[var(--line)]">
                <i className="block h-full bg-[var(--ink)]" style={{ width: `${storagePercent}%` }} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2.5 text-[13px]">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--signal)] text-xs font-bold text-white uppercase">
              {user?.email?.slice(0, 1) || "U"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{user?.email || "加载中…"}</div>
              <small className="block text-[11px] text-[var(--ink-3)]">
                {isAdmin ? "管理员" : "普通用户"}
              </small>
            </div>
            <button
              type="button"
              title="退出当前会话"
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
              className="cursor-pointer rounded p-1.5 text-[var(--ink-2)] hover:bg-black/5 hover:text-[var(--ink)]"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* 主内容 */}
      <main className="min-w-0">
        <header className="sticky top-0 z-20 flex h-15 items-center gap-3.5 border-b border-[var(--line)] bg-[var(--paper)]/90 px-6 backdrop-blur-md md:px-8">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="cursor-pointer rounded p-1.5 text-[var(--ink-2)] hover:bg-black/5 md:hidden"
            aria-label="打开导航菜单"
          >
            <Menu size={18} />
          </button>
          <div className="text-[13px] text-[var(--ink-3)]">
            默认空间 / <b className="font-semibold text-[var(--ink)]">{currentCrumb}</b>
          </div>

          <form onSubmit={handleQuickSearch} className="relative ml-auto hidden sm:block">
            <Search size={14} className=" absolute top-1/2 left-3 -translate-y-1/2 text-[var(--ink-3)]" />
            <input
              value={quickCode}
              onChange={(e) => setQuickCode(e.target.value)}
              placeholder="按短码精确查询，如 my-cat"
              className="h-8.5 w-64 rounded border border-transparent bg-black/5 pr-3 pl-8 font-mono text-xs outline-none focus:border-[var(--ink)] focus:bg-[var(--paper-3)]"
            />
          </form>

          <button
            type="button"
            onClick={toggleTheme}
            title={dark ? "切换为暖纸浅色" : "切换为夜墨深色"}
            className="cursor-pointer rounded p-2 text-[var(--ink-2)] hover:bg-black/5 hover:text-[var(--ink)] ml-auto sm:ml-0"
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {(hasPermission("links.create_url") || hasPermission("links.create_asset")) && (
            <>
              <button
                type="button"
                onClick={() => openCreateLink("burn")}
                className="stub-btn ghost !h-9 !px-3 text-xs hidden sm:inline-flex"
                title="一键配置：1 次访问 + 口令保护 + 24 小时过期"
              >
                <Flame size={14} className="text-[var(--signal)]" />
                阅后即焚
              </button>
              <button
                type="button"
                onClick={() => openCreateLink()}
                className="stub-btn signal !h-9 !px-3.5 text-xs"
              >
                <Plus size={15} />
                新建短链
              </button>
            </>
          )}
        </header>

        <div className="mx-auto max-w-[1360px] px-6 pt-7 pb-20 md:px-8">
          <Outlet context={{ openCreateLink }} />
        </div>
      </main>

      <Drawer
        title={
          <Link
            to="/"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-2 font-display text-2xl leading-none"
          >
            <img src="/favicon.svg" alt="Stub" className="h-6 w-6 shrink-0" />
            <span>Stub</span>
          </Link>
        }
        placement="left"
        width={256}
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      >
        <nav className="flex flex-col gap-1 text-sm">
          {[
            { to: "/console", label: "概览", icon: LayoutGrid, end: true },
            { to: "/console/links", label: "短链", icon: Link2 },
            { to: "/console/assets", label: "素材", icon: FolderOpen },
            { to: "/console/templates", label: "规则模板", icon: FileText },
            { to: "/console/invites", label: "邀请码", icon: Ticket },
            { to: "/console/api-keys", label: "API Key 凭证", icon: KeyRound },
            { to: "/console/logs", label: "日志", icon: FileText },
            { to: "/console/account", label: "账号与会话", icon: UserCircle },
            ...(isAdmin
              ? [
                  { to: "/console/admin/users", label: "管理员 · 用户管理", icon: Users },
                  { to: "/console/admin/businesses", label: "管理员 · 业务登记", icon: Briefcase },
                  { to: "/console/admin/settings", label: "管理员 · 注册设置", icon: Settings },
                  { to: "/console/admin/security", label: "管理员 · 安全事件", icon: ShieldAlert },
                ]
              : []),
          ].map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded px-3 py-2.5 transition ${
                    isActive
                      ? "bg-[var(--ink)] text-[var(--paper)]"
                      : "text-[var(--ink-2)] hover:bg-black/5 hover:text-[var(--ink)]"
                  }`
                }
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </Drawer>

      <CreateLinkDrawer
        open={createOpen}
        initialPreset={createPreset}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => {
          window.dispatchEvent(new CustomEvent("stub:link-created"));
        }}
      />
    </div>
  );
}
