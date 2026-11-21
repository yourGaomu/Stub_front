import dayjs from "dayjs";
import type { LinkDTO, PasswordPolicy, UpdateLinkRulesRequest } from "@/services/api/types";

export const ACCESS_PASSWORD_MAX_BYTES = 1024;
export const CIDRS_MAX_LENGTH = 8192;

export function parseMaxVisits(value: string): number {
  const parsed = Number(value);
  if (!value.trim() || !Number.isSafeInteger(parsed) || parsed < -1) {
    throw new Error("访问次数必须为 -1、0 或正整数，且不超过 9007199254740991");
  }
  return parsed;
}

export function validateAccessPassword(value: string): void {
  if (!value.trim()) throw new Error("访问口令不能留空或仅包含空白字符");
  if (new TextEncoder().encode(value).length > ACCESS_PASSWORD_MAX_BYTES) {
    throw new Error(`访问口令不能超过 ${ACCESS_PASSWORD_MAX_BYTES} 字节（中文通常占 3 字节）`);
  }
}

export function parseAllowedIpCidrs(value: string): string[] {
  if (value.length > CIDRS_MAX_LENGTH) throw new Error("IP/CIDR 配置不能超过 8192 个字符");
  return value.split(/[\n,]/).map((cidr) => cidr.trim()).filter(Boolean);
}

export function localExpiration(value?: string | null): string {
  return value ? dayjs(value).format("YYYY-MM-DDTHH:mm") : "";
}

export function renewalExpiration(value?: string | null, now = dayjs()): string {
  const expiration = value ? dayjs(value) : now;
  return (expiration.isValid() && expiration.isAfter(now) ? expiration : now)
    .add(7, "day")
    .format("YYYY-MM-DDTHH:mm");
}

export interface LinkWindowForm {
  activeFrom: string;
  activeUntil: string;
}

export interface LinkWindowValues {
  activeFrom?: string | null;
  activeUntil?: string | null;
  expiresAt?: string | null;
}

export function localWindowTime(value?: string | null): string {
  if (!value) return "";
  const date = dayjs(value);
  return date.format(date.second() ? "YYYY-MM-DDTHH:mm:ss" : "YYYY-MM-DDTHH:mm");
}

function parseLocalWindowTime(value: string, label: string): string | null {
  if (!value) return null;
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  const date = new Date(value);
  if (!parts || !Number.isFinite(date.getTime()) || Number(parts[1]) < 1 ||
    date.getFullYear() !== Number(parts[1]) || date.getMonth() + 1 !== Number(parts[2]) ||
    date.getDate() !== Number(parts[3]) || date.getHours() !== Number(parts[4]) ||
    date.getMinutes() !== Number(parts[5]) || date.getSeconds() !== Number(parts[6] || 0) ||
    date.getMilliseconds() !== Number((parts[7] || "").padEnd(3, "0"))) {
    throw new Error(`${label}无效，请输入有效的本地日期时间`);
  }
  return date.toISOString();
}

function windowInstant(value?: string | null): bigint | null {
  if (!value) return null;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) throw new Error("时间配置无效，请重新设置日期时间");
  // Date preserves milliseconds only. Compare the remaining PostgreSQL microseconds too.
  const fraction = /\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/i.exec(value)?.[1] || "";
  return BigInt(millis) * 1_000n + BigInt(fraction.padEnd(6, "0").slice(3, 6));
}

export function hasWindowEnded(value?: string | null, now = Date.now()): boolean {
  const cutoff = windowInstant(value);
  return cutoff !== null && cutoff <= BigInt(now) * 1_000n;
}

export function validateLinkWindow(values: LinkWindowValues): void {
  const start = windowInstant(values.activeFrom);
  const end = windowInstant(values.activeUntil);
  const expiration = windowInstant(values.expiresAt);
  if (start !== null && end !== null && start >= end) {
    throw new Error("开放开始时间必须早于开放结束时间");
  }
  if (start !== null && expiration !== null && start >= expiration) {
    throw new Error("开放开始时间必须早于短链到期时间（实际截止取到期与开放结束的较早者）");
  }
}

export function buildCreateWindow(
  form: LinkWindowForm,
  expiresAt: string | null,
  source?: LinkWindowValues | null,
  now = Date.now(),
): { activeFrom: string | null; activeUntil: string | null } {
  const read = (key: keyof LinkWindowForm, label: string) =>
    source && form[key] === localWindowTime(source[key])
      ? source[key] || null
      : parseLocalWindowTime(form[key], label);
  const window = { activeFrom: read("activeFrom", "开放开始时间"), activeUntil: read("activeUntil", "开放结束时间") };
  validateLinkWindow({ ...window, expiresAt });
  if (hasWindowEnded(window.activeUntil, now)) {
    throw new Error("开放结束时间必须晚于当前时间；复制已结束窗口后请明确修改或清除开放结束时间");
  }
  return window;
}

// Unchanged values stay omitted, including historical times and sub-millisecond precision.
// Clearing an existing boundary sends null; a new local time is serialized in UTC.
export function buildWindowPatch(
  source: LinkWindowValues,
  form: LinkWindowForm,
  expiresAt = source.expiresAt,
  now = Date.now(),
): Pick<UpdateLinkRulesRequest, "activeFrom" | "activeUntil"> {
  const patch: Pick<UpdateLinkRulesRequest, "activeFrom" | "activeUntil"> = {};
  for (const key of ["activeFrom", "activeUntil"] as const) {
    if (form[key] === localWindowTime(source[key])) continue;
    const value = parseLocalWindowTime(form[key], key === "activeFrom" ? "开放开始时间" : "开放结束时间");
    if (key === "activeUntil" && value && !(Date.parse(value) > now)) {
      throw new Error("新的开放结束时间必须晚于当前时间，留空表示清除结束限制");
    }
    patch[key] = value;
  }
  if (Object.keys(patch).length || expiresAt !== source.expiresAt) {
    validateLinkWindow({
      activeFrom: patch.activeFrom === undefined ? source.activeFrom : patch.activeFrom,
      activeUntil: patch.activeUntil === undefined ? source.activeUntil : patch.activeUntil,
      expiresAt,
    });
  }
  return patch;
}

export interface LinkRulesForm {
  expiresAt: string;
  activeFrom?: string;
  activeUntil?: string;
  maxVisits: string;
  cidrs: string;
  requirePassword: boolean;
  password: string;
  passwordStrategy: PasswordPolicy["strategy"];
}

// Compare against the exact local datetime shown when the editor opened. Formatting
// an unchanged value back to ISO would otherwise lose seconds and reject past dates.
export function buildRulesPatch(
  source: LinkDTO,
  initialLocalExpiration: string,
  form: LinkRulesForm,
  now = dayjs(),
): UpdateLinkRulesRequest {
  const patch: UpdateLinkRulesRequest = {};
  if (form.expiresAt !== initialLocalExpiration) {
    if (form.expiresAt) {
      const expiration = dayjs(form.expiresAt);
      if (!expiration.isValid() || !expiration.isAfter(now)) {
        throw new Error("新到期时间必须晚于当前时间，留空表示不过期");
      }
      patch.expiresAt = expiration.toISOString();
    } else {
      patch.expiresAt = null;
    }
  }
  Object.assign(patch, buildWindowPatch(source, {
    activeFrom: form.activeFrom ?? localWindowTime(source.activeFrom),
    activeUntil: form.activeUntil ?? localWindowTime(source.activeUntil),
  }, patch.expiresAt === undefined ? source.expiresAt : patch.expiresAt, now.valueOf()));

  const maxVisits = parseMaxVisits(form.maxVisits);
  if (maxVisits !== source.rules.maxVisits) patch.maxVisits = maxVisits;
  const cidrs = parseAllowedIpCidrs(form.cidrs);
  if (JSON.stringify(cidrs) !== JSON.stringify(source.rules.allowedIpCidrs)) {
    patch.allowedIpCidrs = cidrs;
  }
  if (form.requirePassword !== source.rules.requirePassword) {
    patch.requirePassword = form.requirePassword;
  }
  if (form.requirePassword) {
    if (form.password || !source.rules.requirePassword) {
      validateAccessPassword(form.password);
      patch.accessPassword = form.password;
    }
    const previousStrategy = source.rules.wrongPasswordPolicy?.strategy || "fixed_cooldown";
    if (!source.rules.requirePassword || form.passwordStrategy !== previousStrategy) {
      patch.wrongPasswordPolicy = { strategy: form.passwordStrategy };
    }
  }
  return patch;
}
