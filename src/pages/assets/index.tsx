import { App, Modal, Pagination } from "antd";
import { Link2, RefreshCw, RotateCcw, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CreateLinkDrawer } from "@/components/create-link-drawer";
import { formatDateTime, formatMB } from "@/lib/format";
import { assetsApi } from "@/services/api";
import { ApiError } from "@/services/api/client";
import type { AssetDTO } from "@/services/api/types";
import { useAuthStore } from "@/stores/auth-store";

export default function AssetsPage() {
  const { message, modal } = App.useApp();
  const { businesses, usage, isAdmin, hasPermission, refreshUsage } = useAuthStore();

  const [items, setItems] = useState<AssetDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  const [businessId, setBusinessId] = useState<string>("");
  const [keyword, setKeyword] = useState<string>("");
  const [includeDeleted, setIncludeDeleted] = useState<boolean>(false);
  const [workspaceIdFilter, setWorkspaceIdFilter] = useState<string>("");

  // 上传弹窗
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBiz, setUploadBiz] = useState(businesses[0]?.businessId || "");
  const [uploadPath, setUploadPath] = useState("docs/manual.pdf");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // 从素材直接建短链
  const [linkAssetId, setLinkAssetId] = useState<string | null>(null);

  useEffect(() => {
    if (!uploadBiz && businesses.length > 0) {
      setUploadBiz(businesses[0].businessId);
    }
  }, [businesses, uploadBiz]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await assetsApi.list({
        businessId: businessId || undefined,
        keyword: keyword.trim() || undefined,
        includeDeleted,
        workspaceId: isAdmin && workspaceIdFilter.trim() ? workspaceIdFilter.trim() : undefined,
        page,
        pageSize,
      });
      setItems(res.items);
      setTotal(res.pagination.total);
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "加载素材列表失败");
    } finally {
      setLoading(false);
    }
  }, [businessId, keyword, includeDeleted, isAdmin, workspaceIdFilter, page, pageSize, message]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleUpload = async () => {
    if (!uploadBiz.trim()) {
      message.warning("请选择所属业务 (businessId)");
      return;
    }
    if (!uploadPath.trim() || uploadPath.startsWith("/") || uploadPath.includes("..")) {
      message.warning("请输入合法的业务内相对路径（不以 / 开头，不包含 ..）");
      return;
    }
    if (!uploadFile) {
      message.warning("请选择要上传的文件");
      return;
    }
    if (usage && uploadFile.size > usage.storage.maxSingleFileBytes) {
      message.error(
        `文件大小 ${formatMB(uploadFile.size)} 超出单文件上限 ${formatMB(usage.storage.maxSingleFileBytes, 0)}`,
      );
      return;
    }

    setUploading(true);
    try {
      await assetsApi.upload({
        businessId: uploadBiz.trim(),
        path: uploadPath.trim(),
        file: uploadFile,
      });
      message.success("素材上传成功");
      setUploadOpen(false);
      setUploadFile(null);
      await refreshUsage();
      fetchList();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "上传素材失败");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (item: AssetDTO) => {
    modal.confirm({
      title: `软删除素材「${item.fileName}」？`,
      content:
        "软删除后关联短链将立即不可访问（返回 410 asset_deleted）。素材进入 7 天回收站保留期，保留期内仍计入存储已用额度。",
      okText: "移入回收站",
      okButtonProps: { danger: true },
      cancelText: "取消",
      onOk: async () => {
        try {
          await assetsApi.remove(item.assetId);
          message.success("素材已移入回收站（7 天后由后台任务彻底清理并释放存储）");
          fetchList();
        } catch (err) {
          message.error(err instanceof ApiError ? err.message : "删除失败");
        }
      },
    });
  };

  const handleRestore = async (item: AssetDTO) => {
    try {
      await assetsApi.restore(item.assetId);
      message.success("素材已从回收站恢复");
      fetchList();
    } catch (err) {
      message.error(err instanceof ApiError ? err.message : "恢复素材失败");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-cn-display text-[28px] font-black tracking-tight">MinIO 托管素材</h1>
          <p className="mt-1 text-[13px] text-[var(--ink-2)]">
            按业务即桶 (bucketName = businessId) 隔离 · 软删除保留 7 天 · 同一素材建多条短链不重复扣存储容量
          </p>
        </div>
        {hasPermission("assets.upload") && (
          <button type="button" onClick={() => setUploadOpen(true)} className="stub-btn signal">
            <Upload size={15} />
            上传素材
          </button>
        )}
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="inline-flex gap-1 rounded border border-[var(--line-2)] bg-[var(--paper-3)] p-1">
          <button
            type="button"
            onClick={() => {
              setIncludeDeleted(false);
              setPage(1);
            }}
            className={`cursor-pointer rounded px-3 py-1 text-xs ${
              !includeDeleted ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink-2)]"
            }`}
          >
            正常素材
          </button>
          <button
            type="button"
            onClick={() => {
              setIncludeDeleted(true);
              setPage(1);
            }}
            className={`cursor-pointer rounded px-3 py-1 text-xs ${
              includeDeleted ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--ink-2)]"
            }`}
          >
            包含 7 天回收站
          </button>
        </div>

        <select
          value={businessId}
          onChange={(e) => {
            setBusinessId(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-2.5 text-xs outline-none"
        >
          <option value="">全部已授权业务</option>
          {businesses.map((b) => (
            <option key={b.businessId} value={b.businessId}>
              {b.displayName} ({b.businessId})
            </option>
          ))}
        </select>

        <input
          value={keyword}
          onChange={(e) => {
            setKeyword(e.target.value);
            setPage(1);
          }}
          placeholder="搜索文件名或路径 keyword"
          className="h-9 w-52 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 text-xs outline-none focus:border-[var(--ink)]"
        />

        {isAdmin && (
          <input
            value={workspaceIdFilter}
            onChange={(e) => {
              setWorkspaceIdFilter(e.target.value);
              setPage(1);
            }}
            placeholder="管理员：workspaceId (all 查全平台)"
            className="h-9 w-56 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-xs outline-none focus:border-[var(--ink)]"
          />
        )}

        <button type="button" onClick={fetchList} className="stub-btn ghost !h-9 ml-auto">
          <RefreshCw size={13} />
          刷新
        </button>
      </div>

      {/* 列表 */}
      <div className="overflow-hidden rounded-md border border-[var(--line-2)] bg-[var(--paper-3)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[var(--line)] bg-[var(--paper-2)] text-left font-mono text-[11px] text-[var(--ink-3)]">
                <th className="px-4 py-2.5">文件名 / AssetId</th>
                <th className="px-4 py-2.5">业务桶 / 业务内路径</th>
                <th className="px-4 py-2.5">MIME / 大小 (十进制 MB)</th>
                <th className="px-4 py-2.5">状态</th>
                <th className="px-4 py-2.5">上传时间</th>
                <th className="px-4 py-2.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line-2)]">
              {items.map((item) => {
                const isDeleted = Boolean(item.deletedAt);
                return (
                  <tr key={item.assetId} className="hover:bg-[#fffdf8]">
                    <td className="px-4 py-3">
                      <div className="font-medium">{item.fileName}</div>
                      <div className="font-mono text-[11px] text-[var(--ink-3)]">{item.assetId}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <span className="stub-badge neutral mr-1.5">{item.businessId}</span>
                      <span className="text-[var(--ink-2)]">{item.path}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      <div>{formatMB(item.sizeBytes)}</div>
                      <div className="text-[11px] text-[var(--ink-3)]">{item.contentType}</div>
                    </td>
                    <td className="px-4 py-3">
                      {isDeleted ? (
                        <span className="stub-badge warn">回收站待清理</span>
                      ) : (
                        <span className="stub-badge ok">正常托管</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{formatDateTime(item.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {!isDeleted && hasPermission("links.create_asset") && (
                          <button
                            type="button"
                            onClick={() => setLinkAssetId(item.assetId)}
                            className="stub-btn ghost !h-7 !px-2.5 !text-xs"
                          >
                            <Link2 size={12} />
                            创建短链
                          </button>
                        )}
                        {!isDeleted && hasPermission("assets.delete") && (
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            className="stub-btn ghost !h-7 !px-2.5 !text-xs text-[var(--danger)]"
                          >
                            <Trash2 size={12} />
                            软删除
                          </button>
                        )}
                        {isDeleted && hasPermission("assets.restore") && (
                          <button
                            type="button"
                            onClick={() => handleRestore(item)}
                            className="stub-btn ghost !h-7 !px-2.5 !text-xs"
                          >
                            <RotateCcw size={12} />
                            恢复
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-[var(--ink-3)]">
                    暂无匹配的素材记录
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

      {/* 上传素材弹窗 */}
      <Modal
        title="上传托管素材 (multipart/form-data)"
        open={uploadOpen}
        onCancel={() => setUploadOpen(false)}
        onOk={handleUpload}
        confirmLoading={uploading}
        okText="开始上传"
        cancelText="取消"
      >
        <div className="flex flex-col gap-4 pt-2">
          <div className="rounded border-l-[3px] border-[var(--ink)] bg-[var(--paper-2)] p-3 text-xs text-[var(--ink-2)]">
            单文件上限 <b>{formatMB(usage?.storage.maxSingleFileBytes, 0)}</b> · 当前剩余存储{" "}
            <b>{formatMB(usage?.storage.remainingBytes)}</b>（十进制 MB：1 MB = 1,000,000 字节）。
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--ink-2)]">
              所属业务标识 (businessId = MinIO bucketName)
            </label>
            {businesses.length > 0 ? (
              <select
                value={uploadBiz}
                onChange={(e) => setUploadBiz(e.target.value)}
                className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 text-sm outline-none"
              >
                {businesses.map((b) => (
                  <option key={b.businessId} value={b.businessId}>
                    {b.displayName} ({b.businessId})
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={uploadBiz}
                onChange={(e) => setUploadBiz(e.target.value)}
                placeholder="输入管理员已登记并授权的 businessId，例如 canvas-prod"
                className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none"
              />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="flex justify-between text-xs font-medium text-[var(--ink-2)]">
              <span>业务内相对路径 (path)</span>
              <span className="font-normal text-[var(--ink-3)]">不能以 / 开头，不能包含 ..</span>
            </label>
            <input
              value={uploadPath}
              onChange={(e) => setUploadPath(e.target.value)}
              placeholder="boards/2026/cat.png"
              className="h-10 rounded border border-[var(--line-2)] bg-[var(--paper-3)] px-3 font-mono text-sm outline-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-[var(--ink-2)]">选择文件 (file)</label>
            <input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setUploadFile(f);
                if (f && uploadPath === "docs/manual.pdf") {
                  setUploadPath(`uploads/${f.name}`);
                }
              }}
              className="rounded border border-dashed border-[var(--line)] bg-[var(--paper-3)] p-3 text-xs"
            />
            {uploadFile && (
              <div className="font-mono text-xs text-[var(--ink-2)]">
                已选：{uploadFile.name} · {formatMB(uploadFile.size)} ({uploadFile.size.toLocaleString()} B)
              </div>
            )}
          </div>
        </div>
      </Modal>

      <CreateLinkDrawer
        open={Boolean(linkAssetId)}
        initialTargetType="minio_asset"
        initialAssetId={linkAssetId || ""}
        onClose={() => setLinkAssetId(null)}
      />
    </div>
  );
}
