import { Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { getPublicBaseURL } from "@/lib/format";
import { useAuthStore } from "@/stores/auth-store";
import { useThemeStore } from "@/stores/theme-store";

const MARQUEE_ITEMS = [
  "HTTPS URL 目标",
  "MinIO 托管素材",
  "稳定 LinkId",
  "短码轮换 · 旧码立即失效",
  "规则模板 · 版本不可变",
  "口令错误冷却",
  "访问日志长期保留",
  "多端独立会话",
  "业务授权隔离",
];

export default function LandingPage() {
  const token = useAuthStore((s) => s.token);
  const { dark, toggleTheme } = useThemeStore();
  const [codeTab, setCodeTab] = useState<"http" | "go">("http");
  const baseHost = getPublicBaseURL().replace(/^https?:\/\//, "");

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--paper)] text-[var(--ink)]">
      {/* 顶栏 */}
      <nav className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--paper)]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-10 px-6 md:px-10">
          <Link to="/" className="flex items-center gap-2.5 font-display text-[28px] leading-none">
            <img src="/favicon.svg" alt="Stub" className="h-7 w-7 shrink-0" />
            <span>Stub</span>
            <small className="ml-0.5 font-sans text-xs tracking-widest text-[var(--ink-3)]">短链</small>
          </Link>
          <ul className="hidden gap-7 text-sm text-[var(--ink-2)] md:flex">
            <li>
              <a href="#rules" className="hover:text-[var(--signal-ink)]">
                访问规则
              </a>
            </li>
            <li>
              <a href="#flow" className="hover:text-[var(--signal-ink)]">
                访问流程
              </a>
            </li>
            <li>
              <a href="#caps" className="hover:text-[var(--signal-ink)]">
                管理能力
              </a>
            </li>
            <li>
              <a href="#api" className="hover:text-[var(--signal-ink)]">
                开放接口
              </a>
            </li>
          </ul>
          <div className="ml-auto flex items-center gap-2.5">
            <button
              type="button"
              onClick={toggleTheme}
              title={dark ? "切换为暖纸浅色" : "切换为夜墨深色"}
              className="stub-btn ghost !w-9.5 !px-0"
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            {token ? (
              <Link to="/console" className="stub-btn signal">
                进入控制台 →
              </Link>
            ) : (
              <>
                <Link to="/register" className="stub-btn ghost">
                  邀请码注册
                </Link>
                <Link to="/login" className="stub-btn">
                  登录控制台
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative overflow-hidden border-b border-[var(--line)] py-16 md:py-24">
        <div
          className="pointer-events-none absolute inset-0 opacity-45"
          style={{
            backgroundImage:
              "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage: "radial-gradient(ellipse at 75% 45%, #000 0%, transparent 62%)",
          }}
        />
        <div className="relative mx-auto grid max-w-[1240px] items-center gap-14 px-6 md:px-10 lg:grid-cols-[1.08fr_0.92fr]">
          <div>
            <div className="animate-rise inline-flex items-center gap-2.5 font-mono text-xs tracking-widest text-[var(--ink-2)] uppercase">
              <b className="h-2 w-2 rounded-full bg-[var(--signal)] shadow-[0_0_0_4px_var(--signal-soft)]" />
              通用短链接服务 · 多产品接入
            </div>
            <h1 className="animate-rise font-cn-display my-6 text-5xl leading-[1.05] font-black tracking-tight md:text-[72px]">
              <span className="font-display mb-1.5 block text-4xl font-normal text-[var(--ink-2)] italic md:text-[52px]">
                One link, its own rules.
              </span>
              每一条链接，
              <br />
              都有
              <span className="relative text-[var(--signal)]">
                自己的规则
                <span className="absolute right-[-2%] bottom-[0.08em] left-[-2%] h-[0.14em] bg-[var(--signal)]/20" />
              </span>
              。
            </h1>
            <p className="animate-rise max-w-[520px] text-[17px] leading-[1.8] text-[var(--ink-2)]">
              为 HTTPS 网址和 MinIO 托管素材生成短链。有效期、访问次数、IP 范围、访问口令逐条设定，访问通过校验后才 302
              跳转；每一次尝试都留下真实记录。
            </p>
            <div className="animate-rise mt-8 flex flex-wrap items-center gap-3">
              <Link to={token ? "/console" : "/login"} className="stub-btn signal !h-12 !px-6 !text-[15px]">
                {token ? "进入控制台 →" : "登录控制台 →"}
              </Link>
              <a href="#api" className="stub-btn ghost !h-12 !px-6 !text-[15px]">
                查看 API
              </a>
              <span className="ml-1.5 text-xs leading-normal text-[var(--ink-3)]">
                独立邮箱账号体系
                <br />
                注册需邀请码或管理员开放
              </span>
            </div>
          </div>

          {/* 票根舞台 */}
          <div className="relative hidden h-[500px] lg:block">
            <div className="absolute top-0 right-[110px] w-[390px] -rotate-6 rounded-md border border-[var(--line-2)] bg-[var(--paper-2)] opacity-90 shadow-[6px_6px_0_var(--line-2)]">
              <div className="flex items-center justify-between border-b border-dashed border-[var(--line-2)] px-4 py-3 font-mono text-[11px] tracking-wider text-[var(--ink-3)]">
                <span>LINK · link_01HZ…Q8</span>
                <span>MINIO ASSET</span>
              </div>
              <div className="px-4 pt-5 pb-1 font-mono text-[13px] text-[var(--ink-3)]">{baseHost}/r/</div>
              <div className="font-display px-4 pb-5 text-[54px] leading-none">k7m2x9p4</div>
            </div>

            <div className="absolute top-10 right-5 z-10 w-[400px] rotate-[2.5deg] rounded-md border border-[var(--ink)] bg-[var(--paper-3)] shadow-[10px_10px_0_var(--ink)]">
              <div className="flex items-center justify-between border-b border-dashed border-[var(--line-2)] px-4 py-3.5 font-mono text-[11px] tracking-wider text-[var(--ink-3)]">
                <span>LINK · link_01J0…3F</span>
                <span>HTTPS URL</span>
              </div>
              <div className="px-4 pt-5 pb-1 font-mono text-[13px] text-[var(--ink-3)]">{baseHost}/r/</div>
              <div className="font-display px-4 pb-4 text-[56px] leading-none">
                my-cat<span className="text-[34px] text-[var(--ink-3)]">.</span>
              </div>
              <dl className="grid grid-cols-2 border-t border-[var(--line)]">
                <div className="border-r border-b border-[var(--line)] px-4 py-3">
                  <dt className="text-[11px] text-[var(--ink-3)]">有效期至</dt>
                  <dd className="mt-0.5 text-sm font-medium">2026-12-31 23:59</dd>
                </div>
                <div className="border-b border-[var(--line)] px-4 py-3">
                  <dt className="text-[11px] text-[var(--ink-3)]">访问口令</dt>
                  <dd className="mt-0.5 text-sm font-medium">已启用 · 固定冷却</dd>
                </div>
                <div className="border-r border-b border-[var(--line)] px-4 py-3">
                  <dt className="text-[11px] text-[var(--ink-3)]">IP 范围</dt>
                  <dd className="mt-0.5 font-mono text-xs font-medium">10.0.0.0/8</dd>
                </div>
                <div className="border-b border-[var(--line)] px-4 py-3">
                  <dt className="text-[11px] text-[var(--ink-3)]">规则来源</dt>
                  <dd className="mt-0.5 text-sm font-medium">模板「临时分享」v3</dd>
                </div>
              </dl>
              <div className="px-4 pt-3.5 pb-4">
                <div className="mb-2 flex justify-between text-[11px] text-[var(--ink-3)]">
                  <span>访问计次</span>
                  <span className="font-mono">12 / 50</span>
                </div>
                <div className="grid grid-cols-[repeat(25,minmax(0,1fr))] gap-1">
                  {Array.from({ length: 50 }).map((_, idx) => (
                    <i
                      key={idx}
                      className={`aspect-square rounded-full border ${
                        idx < 12 ? "border-[var(--ink)] bg-[var(--ink)]" : "border-[var(--line-2)]"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className=" absolute top-[290px] right-2 z-20 grid h-32 w-32 -rotate-12 place-items-center rounded-full border-[3px] border-[var(--signal)] bg-[var(--paper-3)]/70 text-center font-mono text-xs font-semibold tracking-widest text-[var(--signal)]">
              <div>
                <b className="font-display block text-4xl leading-none font-normal">302</b>
                VERIFIED
              </div>
            </div>

            <div className="absolute bottom-6 left-0 z-20 flex items-center gap-2.5 rounded bg-[var(--ink)] px-3.5 py-2.5 font-mono text-xs text-[var(--paper)]">
              GET /r/my-cat → 规则校验 <em className="font-semibold text-[var(--signal)] not-italic">✓</em> → Location
            </div>
          </div>
        </div>
      </header>

      {/* 跑马灯 */}
      <div className="overflow-hidden border-b border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
        <div className="animate-marquee flex w-max gap-12 py-4 font-mono text-[13px] tracking-wider whitespace-nowrap">
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, idx) => (
            <span key={idx}>
              <b className="mr-12 text-[var(--signal)]">✶</b>
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* 01 访问规则 */}
      <section id="rules" className="border-b border-[var(--line)] py-24">
        <div className="mx-auto max-w-[1240px] px-6 md:px-10">
          <div className="mb-14 grid gap-8 md:grid-cols-[200px_1fr]">
            <div className="border-t-2 border-[var(--ink)] pt-3.5 font-mono text-xs tracking-widest text-[var(--ink-3)]">
              01 / 访问规则
            </div>
            <div>
              <h2 className="font-cn-display text-4xl leading-[1.15] font-black tracking-tight md:text-[46px]">
                规则属于<i className="font-display font-normal text-[var(--signal)]">链接</i>，
                <br />
                不属于素材。
              </h2>
              <p className="mt-4 max-w-[620px] text-base text-[var(--ink-2)]">
                同一个素材（A_Id）可以关联多条短链，每条短链独立拥有短码、有效期、访问限制和启用状态。分享给不同的人，就用不同的规则。
              </p>
            </div>
          </div>

          <div className="grid border border-[var(--ink)] bg-[var(--paper-3)] md:grid-cols-12">
            <div className="relative min-h-[220px] border-b border-[var(--line)] p-7 md:col-span-5 md:border-r">
              <span className="font-mono text-[11px] tracking-widest text-[var(--ink-3)]">RULE · 01</span>
              <span className="absolute top-6 right-6 font-mono text-xs">expiresAt</span>
              <h3 className="font-cn-display mt-8 mb-2.5 text-[22px] font-bold">有效期</h3>
              <p className="text-sm text-[var(--ink-2)]">
                到期即不可访问；需要延长时续期同一条记录，可保留原短码，也可同时重新生成短码。
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5 font-mono text-[11px] text-[var(--ink-2)]">
                <code className="rounded border border-[var(--line-2)] bg-[var(--paper)] px-2 py-0.5">保留短码续期</code>
                <code className="rounded border border-[var(--line-2)] bg-[var(--paper)] px-2 py-0.5">换码续期</code>
                <code className="rounded border border-[var(--line-2)] bg-[var(--paper)] px-2 py-0.5">不过期</code>
              </div>
            </div>

            <div className="relative min-h-[220px] border-b border-[var(--line)] p-7 md:col-span-4 md:border-r">
              <span className="font-mono text-[11px] tracking-widest text-[var(--ink-3)]">RULE · 02</span>
              <span className="absolute top-6 right-6 font-mono text-xs">maxVisits</span>
              <h3 className="font-cn-display mt-8 mb-2.5 text-[22px] font-bold">访问次数</h3>
              <p className="text-sm text-[var(--ink-2)]">
                每一次已知短码的访问尝试都计次，包括被拒绝的请求。次数用尽后可单独重置为 0。
              </p>
            </div>

            <div className="relative min-h-[220px] border-b border-[var(--line)] p-7 md:col-span-3">
              <span className="font-mono text-[11px] tracking-widest text-[var(--ink-3)]">RULE · 03</span>
              <span className="absolute top-6 right-6 font-mono text-xs">CIDR</span>
              <h3 className="font-cn-display mt-8 mb-2.5 text-[22px] font-bold">IP 范围</h3>
              <p className="text-sm text-[var(--ink-2)]">只允许指定网段访问，适合内网或固定办公出口。</p>
            </div>

            <div className="relative min-h-[220px] border-b border-[var(--line)] p-7 md:col-span-3 md:border-r md:border-b-0">
              <span className="font-mono text-[11px] tracking-widest text-[var(--ink-3)]">RULE · 04</span>
              <span className="absolute top-6 right-6 font-mono text-xs">on / off</span>
              <h3 className="font-cn-display mt-8 mb-2.5 text-[22px] font-bold">启停</h3>
              <p className="text-sm text-[var(--ink-2)]">随时停用一条短链，重新启用后原短码继续有效。</p>
            </div>

            <div className="relative min-h-[220px] border-b border-[var(--line)] p-7 md:col-span-4 md:border-r md:border-b-0">
              <span className="font-mono text-[11px] tracking-widest text-[var(--ink-3)]">RULE · 05</span>
              <span className="absolute top-6 right-6 font-mono text-xs">password</span>
              <h3 className="font-cn-display mt-8 mb-2.5 text-[22px] font-bold">访问口令</h3>
              <p className="text-sm text-[var(--ink-2)]">
                访问者先输入口令；口令只属于这一条短链，不在模板中保存，显示口令页与输错都不消耗访问次数。
              </p>
            </div>

            <div className="relative min-h-[220px] bg-[var(--ink)] p-7 text-[var(--paper)] md:col-span-5">
              <span className="font-mono text-[11px] tracking-widest text-[#8a8475]">RULE · 06</span>
              <h3 className="font-cn-display mt-8 mb-2.5 text-[22px] font-bold">口令错误冷却</h3>
              <p className="text-sm text-[#b9b2a1]">
                按「短链 + 来源 IP」独立计数，15 分钟内连续输错 5 次进入冷却。不会因为他人恶意输错而让整条链接失效。
              </p>
              <div className="mt-4 flex flex-wrap gap-1.5 font-mono text-[11px] text-[#d9d3c4]">
                <code className="rounded border border-[#4a463c] px-2 py-0.5">固定冷却 15m</code>
                <code className="rounded border border-[#4a463c] px-2 py-0.5">逐步冷却 15m → 1h → 6h → 24h</code>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 02 访问流程 */}
      <section id="flow" className="border-b border-[var(--line)] py-24">
        <div className="mx-auto max-w-[1240px] px-6 md:px-10">
          <div className="mb-14 grid gap-8 md:grid-cols-[200px_1fr]">
            <div className="border-t-2 border-[var(--ink)] pt-3.5 font-mono text-xs tracking-widest text-[var(--ink-3)]">
              02 / 访问流程
            </div>
            <div>
              <h2 className="font-cn-display text-4xl leading-[1.15] font-black tracking-tight md:text-[46px]">
                校验在前，<i className="font-display font-normal text-[var(--signal)]">跳转</i>在后。
              </h2>
              <p className="mt-4 max-w-[620px] text-base text-[var(--ink-2)]">
                访问者无需注册或登录。任何一步未通过，都会返回清晰的 HTML 原因页面，不泄露内部存储路径与签名参数。
              </p>
            </div>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-6">
            {[
              { dot: "GET", title: "打开短链", desc: "匿名访问 /r/{code}", fail: "未知短码 → 404" },
              { dot: "ON", title: "启用状态", desc: "检查停用或短码已轮换", fail: "不可用 → 410" },
              { dot: "EXP", title: "有效期", desc: "检查是否已过到期时间", fail: "已过期 → 410" },
              { dot: "N/M", title: "次数 · IP", desc: "判断计次阈值与来源网段", fail: "拒绝 → 403" },
              { dot: "***", title: "访问口令", desc: "需要时展示口令挑战页", fail: "冷却中 → 等待" },
              { dot: "302", title: "跳转目标", desc: "HTTPS URL 或素材临时地址", fail: "", active: true },
            ].map((s, idx) => (
              <div key={idx} className="rounded border border-[var(--line-2)] bg-[var(--paper-3)] p-5">
                <div
                  className={`grid h-14 w-14 place-items-center rounded-full border font-mono text-xs font-semibold ${
                    s.active
                      ? "border-[var(--signal)] bg-[var(--signal)] text-white"
                      : "border-[var(--ink)] bg-[var(--paper)]"
                  }`}
                >
                  {s.dot}
                </div>
                <h4 className="mt-4 mb-1 text-base font-bold">{s.title}</h4>
                <p className="text-[13px] text-[var(--ink-2)]">{s.desc}</p>
                {s.fail && <div className="mt-2.5 font-mono text-[11px] text-[var(--danger)]">{s.fail}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 03 管理能力 */}
      <section id="caps" className="border-b border-[var(--line)] py-24">
        <div className="mx-auto max-w-[1240px] px-6 md:px-10">
          <div className="mb-14 grid gap-8 md:grid-cols-[200px_1fr]">
            <div className="border-t-2 border-[var(--ink)] pt-3.5 font-mono text-xs tracking-widest text-[var(--ink-3)]">
              03 / 管理能力
            </div>
            <div>
              <h2 className="font-cn-display text-4xl leading-[1.15] font-black tracking-tight md:text-[46px]">
                一个控制台，
                <br />
                管住<i className="font-display font-normal text-[var(--signal)]">所有</i>分享出去的链接。
              </h2>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <div className="border border-[var(--ink)] bg-[var(--paper-3)] p-8">
              <h3 className="font-cn-display text-2xl font-bold">稳定的 LinkId，可变的短码</h3>
              <p className="mt-2.5 text-[var(--ink-2)]">
                通过 LinkId 管理短链；短码泄露时一键轮换，旧短码立即失效且永不复用。每次变更都记录审计日志。
              </p>
              <div className="mt-7 divide-y divide-[var(--line)] border-t border-[var(--line)] text-[13px]">
                <div className="grid grid-cols-[110px_1fr_auto] items-center gap-4 py-3.5">
                  <span className="font-mono text-xs text-[var(--ink-3)]">10-22 10:00</span>
                  <span>
                    创建短链 <b className="font-mono">a8k29x7m</b>
                  </span>
                  <span className="stub-tag ok">当前</span>
                </div>
                <div className="grid grid-cols-[110px_1fr_auto] items-center gap-4 py-3.5">
                  <span className="font-mono text-xs text-[var(--ink-3)]">10-23 08:12</span>
                  <span>续期至 2027-01-31 · 保留短码</span>
                  <span className="stub-tag plain">续期</span>
                </div>
                <div className="grid grid-cols-[110px_1fr_auto] items-center gap-4 py-3.5">
                  <span className="font-mono text-xs text-[var(--ink-3)]">10-23 21:40</span>
                  <span>
                    轮换短码 <s className="font-mono text-[var(--ink-3)]">a8k29x7m</s> →{" "}
                    <b className="font-mono">k7m2x9p4</b>
                  </span>
                  <span className="stub-tag signal">旧码失效</span>
                </div>
                <div className="grid grid-cols-[110px_1fr_auto] items-center gap-4 py-3.5">
                  <span className="font-mono text-xs text-[var(--ink-3)]">10-24 09:03</span>
                  <span>重置访问次数 38 → 0</span>
                  <span className="stub-tag plain">计次</span>
                </div>
              </div>
            </div>

            <div className="grid gap-6">
              <div className="border border-[var(--line-2)] bg-[var(--paper-3)] p-7">
                <h3 className="font-cn-display text-xl font-bold">规则模板，版本只增不改</h3>
                <p className="mt-2 text-[var(--ink-2)]">
                  把常用规则存成模板。修改即生成新版本，已创建的短链固定保留创建时的规则快照。
                </p>
              </div>
              <div className="border border-[var(--line-2)] bg-[var(--paper-3)] p-7">
                <h3 className="font-cn-display text-xl font-bold">素材托管与 7 天回收站</h3>
                <p className="mt-2 text-[var(--ink-2)]">
                  上传文件到已授权业务桶后获得稳定素材 ID，可为同一素材创建多条短链且不重复扣减容量。
                </p>
              </div>
              <div className="border border-[var(--line-2)] bg-[var(--paper-3)] p-7">
                <h3 className="font-cn-display text-xl font-bold">精细权限与多端会话</h3>
                <p className="mt-2 text-[var(--ink-2)]">
                  13 项功能权限、业务桶授权与四项额度独立控制；每次登录建立最长 7 天的独立会话，可随时单点撤销。
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 04 开放接口 */}
      <section id="api" className="border-b border-[var(--line)] py-24">
        <div className="mx-auto grid max-w-[1240px] items-start gap-12 px-6 md:px-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <div className="w-[200px] border-t-2 border-[var(--ink)] pt-3.5 font-mono text-xs tracking-widest text-[var(--ink-3)]">
              04 / 开放接口
            </div>
            <h2 className="font-cn-display mt-4 text-4xl leading-[1.15] font-black tracking-tight md:text-[44px]">
              版本化 API，
              <br />
              <i className="font-display font-normal text-[var(--signal)]">任何</i>产品都能接入。
            </h2>
            <p className="mt-4 text-[var(--ink-2)]">
              画布、网页与移动 App 均使用当前登录用户的 Bearer Token 调用接口，服务端从 Token
              确定工作空间、功能权限与业务授权。
            </p>
            <ul className="mt-7 divide-y divide-[var(--line)] border-t border-[var(--line)] text-sm">
              <li className="flex gap-4 py-3.5">
                <span className="h-fit min-w-[52px] rounded bg-[var(--signal)] px-2 py-0.5 text-center font-mono text-[11px] text-white">
                  POST
                </span>
                <div>
                  <code className="font-mono text-[13px]">/api/v1/links</code>
                  <p className="text-xs text-[var(--ink-3)]">创建 URL 或素材短链，规则可内联或引用模板</p>
                </div>
              </li>
              <li className="flex gap-4 py-3.5">
                <span className="h-fit min-w-[52px] rounded bg-[var(--signal)] px-2 py-0.5 text-center font-mono text-[11px] text-white">
                  POST
                </span>
                <div>
                  <code className="font-mono text-[13px]">/api/v1/links/{"{linkId}"}/renew</code>
                  <p className="text-xs text-[var(--ink-3)]">续期短链，可选择保留或重新生成短码</p>
                </div>
              </li>
              <li className="flex gap-4 py-3.5">
                <span className="h-fit min-w-[52px] rounded bg-[var(--signal)] px-2 py-0.5 text-center font-mono text-[11px] text-white">
                  POST
                </span>
                <div>
                  <code className="font-mono text-[13px]">/api/v1/assets</code>
                  <p className="text-xs text-[var(--ink-3)]">上传素材到已获准的业务桶</p>
                </div>
              </li>
              <li className="flex gap-4 py-3.5">
                <span className="h-fit min-w-[52px] rounded bg-[var(--ink)] px-2 py-0.5 text-center font-mono text-[11px] text-[var(--paper)]">
                  GET
                </span>
                <div>
                  <code className="font-mono text-[13px]">/api/v1/analytics/summary</code>
                  <p className="text-xs text-[var(--ink-3)]">按 24h / 7d / 30d 查询访问统计汇总</p>
                </div>
              </li>
            </ul>
          </div>

          <div className="overflow-hidden rounded-md bg-[var(--ink)] text-[#e9e3d4] shadow-[10px_10px_0_var(--signal)]">
            <div className="flex border-b border-[#2f2b22]">
              <button
                type="button"
                onClick={() => setCodeTab("http")}
                className={`cursor-pointer px-4 py-3 font-mono text-xs ${
                  codeTab === "http" ? "text-white shadow-[inset_0_-2px_0_var(--signal)]" : "text-[#8a8475]"
                }`}
              >
                HTTP
              </button>
              <button
                type="button"
                onClick={() => setCodeTab("go")}
                className={`cursor-pointer px-4 py-3 font-mono text-xs ${
                  codeTab === "go" ? "text-white shadow-[inset_0_-2px_0_var(--signal)]" : "text-[#8a8475]"
                }`}
              >
                Go SDK
              </button>
            </div>
            {codeTab === "http" ? (
              <pre className="overflow-x-auto p-6 font-mono text-[13px] leading-[1.75]">
                {`POST /api/v1/links
Authorization: Bearer <accessToken>
X-Client-App: shortlink_web

{
  "code": "my-cat",
  "target": { "type": "url", "url": "https://example.com/file.png" },
  "expiresAt": "2026-12-31T23:59:59Z",
  "accessPassword": "••••••",
  "ruleSource": {
    "type": "template",
    "template": { "templateId": "tpl_01…", "version": 3 }
  }
}`}
              </pre>
            ) : (
              <pre className="overflow-x-auto p-6 font-mono text-[13px] leading-[1.75]">
                {`client, err := shortlink.NewClient(shortlink.Config{
    BaseURL:     "${getPublicBaseURL()}",
    AccessToken: userAccessToken,
    BusinessID:  "canvas",
})

asset, _ := client.Assets.Upload(ctx, shortlink.UploadAssetRequest{
    Path: "projects/abc/reference.png",
    File: file,
})

link, _ := client.Links.Create(ctx, shortlink.CreateLinkRequest{
    Target:     shortlink.AssetTarget(asset.AssetID),
    RuleSource: shortlink.InlineRules(shortlink.LinkRules{MaxVisits: 50}),
})`}
              </pre>
            )}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden bg-[var(--signal)] py-24 text-white">
        <div className="font-display pointer-events-none absolute right-[-20px] bottom-[-70px] text-[300px] leading-none italic opacity-15">
          S/
        </div>
        <div className="relative mx-auto flex max-w-[1240px] flex-wrap items-end justify-between gap-8 px-6 md:px-10">
          <h2 className="font-cn-display max-w-[780px] text-5xl leading-[1.06] font-black tracking-tight md:text-[64px]">
            把链接交出去，
            <br />
            <i className="font-display font-normal">控制权</i>留在手里。
          </h2>
          <Link to={token ? "/console" : "/login"} className="stub-btn !h-13 !px-7 !text-[15px]">
            {token ? "进入控制台 →" : "登录控制台 →"}
          </Link>
        </div>
      </section>

      <footer className="py-9 text-xs text-[var(--ink-3)]">
        <div className="mx-auto flex max-w-[1240px] justify-between px-6 md:px-10">
          <span>© Stub 短链 · 通用短链接服务</span>
          <span className="font-mono">{getPublicBaseURL()}</span>
        </div>
      </footer>
    </div>
  );
}
