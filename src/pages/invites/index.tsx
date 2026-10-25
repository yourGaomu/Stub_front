import { App, Modal, Pagination } from "antd";
import dayjs from "dayjs";
import { Ban, Copy, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useCopy } from "@/hooks/use-copy";
import { formatDateTime } from "@/lib/format";
import { adminApi, invitesApi } from "@/services/api";
import { ApiError } from "@/services/api/client";
import type { InviteCreateResponse, InviteDTO } from "@/services/api/types";
import { useAuthStore } from "@/stores/auth-store";

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  active: { label: "active · 未使用", cls: "ok" },
  redeemed: { label: "redeemed · 已核销", cls: "neutral" },
  expired: { label: "expired · 已过期", cls: "warn" },
  revoked: { label: "revoked · 已作废", cls: "bad" },
};

export default function InvitesPage() {
  const { message, modal } = App.useApp();
  const copy = useCopy();
  const { isAdmin, hasPermission } = useAuthStore();

  const [items, setItems] = useState<InviteDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");

  // 创建邀请码弹窗
  const [createOpen, setCreateOpen] = useState(false);
  const [assignedRole, setAssignedRole] = useState<"user" | "admin">("user");
  const [boundEmail, setBoundEmail] = useState("");
  const [expirePreset, setExpirePreset] = useState<"1h" | "1d" | "3d" | "7d">("7d");
  const [creating, setCreating] = useState(false);

  // 一次性展示新生成的邀请码明文
  const [createdInvite, setCreatedInvite] = useState<InviteCreateResponse | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invitesApi.list({
        status: statusFilter || undefined,
        page,
        pageSize,
      });
      setItems(res.items);
      setTotal(res.pagination.total);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "加载邀请码失败");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, pageSize, message]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleCreate = async () => {
    let expiresAt = dayjs().add(7, "day").toISOString();
    if (expirePreset === "1h") expiresAt = dayjs().add(1, "hour").toISOString();
    else if (expirePreset === "1d") expiresAt = dayjs().add(1, "day").toISOString();
    else if (expirePreset === "3d") expiresAt = dayjs().add(3, "day").toISOString();

    setCreating(true);
    try {
      const res = await invitesApi.create({
        assignedRole: isAdmin ? assignedRole : "user",
        boundEmail: boundEmail.trim() || undefined,
        expiresAt,
      });
      setCreateOpen(false);
      setBoundEmail("");
      setCreatedInvite(res);
      fetchList();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "创建邀请码失败");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = (item: InviteDTO) => {
    modal.confirm({
      title: `作废邀请码 ${item.inviteId}？`,
      content: "仅对未使用的邀请码生效，已注册用户不受影响。",
      okText: "确认作废",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await invitesApi.revoke(item.inviteId);
          message.success("邀请码已作废");
          fetchList();
        } catch (err) {
          message.error(err instanceof ApiError ? err.message : "作废失败");
        }
      },
    });
  };

  const handleRevokeAllUnused = () => {
    modal.confirm({
      title: "批量作废全平台所有未使用邀请码？",
      content: "该操作将把所有当前 status=active 的邀请码标记为 revoked，不影响已注册用户。",
      okText: "全部作废",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          const res = await adminApi.revokeUnusedInvites({ confirmAll: true });
          message.success(`已批量作废 ${res.revokedCount} 个未使用邀请码`);
          fetchList();
        } catch (err) {
          message.error(err instanceof ApiError ? err.message : "批量作废失败");
        }
      },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-cn-display text-[28px] font-black tracking-tight">邀请码管理</h1>
          <p className="mt-1 text-[13px] text-[var(--ink-2)]">
            单次使用、最长 7 天有效期 · 服务端仅保存哈希，明文邀请码与注册链接只在创建成功时展示一次
          </p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button type="button" onClick={handleRevokeAllUnused} className="stub-btn ghost">
              <ShieldAlert size={14} />
              管理员：一键作废全部未使用
            </button>
          )}
          {hasPermission("invites.create_revoke") && (
            <button type="button" onClick={() => setCreateOpen(true)} className="stub-btn signal">
              <Plus size={15} />
              生成邀请码
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <div className="inline-flex gap-1 rounded border border-[var(--line-2)] bg-[var(--paper-3)] p-1">
          {[
            ["", "全部"],
            ["active", "未使用 (active)"],
            ["redeemed", "已核销 (redeemed)"],
            ["expired", "已过期 (expired)"],
            ["revoked", "已作废 (revoked)"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => {
                setStatusFilter(k);
                setPage(1);
              }}
              className={`cursor-pointer rounded px-3 py-1 text-xs ${
                statusFilter === k ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink-2)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button type="button" onClick={fetchList} className="stub-btn ghost !h-9 ml-auto">
          <RefreshCw size={13} />
          刷新
        </button>
      </div>

      <div className="overflow-hidden rounded-md border border-[var(--line-2)] bg-[var(--paper-3)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--paper-2)] text-left font-mono text-[11px] text-[var(--ink-3)]">
                <th className="px-4 py-2.5">InviteId / 创建人</th>
                <th className="px-4 py-2.5">授予角色</th>
                <th className="px-4 py-2.5">绑定邮箱</th>
                <th className="px-4 py-2.5">状态</th>
                <th className="px-4 py-2.5">到期时间</th>
                <th className="px-4 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-2)]">
              {items.map((item) => {
                const badge = STATUS_BADGE[item.status] || { label: item.status, cls: "neutral" };
                return (
                  <tr key={item.inviteId} className="hover:bg-[#fffdf8]">
                    <td className="px-4 py-3 font-mono text-xs">
                      <div className="font-semibold">{item.inviteId}</div>
                      <div className="text-[11px] text-[var(--ink-3)]">by {item.createdByUserId}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <span className="stub-badge neutral">{item.assignedRole}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{item.boundEmail || "不限邮箱"}</td>
                    <td className="px-4 py-3">
                      <span className={`stub-badge ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{formatDateTime(item.expiresAt)}</td>
                    <td className="px-4 py-3 text-right">
                      {item.status === "active" && hasPermission("invites.create_revoke") && (
                        <button
                          type="button"
                          onClick={() => handleRevoke(item)}
                          className="stub-btn ghost !h-7 !px-2.5 !text-xs text-[var(--danger)]"
                        >
                          <Ban size={12} />
                          作废
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-[var(--ink-3)]">
                    暂无邀请码记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {total > pageSize && (
          <div className="flex justify-end border-t border-[var(--line)] px-4 py-3">
            <Pagination
              size="small"
              current={page}
              pageSize={pageSize}
              total={total}
              onChange={(p) => setPage(p)}
              showTotal={(t) => `共 ${t} 条`}
            />
          </div>
        )}
      </div>

      {/* 生成邀请码弹窗 */}
      <Modal
        title="生成单次注册邀请码"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={handleCreate}
        confirmLoading={creating}
        okText="生成邀请码"
        cancelText="取消"
      >
        <div className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--ink-2)]">有效期（最长不超过 7 天）</label>
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  ["1h", "1 小时"],
                  ["1d", "1 天"],
                  ["3d", "3 天"],
                  ["7d", "7 天 (上限)"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setExpirePreset(k)}
                  className={`h-9 cursor-pointer rounded border text-xs ${
                    expirePreset === k
                      ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                      : "border-[var(--line-2)] bg-[var(--paper-3)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex justify-between text-xs font-medium text-[var(--ink-2)]">
              <span>绑定指定注册邮箱 (boundEmail · 选填)</span>
              <span className="font-normal text-[var(--ink-3)]">留空则任意邮箱可用一次</span>
            </label>
            <input
              type="email"
              value={boundEmail}
              onChange={(e) => setBoundEmail(e.target.value)}
              placeholder="new-member@example.com"
              className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none"
            />
          </div>

          {isAdmin && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--ink-2)]">授予角色 (仅管理员可选)</label>
              <select
                value={assignedRole}
                onChange={(e) => setAssignedRole(e.target.value as "user" | "admin")}
                className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 text-sm outline-none"
              >
                <option value="user">user（普通用户）</option>
                <option value="admin">admin（系统管理员）</option>
              </select>
            </div>
          )}
        </div>
      </Modal>

      {/* 一次性明文展示弹窗 */}
      <Modal
        title="邀请码已生成（明文仅展示一次）"
        open={Boolean(createdInvite)}
        onCancel={() => setCreatedInvite(null)}
        footer={
          <button type="button" onClick={() => setCreatedInvite(null)} className="stub-btn">
            我已妥善保存
          </button>
        }
      >
        {createdInvite && (
          <div className="flex flex-col gap-4 pt-2">
            <div className="rounded border-l-[3px] border-[var(--signal)] bg-[#fff5f0] p-3 text-xs text-[var(--ink-2)]">
              数据库仅存储邀请码 SHA-256 哈希，关闭此弹窗后无法再次查看明文邀请码或完整注册链接。
            </div>
            <div className="rounded border border-[var(--ink)] bg-[var(--paper-3)] p-4">
              <div className="font-mono text-[11px] text-[var(--ink-3)]">明文邀请码 (code)</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <code className="font-mono text-base font-bold">{createdInvite.code}</code>
                <button
                  type="button"
                  onClick={() => copy(createdInvite.code, "已复制邀请码")}
                  className="stub-btn ghost !h-7 !px-2.5 !text-xs"
                >
                  <Copy size={12} />
                  复制邀请码
                </button>
              </div>
              <div className="mt-3 border-t border-[var(--line)] pt-3">
                <div className="font-mono text-[11px] text-[var(--ink-3)]">带参注册链接 (inviteURL)</div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <code className="truncate font-mono text-xs">{createdInvite.inviteURL}</code>
                  <button
                    type="button"
                    onClick={() => copy(createdInvite.inviteURL, "已复制邀请注册链接")}
                    className="stub-btn signal !h-7 !px-2.5 !text-xs shrink-0"
                  >
                    <Copy size={12} />
                    复制注册链接
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
