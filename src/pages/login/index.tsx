import { App } from "antd";
import { Eye, EyeOff, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { authApi } from "@/services/api";
import { ApiError } from "@/services/api/client";
import { getDeviceInfo, useAuthStore } from "@/stores/auth-store";
import { useThemeStore } from "@/stores/theme-store";

type AuthMode = "login" | "register" | "done" | "reset" | "reset-ok";

const LIVE_LOG_SAMPLES = [
  ["my-cat", "text-[#8fd19e]", "302 跳转"],
  ["k7m2x9p4", "text-[#f2c86b]", "口令挑战"],
  ["brief-q4", "text-[#ff8a5c]", "已过期 410"],
  ["a8k29x7m", "text-[#ff8a5c]", "短码已轮换"],
  ["ref-png", "text-[#8fd19e]", "302 跳转"],
  ["demo-01", "text-[#ff8a5c]", "IP 不允许"],
  ["my-cat", "text-[#ff8a5c]", "次数已用尽"],
];

export default function LoginPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const setLoginResult = useAuthStore((s) => s.setLoginResult);
  const { dark, toggleTheme } = useThemeStore();

  const initialMode: AuthMode = location.pathname.includes("register")
    ? "register"
    : location.pathname.includes("reset")
      ? "reset"
      : "login";

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(
    searchParams.get("inviteCode") || searchParams.get("invite") || "",
  );
  const [verificationCode, setVerificationCode] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [logTick, setLogTick] = useState(0);

  useEffect(() => {
    const code = searchParams.get("inviteCode") || searchParams.get("invite");
    if (code) {
      setInviteCode(code);
      setMode("register");
    }
  }, [searchParams]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    const t = setInterval(() => setLogTick((x) => x + 1), 2400);
    return () => clearInterval(t);
  }, []);

  const handleSendCode = async (purpose: "register" | "password_reset") => {
    if (!email.trim()) {
      message.warning("请先输入邮箱地址");
      return;
    }
    try {
      const res = await authApi.requestEmailCode({
        email: email.trim(),
        purpose,
        inviteCode: purpose === "register" && inviteCode.trim() ? inviteCode.trim() : undefined,
      });
      const waitSec = Math.max(
        1,
        Math.ceil((new Date(res.resendAvailableAt).getTime() - Date.now()) / 1000) || 60,
      );
      setCooldown(waitSec);
      message.success("若邮箱可用，验证码已发送（10 分钟内有效）");
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "发送验证码失败");
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    try {
      const res = await authApi.login({
        email: email.trim(),
        password,
        ...getDeviceInfo(),
      });
      await setLoginResult(res.accessToken, res.user);
      message.success("登录成功");
      navigate("/console", { replace: true });
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "登录失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || !verificationCode.trim()) return;
    setSubmitting(true);
    try {
      await authApi.register({
        email: email.trim(),
        password,
        verificationCode: verificationCode.trim(),
        inviteCode: inviteCode.trim() || undefined,
      });
      setVerificationCode("");
      setMode("done");
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "注册失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password || !verificationCode.trim()) return;
    setSubmitting(true);
    try {
      await authApi.resetPassword({
        email: email.trim(),
        verificationCode: verificationCode.trim(),
        newPassword: password,
      });
      setPassword("");
      setVerificationCode("");
      setMode("reset-ok");
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "重置密码失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_560px]">
      {/* 左侧品牌与实时访问流 */}
      <aside className="relative hidden flex-col overflow-hidden bg-[#17150f] px-14 py-10 text-[#f2eee4] lg:flex">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(#2a2720 1px, transparent 1px), linear-gradient(90deg, #2a2720 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "linear-gradient(180deg, transparent, #000 30%, #000 70%, transparent)",
          }}
        />
        <Link to="/" className="relative flex items-center gap-2.5 font-display text-[28px] leading-none">
          <svg width="28" height="28" viewBox="0 0 64 64" fill="none" className="shrink-0">
            <path
              d="M12 6H52C55.3137 6 58 8.68629 58 12V25C54.134 25 51 28.134 51 32C51 35.866 54.134 39 58 39V52C58 55.3137 55.3137 58 52 58H12C8.68629 58 6 55.3137 6 52V39C9.86599 39 13 35.866 13 32C13 28.134 9.86599 25 6 25V12C6 8.68629 8.68629 6 12 6Z"
              fill="#FBF9F4"
            />
            <path
              d="M29.5 22.5C29.5 20.5 27.8 19 25 19C22.2 19 20.5 20.4 20.5 22.3C20.5 24.4 22.5 25.2 25.6 26.1C29.8 27.3 32.5 29.1 32.5 33.2C32.5 37.3 29.2 40 24.6 40C19.8 40 17 37.4 17 33.8H21.2C21.2 35.6 22.6 36.6 24.8 36.6C27.1 36.6 28.4 35.4 28.4 33.6C28.4 31.6 26.7 30.8 23.5 29.8C19.6 28.6 16.8 26.9 16.8 22.6C16.8 18.6 20.1 15.8 24.9 15.8C29.6 15.8 32.8 18.3 33 22.5H29.5Z"
              fill="#17150F"
            />
            <path d="M43.5 16L34.5 48H39L48 16H43.5Z" fill="#FF4D1A" />
          </svg>
          <span>Stub</span>
          <small className="ml-1 font-sans text-xs tracking-widest text-[#8a8475]">短链控制台</small>
        </Link>

        <div className="relative mt-auto">
          <h1 className="font-cn-display text-[60px] leading-[1.08] font-black tracking-tight">
            此刻，
            <br />
            有人正在打开
            <br />
            你的<i className="font-display font-normal text-[var(--signal)]">链接</i>。
          </h1>
          <p className="mt-5 max-w-[440px] text-[15px] text-[#a8a191]">
            每一次访问都经过规则校验，并完整记录来源、结果与原因。登录后在控制台管理短链、素材、模板与会话。
          </p>

          <div className="relative mt-11 h-[196px] overflow-hidden border-t border-[#3a362d] font-mono text-xs">
            {Array.from({ length: 5 }).map((_, i) => {
              const sample = LIVE_LOG_SAMPLES[(logTick + i) % LIVE_LOG_SAMPLES.length];
              return (
                <div
                  key={`${logTick}-${i}`}
                  className="grid grid-cols-[72px_92px_1fr_auto] gap-3.5 border-b border-[#2a2720] py-2.5 text-[#b9b2a1]"
                >
                  <span className="text-[#6e6858]">{new Date().toTimeString().slice(0, 8)}</span>
                  <span>/r/{sample[0]}</span>
                  <span className="text-[#6e6858]">203.0.113.{(logTick * 17 + i * 31) % 254}</span>
                  <span className={sample[1]}>{sample[2]}</span>
                </div>
              );
            })}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-b from-transparent to-[#17150f]" />
          </div>
        </div>

        <div className="relative mt-8 flex justify-between text-xs text-[#6e6858]">
          <span>独立账号体系 · Bearer Token 认证</span>
          <span className="font-mono">X-Client-App: shortlink_web</span>
        </div>
      </aside>

      {/* 右侧表单区 */}
      <main className="flex flex-col bg-[var(--paper)] px-8 py-10 md:px-16">
        <div className="flex items-center justify-between text-[13px] text-[var(--ink-3)]">
          <Link to="/" className="hover:text-[var(--ink)]">
            ← 返回产品页
          </Link>
          <div className="flex items-center gap-3">
            <span>使用短链服务账号登录</span>
            <button
              type="button"
              onClick={toggleTheme}
              title={dark ? "切换为暖纸浅色" : "切换为夜墨深色"}
              className="cursor-pointer rounded p-1.5 text-[var(--ink-2)] hover:bg-black/5 hover:text-[var(--ink)]"
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </div>

        <div className="my-auto py-10">
          {mode === "login" && (
            <section className="animate-rise">
              <div className="font-mono text-xs tracking-widest text-[var(--signal-ink)]">SIGN IN</div>
              <h2 className="font-cn-display mt-2 mb-1.5 text-[38px] font-black tracking-tight">登录控制台</h2>
              <p className="mb-7 text-[var(--ink-2)]">
                还没有账号？{" "}
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className="cursor-pointer border-b border-current text-[var(--signal-ink)]"
                >
                  创建账号 / 使用邀请码注册
                </button>
              </p>

              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--ink-2)]">邮箱</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 outline-none focus:border-[var(--ink)]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--ink-2)]">密码</label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="输入登录密码"
                      className="h-10 w-full rounded border border-[var(--line-2)] bg-[var(--paper-3)] pr-10 pl-3 outline-none focus:border-[var(--ink)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-[var(--ink-3)]"
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-[var(--ink-3)]">
                  <span>登录后最长 7 天有效，到期需重新登录</span>
                  <button
                    type="button"
                    onClick={() => setMode("reset")}
                    className="cursor-pointer text-[var(--ink-2)] hover:text-[var(--signal-ink)]"
                  >
                    忘记密码？
                  </button>
                </div>

                <button type="submit" disabled={submitting} className="stub-btn mt-1 !h-11 w-full !text-[15px]">
                  {submitting ? "正在登录…" : "登录"}
                </button>
              </form>

              <div className="mt-7 flex flex-wrap gap-4 border-t border-dashed border-[var(--line-2)] pt-4 text-xs text-[var(--ink-3)]">
                <span>— 支持多台设备同时在线</span>
                <span>— 可在「账号与会话」中随时撤销任一设备</span>
              </div>
            </section>
          )}

          {mode === "register" && (
            <section className="animate-rise">
              <div className="font-mono text-xs tracking-widest text-[var(--signal-ink)]">CREATE ACCOUNT</div>
              <h2 className="font-cn-display mt-2 mb-1.5 text-[38px] font-black tracking-tight">创建账号</h2>
              <p className="mb-6 text-[var(--ink-2)]">
                已有账号？{" "}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="cursor-pointer border-b border-current text-[var(--signal-ink)]"
                >
                  直接登录
                </button>
              </p>

              <form onSubmit={handleRegister} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="flex justify-between text-xs font-medium text-[var(--ink-2)]">
                    <span>邀请码</span>
                    <span className="font-normal text-[var(--ink-3)]">若未开放公开注册则必填</span>
                  </label>
                  <input
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="粘贴邀请码明文（或通过邀请链接自动带入）"
                    className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none focus:border-[var(--ink)]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--ink-2)]">邮箱</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 outline-none focus:border-[var(--ink)]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="flex justify-between text-xs font-medium text-[var(--ink-2)]">
                    <span>邮箱验证码</span>
                    <span className="font-normal text-[var(--ink-3)]">10 分钟内有效 · 一次有效</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      required
                      maxLength={6}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder="6 位数字验证码"
                      className="h-10 flex-1 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono tracking-[0.25em] outline-none focus:border-[var(--ink)]"
                    />
                    <button
                      type="button"
                      disabled={cooldown > 0}
                      onClick={() => handleSendCode("register")}
                      className="stub-btn ghost !h-10 min-w-[116px] text-xs"
                    >
                      {cooldown > 0 ? `${cooldown}s 后重发` : "发送验证码"}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--ink-2)]">设置登录密码</label>
                  <div className="relative">
                    <input
                      type={showPw ? "text" : "password"}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="设置密码"
                      className="h-10 w-full rounded border border-[var(--line-2)] bg-[var(--paper-3)] pr-10 pl-3 outline-none focus:border-[var(--ink)]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-[var(--ink-3)]"
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={submitting} className="stub-btn signal mt-1 !h-11 w-full !text-[15px]">
                  {submitting ? "正在创建账号…" : "验证并创建账号"}
                </button>
                <p className="text-xs text-[var(--ink-3)]">
                  出于防账号枚举保护，验证码请求返回统一结果，不会提示邮箱是否已注册。
                </p>
              </form>
            </section>
          )}

          {mode === "done" && (
            <section className="animate-rise">
              <div className="font-mono text-xs tracking-widest text-[var(--signal-ink)]">ACCOUNT CREATED</div>
              <h2 className="font-cn-display mt-2 mb-2 text-[36px] font-black tracking-tight">账号已创建</h2>
              <p className="mb-5 text-[var(--ink-2)]">已为你自动初始化默认工作空间，请使用刚注册的邮箱和密码登录。</p>
              <div className="mb-6 rounded border border-[var(--line-2)] border-l-[3px] border-l-[var(--ok)] bg-[var(--paper-3)] p-3.5 text-[13px] text-[var(--ink-2)]">
                新注册的普通用户<b>默认没有业务系统授权</b>。上传 MinIO 素材等需要指定业务的操作，需由管理员授权业务后使用。
              </div>
              <button type="button" onClick={() => setMode("login")} className="stub-btn !h-11 w-full">
                去登录
              </button>
            </section>
          )}

          {mode === "reset" && (
            <section className="animate-rise">
              <div className="font-mono text-xs tracking-widest text-[var(--signal-ink)]">RESET PASSWORD</div>
              <h2 className="font-cn-display mt-2 mb-1.5 text-[38px] font-black tracking-tight">找回密码</h2>
              <p className="mb-6 text-[var(--ink-2)]">
                想起来了？{" "}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="cursor-pointer border-b border-current text-[var(--signal-ink)]"
                >
                  返回登录
                </button>
              </p>

              <form onSubmit={handleResetPassword} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--ink-2)]">账号邮箱</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 outline-none focus:border-[var(--ink)]"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="flex justify-between text-xs font-medium text-[var(--ink-2)]">
                    <span>邮箱验证码</span>
                    <span className="font-normal text-[var(--ink-3)]">每邮箱每小时最多 5 封</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      required
                      maxLength={6}
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      placeholder="6 位数字验证码"
                      className="h-10 flex-1 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono tracking-[0.25em] outline-none focus:border-[var(--ink)]"
                    />
                    <button
                      type="button"
                      disabled={cooldown > 0}
                      onClick={() => handleSendCode("password_reset")}
                      className="stub-btn ghost !h-10 min-w-[116px] text-xs"
                    >
                      {cooldown > 0 ? `${cooldown}s 后重发` : "发送验证码"}
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-[var(--ink-2)]">新密码</label>
                  <input
                    type={showPw ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="设置新密码"
                    className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 outline-none focus:border-[var(--ink)]"
                  />
                </div>

                <button type="submit" disabled={submitting} className="stub-btn mt-1 !h-11 w-full !text-[15px]">
                  {submitting ? "正在重置…" : "重置密码"}
                </button>
                <div className="rounded border border-[var(--line-2)] border-l-[3px] border-l-[var(--ink)] bg-[var(--paper-3)] p-3 text-xs text-[var(--ink-2)]">
                  密码更新成功后，该账号在<b>所有设备上的已登录会话都会立即失效</b>，需使用新密码重新登录。
                </div>
              </form>
            </section>
          )}

          {mode === "reset-ok" && (
            <section className="animate-rise">
              <div className="font-mono text-xs tracking-widest text-[var(--signal-ink)]">DONE</div>
              <h2 className="font-cn-display mt-2 mb-2 text-[36px] font-black tracking-tight">密码已更新</h2>
              <p className="mb-6 text-[var(--ink-2)]">全部旧设备会话已撤销，请使用新密码重新登录。</p>
              <button type="button" onClick={() => setMode("login")} className="stub-btn !h-11 w-full">
                去登录
              </button>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
