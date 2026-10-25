import { App, Drawer, Pagination } from "antd";
import { Ban, RefreshCw, Settings2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { bytesToMB, formatDateTime, formatMB, mbToBytes } from "@/lib/format";
import { adminApi } from "@/services/api";
import { ApiError } from "@/services/api/client";
import type {
  APIKeyDTO,
  AdminUserItem,
  BusinessDTO,
  PermissionCatalogItem,
  PermissionState,
  Quotas,
  UserBusinessItem,
} from "@/services/api/types";

export default function AdminUsersPage() {
  const { message, modal } = App.useApp();

  const [items, setItems] = useState<AdminUserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(false);

  // 管理单用户抽屉
  const [activeUser, setActiveUser] = useState<AdminUserItem | null>(null);
  const [drawerTab, setDrawerTab] = useState<"permissions" | "businesses" | "quotas" | "apiKeys">("permissions");
  const [catalog, setCatalog] = useState<PermissionCatalogItem[]>([]);
  const [userPerms, setUserPerms] = useState<PermissionState[]>([]);
  const [userBiz, setUserBiz] = useState<UserBusinessItem[]>([]);
  const [allBiz, setAllBiz] = useState<BusinessDTO[]>([]);
  const [quotas, setQuotas] = useState<Quotas | null>(null);
  const [userApiKeys, setUserApiKeys] = useState<APIKeyDTO[]>([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(false);

  // 配额表单（十进制 MB）
  const [maxSingleMB, setMaxSingleMB] = useState("20");
  const [storageMB, setStorageMB] = useState("100");
  const [urlLimit, setUrlLimit] = useState("20");
  const [assetLinkLimit, setAssetLinkLimit] = useState("10");
  const [apiKeyLimit, setApiKeyLimit] = useState("5");
  const [savingQuotas, setSavingQuotas] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminApi.listUsers({
        query: query.trim() || undefined,
        role: roleFilter || undefined,
        page,
        pageSize,
      });
      setItems(res.items);
      setTotal(res.pagination.total);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "加载用户列表失败");
    } finally {
      setLoading(false);
    }
  }, [query, roleFilter, page, pageSize, message]);

  useEffect(() => {
    fetchList();
    adminApi
      .permissionCatalog()
      .then((res) => setCatalog(res.items))
      .catch(() => {});
    adminApi
      .listBusinesses({ page: 1, pageSize: 100 })
      .then((res) => setAllBiz(res.items))
      .catch(() => {});
  }, [fetchList]);

  const fetchUserApiKeys = useCallback(async (userId: string) => {
    setLoadingApiKeys(true);
    try {
      const res = await adminApi.listUserAPIKeys(userId, { page: 1, pageSize: 50 });
      setUserApiKeys(res.items || []);
    } catch {
      setUserApiKeys([]);
    } finally {
      setLoadingApiKeys(false);
    }
  }, []);

  const openUserDrawer = async (u: AdminUserItem) => {
    setActiveUser(u);
    try {
      const [perms, biz, q] = await Promise.all([
        adminApi.getUserPermissions(u.userId),
        adminApi.getUserBusinesses(u.userId),
        adminApi.getUserQuotas(u.userId),
      ]);
      setUserPerms(perms.items);
      setUserBiz(biz.items);
      setQuotas(q);
      setMaxSingleMB(String(bytesToMB(q.maxSingleFileBytes)));
      setStorageMB(String(bytesToMB(q.storageQuotaBytes)));
      setUrlLimit(q.urlLinkQuota === null ? "-1" : String(q.urlLinkQuota));
      setAssetLinkLimit(q.minioAssetLinkQuota === null ? "-1" : String(q.minioAssetLinkQuota));
      setApiKeyLimit(q.apiKeyQuota === null ? "-1" : String(q.apiKeyQuota));
      fetchUserApiKeys(u.userId);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "读取用户详情失败");
    }
  };

  const handleTogglePerm = async (code: string, enabled: boolean) => {
    if (!activeUser) return;
    try {
      if (enabled) {
        await adminApi.revokePermission(activeUser.userId, code);
        message.success(`已收回权限 ${code}`);
      } else {
        await adminApi.grantPermission(activeUser.userId, code);
        message.success(`已授予权限 ${code}`);
      }
      const perms = await adminApi.getUserPermissions(activeUser.userId);
      setUserPerms(perms.items);
      fetchList();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "权限变更失败");
    }
  };

  const handleToggleBiz = async (businessId: string, granted: boolean) => {
    if (!activeUser) return;
    try {
      if (granted) {
        await adminApi.revokeBusiness(activeUser.userId, businessId);
        message.success(`已取消业务授权 ${businessId}`);
      } else {
        await adminApi.grantBusiness(activeUser.userId, businessId);
        message.success(`已授权业务访问 ${businessId}`);
      }
      const biz = await adminApi.getUserBusinesses(activeUser.userId);
      setUserBiz(biz.items);
      fetchList();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "业务授权变更失败");
    }
  };

  const handleSaveQuotas = async () => {
    if (!activeUser) return;
    setSavingQuotas(true);
    try {
      const updated = await adminApi.updateUserQuotas(activeUser.userId, {
        maxSingleFileBytes: mbToBytes(Number(maxSingleMB)),
        storageQuotaBytes: mbToBytes(Number(storageMB)),
        urlLinkQuota: Number(urlLimit),
        minioAssetLinkQuota: Number(assetLinkLimit),
        apiKeyQuota: Number(apiKeyLimit),
      });
      setQuotas(updated);
      message.success("用户配额已更新");
      fetchList();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "更新配额失败");
    } finally {
      setSavingQuotas(false);
    }
  };

  const handleAdminRevokeKey = (k: APIKeyDTO) => {
    if (!activeUser) return;
    modal.confirm({
      title: `管理员强制作废凭证「${k.name}」？`,
      content: `前缀: ${k.keyPrefix}… 吊销后将立即对该用户的外部机器调用生效，不可恢复。`,
      okText: "确认吊销",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await adminApi.revokeAPIKey(k.apiKeyId);
          message.success("该 API Key 已被管理员永久吊销");
          fetchUserApiKeys(activeUser.userId);
          fetchList();
        } catch (err) {
          message.error(err instanceof ApiError ? err.message : "吊销失败");
        }
      },
    });
  };

  const handleRevokeUserInvites = (u: AdminUserItem) => {
    modal.confirm({
      title: `作废用户 ${u.email} 创建的所有未使用邀请码？`,
      content: "仅将 status=active 的邀请码置为 revoked，不影响已核销注册的用户。",
      okText: "确认作废",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          const res = await adminApi.revokeUnusedInvites({
            userId: u.userId,
            confirmAll: false,
          });
          message.success(`已作废该用户 ${res.revokedCount} 个未使用邀请码`);
        } catch (err) {
          message.error(err instanceof ApiError ? err.message : "作废失败");
        }
      },
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-cn-display text-[28px] font-black tracking-tight">管理员 · 用户权限、业务与配额</h1>
        <p className="mt-1 text-[13px] text-[var(--ink-2)]">
          管理用户 14 项扁平权限开关、MinIO 业务桶授权、存储短链配额与 API Key 机器凭证治理
        </p>
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="按邮箱或 userId 搜索"
          className="h-9 w-60 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 text-xs outline-none focus:border-[var(--ink)]"
        />
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-2.5 text-xs outline-none"
        >
          <option value="">角色：全部</option>
          <option value="user">user（普通用户）</option>
          <option value="admin">admin（系统管理员）</option>
        </select>
        <button type="button" onClick={fetchList} className="stub-btn ghost !h-9 ml-auto">
          <RefreshCw size={13} />
          刷新
        </button>
      </div>

      {/* 用户列表 */}
      <div className="overflow-hidden rounded-md border border-[var(--line-2)] bg-[var(--paper-3)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--paper-2)] text-left font-mono text-[11px] text-[var(--ink-3)]">
                <th className="px-4 py-2.5">邮箱 / UserId</th>
                <th className="px-4 py-2.5">角色 / 邀请来源</th>
                <th className="px-4 py-2.5">存储已用 / 总额</th>
                <th className="px-4 py-2.5">配额 (URL / 素材 / API Key)</th>
                <th className="px-4 py-2.5">权限数 / 业务桶数</th>
                <th className="px-4 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-2)]">
              {items.map((u) => (
                <tr key={u.userId} className="hover:bg-[#fffdf8]">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{u.email}</div>
                    <div className="font-mono text-[11px] text-[var(--ink-3)]">
                      {u.userId} · {u.defaultWorkspaceId}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    <span className={`stub-badge ${u.role === "admin" ? "signal" : "neutral"}`}>
                      {u.role}
                    </span>
                    <div className="mt-0.5 text-[11px] text-[var(--ink-3)]">
                      invitedBy: {u.invitedByUserId || "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {formatMB(u.storageUsedBytes)} / {formatMB(u.storageQuotaBytes, 0)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    URL: {u.urlLinkUsed}/{u.urlLinkQuota} · 素材: {u.minioAssetLinkUsed}/
                    {u.minioAssetLinkQuota} · Key: {u.apiKeyUsed ?? 0}/{u.apiKeyQuota ?? 5}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {u.role === "admin" ? "全部权限" : `${u.enabledPermissionCount} 项权限`} ·{" "}
                    {u.businessAccessCount} 个业务桶
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openUserDrawer(u)}
                        className="stub-btn ghost !h-7 !px-2.5 !text-xs"
                      >
                        <Settings2 size={12} />
                        配置权限/业务/配额
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevokeUserInvites(u)}
                        className="stub-btn ghost !h-7 !px-2.5 !text-xs text-[var(--danger)]"
                      >
                        <Ban size={12} />
                        作废邀请码
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-[var(--ink-3)]">
                    未找到匹配的用户
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
              showTotal={(t) => `共 ${t} 人`}
            />
          </div>
        )}
      </div>

      {/* 单用户治理抽屉 */}
      <Drawer
        title={
          <span className="font-cn-display text-lg font-black">
            用户治理 · {activeUser?.email || ""}
          </span>
        }
        width={580}
        open={Boolean(activeUser)}
        onClose={() => setActiveUser(null)}
      >
        {activeUser && (
          <div className="flex flex-col gap-5">
            <div className="inline-flex w-fit gap-1 rounded border border-[var(--line-2)] bg-[var(--paper-3)] p-1">
              {(
                [
                  ["permissions", "14 项权限开关"],
                  ["businesses", "MinIO 业务桶授权"],
                  ["quotas", "存储与配额"],
                  ["apiKeys", "API Key 凭证治理"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setDrawerTab(k)}
                  className={`cursor-pointer rounded px-3.5 py-1.5 text-xs font-medium ${
                    drawerTab === k ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink-2)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {drawerTab === "permissions" && (
              <div className="flex flex-col gap-2.5">
                {activeUser.role === "admin" && (
                  <div className="rounded border-l-[3px] border-[var(--ink)] bg-[var(--paper-2)] p-3 text-xs">
                    该用户是系统管理员 (admin)，默认固定拥有全部权限，无需逐项授权。
                  </div>
                )}
                {(catalog.length > 0
                  ? catalog
                  : userPerms.map((p) => ({ code: p.code, name: p.code, description: "" }))
                ).map((item) => {
                  const state = userPerms.find((p) => p.code === item.code);
                  const enabled = activeUser.role === "admin" || Boolean(state?.enabled);
                  return (
                    <div
                      key={item.code}
                      className="flex items-center justify-between rounded border border-[var(--line-2)] bg-[var(--paper-3)] p-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs font-bold">{item.code}</code>
                          <span className="text-xs font-medium">{item.name}</span>
                        </div>
                        {item.description && (
                          <p className="mt-0.5 text-xs text-[var(--ink-3)]">{item.description}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        disabled={activeUser.role === "admin"}
                        onClick={() => handleTogglePerm(item.code, enabled)}
                        className={`stub-btn !h-7 !px-3 !text-xs ${
                          enabled ? "signal" : "ghost"
                        }`}
                      >
                        {enabled ? "已开启 · 点击收回" : "未开启 · 点击授权"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {drawerTab === "businesses" && (
              <div className="flex flex-col gap-2.5">
                <div className="rounded border-l-[3px] border-[var(--ink)] bg-[var(--paper-2)] p-3 text-xs text-[var(--ink-2)]">
                  普通用户只有同时拥有对应素材权限且被授权某个 <code>businessId</code>，才能在该业务桶下上传或查看素材。
                </div>
                {allBiz.map((b) => {
                  const grantedItem = userBiz.find((ub) => ub.businessId === b.businessId);
                  const granted = Boolean(grantedItem);
                  return (
                    <div
                      key={b.businessId}
                      className="flex items-center justify-between rounded border border-[var(--line-2)] bg-[var(--paper-3)] p-3"
                    >
                      <div>
                        <div className="font-semibold text-sm">{b.displayName}</div>
                        <div className="font-mono text-xs text-[var(--ink-3)]">
                          businessId / bucketName: {b.businessId} ({b.status})
                        </div>
                        {grantedItem && (
                          <div className="font-mono text-[11px] text-[var(--ok)]">
                            授权于 {formatDateTime(grantedItem.grantedAt)}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleBiz(b.businessId, granted)}
                        className={`stub-btn !h-7 !px-3 !text-xs ${granted ? "signal" : "ghost"}`}
                      >
                        {granted ? "已授权 · 取消" : "授权访问"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {drawerTab === "quotas" && quotas && (
              <div className="flex flex-col gap-4 rounded border border-[var(--line-2)] bg-[var(--paper-3)] p-4">
                <div className="rounded border-l-[3px] border-[var(--ink)] bg-[var(--paper-2)] p-3 text-xs text-[var(--ink-2)]">
                  文件大小与总存储额度使用十进制 MB（1 MB = 1,000,000 字节）换算。当前存储已用：
                  <b>{formatMB(quotas.storageUsedBytes)}</b>。
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-[var(--ink-2)]">
                      单文件上传上限 (十进制 MB)
                    </label>
                    <input
                      type="number"
                      value={maxSingleMB}
                      onChange={(e) => setMaxSingleMB(e.target.value)}
                      className="h-10 rounded border border-[var(--line-2)] bg-white px-3 font-mono text-sm outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-[var(--ink-2)]">
                      总存储额度上限 (十进制 MB)
                    </label>
                    <input
                      type="number"
                      value={storageMB}
                      onChange={(e) => setStorageMB(e.target.value)}
                      className="h-10 rounded border border-[var(--line-2)] bg-white px-3 font-mono text-sm outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-[var(--ink-2)]">
                      普通网址短链上限 (条 · 当前已用 {quotas.urlLinkUsed})
                    </label>
                    <input
                      type="number"
                      value={urlLimit}
                      onChange={(e) => setUrlLimit(e.target.value)}
                      className="h-10 rounded border border-[var(--line-2)] bg-white px-3 font-mono text-sm outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-[var(--ink-2)]">
                      素材短链上限 (条 · 当前已用 {quotas.minioAssetLinkUsed})
                    </label>
                    <input
                      type="number"
                      value={assetLinkLimit}
                      onChange={(e) => setAssetLinkLimit(e.target.value)}
                      className="h-10 rounded border border-[var(--line-2)] bg-white px-3 font-mono text-sm outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-[var(--ink-2)]">
                      API Key 数量上限 (个 · 当前已用 {quotas.apiKeyUsed || 0})
                    </label>
                    <input
                      type="number"
                      value={apiKeyLimit}
                      onChange={(e) => setApiKeyLimit(e.target.value)}
                      className="h-10 rounded border border-[var(--line-2)] bg-white px-3 font-mono text-sm outline-none"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={savingQuotas}
                  onClick={handleSaveQuotas}
                  className="stub-btn signal self-end"
                >
                  {savingQuotas ? "保存中…" : "保存配额变更"}
                </button>
              </div>
            )}

            {drawerTab === "apiKeys" && (
              <div className="flex flex-col gap-3">
                <div className="rounded border-l-[3px] border-[var(--ink)] bg-[var(--paper-2)] p-3 text-xs text-[var(--ink-2)]">
                  管理员可随时监督该用户的机器调用凭证，监控各凭证累计流量与建链使用情况，必要时可一键吊销异常凭证。
                </div>

                {userApiKeys.map((k) => {
                  const kq = k.quotas || k;
                  return (
                    <div
                      key={k.apiKeyId}
                      className="flex flex-col gap-2 rounded border border-[var(--line-2)] bg-[var(--paper-3)] p-3 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[var(--ink)]">{k.name}</span>
                          <code className="font-mono text-[11px] text-[var(--ink-3)]">
                            {k.keyPrefix}
                          </code>
                          <span
                            className={`stub-badge ${
                              k.status === "active" ? "ok" : k.status === "disabled" ? "neutral" : "bad"
                            }`}
                          >
                            {k.status}
                          </span>
                        </div>
                        {k.status !== "revoked" && (
                          <button
                            type="button"
                            onClick={() => handleAdminRevokeKey(k)}
                            className="stub-btn ghost !h-6 !px-2 !text-xs text-[var(--danger)]"
                          >
                            强制吊销
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-2 font-mono text-[11px] text-[var(--ink-3)]">
                        <div>
                          上传: {formatMB(kq.uploadedBytesUsed)} /{" "}
                          {kq.maxUploadBytes ? formatMB(kq.maxUploadBytes, 0) : "不限"}
                        </div>
                        <div>
                          建链: {kq.createdLinksUsed} / {kq.maxCreatedLinks ?? "不限"}
                        </div>
                        <div>
                          请求: {kq.requestsUsed} / {kq.maxRequests ?? "不限"}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1 font-mono text-[10px] text-[var(--ink-3)] border-t border-[var(--line-2)] pt-1.5">
                        <span>桶: {k.businessId}</span>
                        <span>·</span>
                        <span>频控: {k.rateLimitPerMin}次/分</span>
                        <span>·</span>
                        <span>创建: {formatDateTime(k.createdAt)}</span>
                        {k.lastUsedAt && (
                          <>
                            <span>·</span>
                            <span>最近调用: {formatDateTime(k.lastUsedAt)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}

                {!loadingApiKeys && userApiKeys.length === 0 && (
                  <div className="py-8 text-center text-xs text-[var(--ink-3)]">
                    该用户尚未创建任何 API Key
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
