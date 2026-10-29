import { App, Modal, Pagination } from "antd";
import { Check, Link2, RefreshCw, RotateCcw, Trash2, Upload } from "lucide-react";
import { type DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { CreateLinkDrawer } from "@/components/create-link-drawer";
import { formatDateTime, formatMB } from "@/lib/format";
import { assetsApi } from "@/services/api";
import { ApiError } from "@/services/api/client";
import type { AssetDTO, UploadSessionDTO } from "@/services/api/types";
import { useAuthStore } from "@/stores/auth-store";

const NORMAL_UPLOAD_LIMIT = 100 * 1024 * 1024;
const UPLOAD_FINGERPRINT_SAMPLE = 1024 * 1024;

async function buildUploadIdempotencyKey(file: File, businessId: string, path: string) {
  // 1. 只读取文件首尾各 1 MiB 参与指纹，避免为恢复任务把整个大文件读入内存。
  const sampleSize = Math.min(file.size, UPLOAD_FINGERPRINT_SAMPLE);
  const first = new Uint8Array(await file.slice(0, sampleSize).arrayBuffer());
  const last = file.size > sampleSize
    ? new Uint8Array(await file.slice(file.size - sampleSize, file.size).arrayBuffer())
    : new Uint8Array();
  const metadata = new TextEncoder().encode(`${businessId}\u0000${path}\u0000${file.name}\u0000${file.size}\u0000${file.lastModified}\u0000`);
  const input = new Uint8Array(metadata.length + first.length + last.length);
  input.set(metadata);
  input.set(first, metadata.length);
  input.set(last, metadata.length + first.length);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return `web:v1:${Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

type UploadTask = {
  fileName: string;
  mode: "single" | "multipart";
  status: "uploading" | "retrying" | "paused" | "completed" | "cancelled" | "failed";
  loaded: number;
  total: number;
  speed: number;
  eta: number | null;
};

function formatUploadSpeed(bytesPerSecond: number) {
  if (!bytesPerSecond) return "等待中";
  return `${formatMB(bytesPerSecond)}/秒`;
}

function formatRemaining(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "计算中";
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))} 秒`;
  return `${Math.ceil(seconds / 60)} 分钟`;
}

function uploadTaskStatusLabel(status: UploadTask["status"]) {
  switch (status) {
    case "uploading": return "上传中";
    case "retrying": return "网络异常，自动重试中";
    case "paused": return "已暂停，可继续";
    case "completed": return "已完成";
    case "cancelled": return "已取消";
    case "failed": return "失败，可续传";
  }
}

function formatUploadError(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : fallback;
  return `${error.message}${error.code ? `（${error.code}）` : ""}${error.requestId ? `，请求 ID：${error.requestId}` : ""}`;
}

function waitForUploadRetry(delayMs: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("上传已取消", "AbortError"));
      return;
    }
    const finish = () => {
      signal.removeEventListener("abort", abort);
      resolve();
    };
    const abort = () => {
      window.clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new DOMException("上传已取消", "AbortError"));
    };
    const timer = window.setTimeout(finish, delayMs);
    signal.addEventListener("abort", abort, { once: true });
  });
}

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
  const [uploadTask, setUploadTask] = useState<UploadTask | null>(null);
  const [activeUploads, setActiveUploads] = useState<UploadSessionDTO[]>([]);
  const [completingSessionId, setCompletingSessionId] = useState<string | null>(null);
  const [resumeSessionId, setResumeSessionId] = useState<string | null>(null);
  const [fileDragOver, setFileDragOver] = useState(false);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const uploadSessionRef = useRef<string | null>(null);
  const uploadPausedRef = useRef(false);
  const uploadCycleRef = useRef<{ done: Promise<void>; finish: () => void } | null>(null);
  const cancelInProgressRef = useRef(false);

  const refreshActiveUploads = useCallback(async () => {
    const result = await assetsApi.activeUploads();
    setActiveUploads(result.items);
  }, []);

  // 从素材直接建短链
  const [linkAssetId, setLinkAssetId] = useState<string | null>(null);

  useEffect(() => {
    if (!uploadBiz && businesses.length > 0) {
      setUploadBiz(businesses[0].businessId);
    }
  }, [businesses, uploadBiz]);

  useEffect(() => {
    refreshActiveUploads().catch(() => undefined);
  }, [refreshActiveUploads]);

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

  const handleCancelFailure = async (sessionId: string, error: unknown): Promise<"completed" | "cancelled" | null> => {
    let session: UploadSessionDTO | null = null;
    try {
      session = await assetsApi.uploadStatus(sessionId);
    } catch {
      // 保留取消接口的原始错误，活动任务刷新会显示后端实际状态。
    }
    if (session?.status === "completed" || session?.status === "cancelled") {
      const isCurrent = uploadSessionRef.current === sessionId;
      if (isCurrent) uploadSessionRef.current = null;
      setActiveUploads((current) => current.filter((item) => item.uploadSessionId !== sessionId));
      if (isCurrent) {
        setUploadTask((current) => current ? {
          ...current,
          status: session.status === "completed" ? "completed" : "cancelled",
          ...(session.status === "completed" ? { loaded: current.total, eta: 0 } : {}),
        } : current);
      }
      message.info(session.status === "completed" ? "取消前上传已完成，素材已保存" : "上传会话已取消");
      await refreshUsage().catch(() => undefined);
      if (session.status === "completed") fetchList();
      return session.status;
    }
    message.error(formatUploadError(error, "取消上传失败"));
    await refreshActiveUploads().catch(() => undefined);
    return null;
  };

  const handleCancelUpload = async () => {
    if (cancelInProgressRef.current) return;
    cancelInProgressRef.current = true;
    const startingSessionId = uploadSessionRef.current;
    try {
      uploadPausedRef.current = false;
      uploadAbortRef.current?.abort();
      await uploadCycleRef.current?.done;
      const sessionId = startingSessionId || uploadSessionRef.current;
      let cancelled = !sessionId;
      let terminalStatus: "completed" | "cancelled" | null = null;
      if (sessionId) {
        try {
          await assetsApi.cancelUpload(sessionId);
          cancelled = true;
          setActiveUploads((current) => current.filter((item) => item.uploadSessionId !== sessionId));
          await refreshUsage().catch(() => undefined);
        } catch (error) {
          terminalStatus = await handleCancelFailure(sessionId, error);
        }
      }
      if (cancelled || terminalStatus) uploadSessionRef.current = null;
      setUploading(false);
      setUploadTask((current) => (current ? {
        ...current,
        status: terminalStatus === "completed" ? "completed" : cancelled || terminalStatus === "cancelled" ? "cancelled" : "failed",
        ...(terminalStatus === "completed" ? { loaded: current.total, eta: 0 } : {}),
      } : current));
      setUploadOpen(false);
    } finally {
      cancelInProgressRef.current = false;
    }
  };

  const handlePauseUpload = () => {
    uploadPausedRef.current = true;
    uploadAbortRef.current?.abort();
  };

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

    let finishUploadCycle!: () => void;
    const uploadCycle = { done: new Promise<void>((resolve) => { finishUploadCycle = resolve; }), finish: () => finishUploadCycle() };
    uploadCycleRef.current = uploadCycle;
    setUploading(true);
    const startedAt = Date.now();
    uploadPausedRef.current = false;
    const abortController = new AbortController();
    uploadAbortRef.current = abortController;
    const isMultipart = uploadFile.size > NORMAL_UPLOAD_LIMIT;
    setUploadTask({ fileName: uploadFile.name, mode: isMultipart ? "multipart" : "single", status: "uploading", loaded: 0, total: uploadFile.size, speed: 0, eta: null });
    try {
      if (uploadFile.size <= NORMAL_UPLOAD_LIMIT) {
        await assetsApi.uploadWithProgress(
          { businessId: uploadBiz.trim(), path: uploadPath.trim(), file: uploadFile },
          (loaded, total) => {
            const elapsed = Math.max(1, Date.now() - startedAt) / 1000;
            const speed = loaded / elapsed;
            setUploadTask({ fileName: uploadFile.name, mode: "single", status: "uploading", loaded, total, speed, eta: speed ? (total - loaded) / speed : null });
          },
          abortController.signal,
        );
      } else {
        const idempotencyKey = await buildUploadIdempotencyKey(uploadFile, uploadBiz.trim(), uploadPath.trim());
        if (abortController.signal.aborted) throw new DOMException("上传已取消", "AbortError");
        let resumed = resumeSessionId
          ? await assetsApi.uploadStatus(resumeSessionId)
          : activeUploads.find((item) => item.idempotencyKey === idempotencyKey);
        if (resumed && resumed.idempotencyKey !== idempotencyKey) {
          throw new Error("所选文件、业务或目录与待恢复任务不一致，请核对后再试");
        }
        if (uploadSessionRef.current) {
          const current = await assetsApi.uploadStatus(uploadSessionRef.current);
          if (current.idempotencyKey === idempotencyKey) {
            resumed = current;
          } else {
            await assetsApi.cancelUpload(current.uploadSessionId);
            uploadSessionRef.current = null;
          }
        }
        if (abortController.signal.aborted) throw new DOMException("上传已取消", "AbortError");
        const session = resumed || await assetsApi.beginUpload({
          businessId: uploadBiz.trim(),
          path: uploadPath.trim(),
          fileName: uploadFile.name,
          contentType: uploadFile.type || "application/octet-stream",
          sizeBytes: uploadFile.size,
          idempotencyKey,
        });
        uploadSessionRef.current = session.uploadSessionId;
        await refreshActiveUploads().catch(() => undefined);
        if (abortController.signal.aborted) {
          await assetsApi.cancelUpload(session.uploadSessionId);
          uploadSessionRef.current = null;
          throw new DOMException("上传已取消", "AbortError");
        }
        const partProgress = new Map<number, number>();
        const completedParts = new Set(session.receivedParts);
        session.receivedParts.forEach((part) => {
          const partSize = part === session.partCount ? uploadFile.size - session.partSizeBytes * (session.partCount - 1) : session.partSizeBytes;
          partProgress.set(part, partSize);
        });
        const pendingParts = Array.from({ length: session.partCount }, (_, index) => index + 1).filter((part) => !partProgress.has(part));
        let cursor = 0;
        const refreshProgress = () => {
          const loaded = Array.from(partProgress.values()).reduce((sum, value) => sum + value, 0);
          const elapsed = Math.max(1, Date.now() - startedAt) / 1000;
          const speed = loaded / elapsed;
          setActiveUploads((current) => current.map((item) => item.uploadSessionId === session.uploadSessionId
            ? { ...item, receivedBytes: loaded, receivedParts: Array.from(completedParts) }
            : item));
          setUploadTask({ fileName: uploadFile.name, mode: "multipart", status: "uploading", loaded, total: uploadFile.size, speed, eta: speed ? (uploadFile.size - loaded) / speed : null });
        };
        const worker = async () => {
          while (cursor < pendingParts.length) {
            const partNumber = pendingParts[cursor++];
            const start = (partNumber - 1) * session.partSizeBytes;
            const end = Math.min(uploadFile.size, start + session.partSizeBytes);
            let lastError: unknown;
            for (let attempt = 0; attempt < 3; attempt += 1) {
              try {
                await assetsApi.uploadPart(session.uploadSessionId, partNumber, uploadFile.slice(start, end), (loaded) => {
                  partProgress.set(partNumber, loaded);
                  refreshProgress();
                }, abortController.signal);
                partProgress.set(partNumber, end - start);
                completedParts.add(partNumber);
                refreshProgress();
                lastError = undefined;
                break;
              } catch (error) {
                lastError = error;
                if (error instanceof DOMException && error.name === "AbortError") throw error;
                if (attempt < 2) {
                  setUploadTask((current) => current ? { ...current, status: "retrying" } : current);
                  await waitForUploadRetry(1000 * (attempt + 1), abortController.signal);
                }
              }
            }
            if (lastError) throw lastError;
          }
        };
        let workerError: unknown;
        const runWorker = async () => {
          try {
            await worker();
          } catch (error) {
            if (!abortController.signal.aborted) {
              workerError = error;
              abortController.abort();
            }
            throw error;
          }
        };
        await Promise.allSettled([runWorker(), runWorker(), runWorker()]);
        if (workerError) throw workerError;
        if (abortController.signal.aborted) throw new DOMException("上传已暂停或取消", "AbortError");
        await assetsApi.completeUpload(session.uploadSessionId);
        uploadSessionRef.current = null;
        setResumeSessionId(null);
        setActiveUploads((current) => current.filter((item) => item.uploadSessionId !== session.uploadSessionId));
      }
      message.success("素材上传成功");
      setUploadTask((current) => (current ? { ...current, status: "completed", loaded: current.total, eta: 0 } : current));
      setUploadOpen(false);
      setUploadFile(null);
      await refreshUsage();
      fetchList();
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === "AbortError";
      if (!aborted) {
        abortController.abort();
      }
      if (aborted && uploadPausedRef.current) {
        setUploadTask((current) => (current ? { ...current, status: "paused" } : current));
      } else if (!aborted) {
        setUploadTask((current) => (current ? { ...current, status: "failed" } : current));
      }
      if (uploadSessionRef.current) {
        await refreshActiveUploads().catch(() => undefined);
      }
      if (!aborted) message.error(formatUploadError(err, "上传素材失败"));
    } finally {
      setUploading(false);
      uploadAbortRef.current = null;
      uploadCycle.finish();
      if (uploadCycleRef.current === uploadCycle) uploadCycleRef.current = null;
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

  const handleFileDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setFileDragOver(false);
    if (uploading) return;
    const file = event.dataTransfer.files[0];
    if (!file) return;
    setUploadFile(file);
    if (uploadPath === "docs/manual.pdf") setUploadPath(`uploads/${file.name}`);
    setResumeSessionId(null);
    setUploadOpen(true);
    if (event.dataTransfer.files.length > 1) message.info("一次上传一个文件，已选择第一个文件");
  };

  const handleCompleteRecoveredUpload = async (session: UploadSessionDTO) => {
    setCompletingSessionId(session.uploadSessionId);
    try {
      await assetsApi.completeUpload(session.uploadSessionId);
      setActiveUploads((current) => current.filter((item) => item.uploadSessionId !== session.uploadSessionId));
      message.success(`${session.fileName} 已完成并保存到素材库`);
      await refreshUsage();
      fetchList();
    } catch (error) {
      message.error(formatUploadError(error, "完成上传失败"));
    } finally {
      setCompletingSessionId(null);
    }
  };

  const handleCancelUploadSession = async (session: UploadSessionDTO) => {
    const isCurrentUpload = uploadSessionRef.current === session.uploadSessionId;
    if (isCurrentUpload) {
      uploadPausedRef.current = false;
      uploadAbortRef.current?.abort();
      await uploadCycleRef.current?.done;
    }
    try {
      await assetsApi.cancelUpload(session.uploadSessionId);
      setActiveUploads((current) => current.filter((item) => item.uploadSessionId !== session.uploadSessionId));
      message.success("上传会话已取消并释放预留额度");
      if (uploadSessionRef.current === session.uploadSessionId) uploadSessionRef.current = null;
      await refreshUsage().catch(() => undefined);
    } catch (error) {
      await handleCancelFailure(session.uploadSessionId, error);
    }
  };

  return (
    <div
      className="relative flex flex-col gap-5"
      onDragEnter={(event) => {
        if (!uploading && Array.from(event.dataTransfer.types).includes("Files")) setFileDragOver(true);
      }}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFileDragOver(false);
      }}
      onDrop={handleFileDrop}
    >
      {fileDragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center border-2 border-dashed border-[var(--ink)] bg-[var(--paper)]/90">
          <div className="flex items-center gap-3 text-sm font-semibold text-[var(--ink)]">
            <Upload size={20} />
            松开鼠标添加文件
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-cn-display text-[28px] font-black tracking-tight">MinIO 托管素材</h1>
          <p className="mt-1 text-[13px] text-[var(--ink-2)]">
            按业务即桶 (bucketName = businessId) 隔离 · 软删除保留 7 天 · 同一素材建多条短链不重复扣存储容量
          </p>
        </div>
        {hasPermission("assets.upload") && (
          <button type="button" onClick={() => { setResumeSessionId(null); setUploadOpen(true); }} className="stub-btn signal">
            <Upload size={15} />
            上传素材
          </button>
        )}
      </div>

      {activeUploads.length > 0 && (
        <div className="border-y border-[var(--line)] py-3">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[var(--ink-2)]">
            <span>上传任务</span>
            <span>{activeUploads.length} 个</span>
          </div>
          <div className="flex flex-col divide-y divide-[var(--line)]">
            {activeUploads.map((session) => (
              <div key={session.uploadSessionId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-[var(--ink)]">{session.fileName}</span>
                    {session.status === "cleanup_pending" ? (
                      <span className="stub-badge warn">取消清理中</span>
                    ) : uploadSessionRef.current === session.uploadSessionId && uploading ? (
                      <span className="stub-badge ok">{uploadTask?.status === "retrying" ? "自动重试中" : "上传中"}</span>
                    ) : session.receivedParts.length === session.partCount && session.receivedBytes >= session.sizeBytes ? (
                      <span className="stub-badge warn">分片已齐 · 待完成</span>
                    ) : (
                      <span className="stub-badge neutral">待续传</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[var(--ink-3)]">
                    {session.status === "cleanup_pending" ? (
                      <span>MinIO 清理完成后会自动释放预留额度</span>
                    ) : (
                      <>
                        <span>{formatMB(session.receivedBytes)} / {formatMB(session.sizeBytes)}</span>
                        <span>{session.receivedParts.length} / {session.partCount} 分片</span>
                      </>
                    )}
                    <span>{session.businessId} · {session.path}</span>
                    <span>有效期至 {formatDateTime(session.expiresAt)}</span>
                  </div>
                  {session.status !== "cleanup_pending" && (
                    <div className="mt-2 h-1 overflow-hidden rounded bg-[var(--line)]">
                      <div
                        className="h-full bg-[var(--ink)]"
                        style={{ width: `${Math.min(100, (session.receivedBytes / Math.max(1, session.sizeBytes)) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {session.status === "cleanup_pending" ? (
                    <button
                      type="button"
                      className="stub-btn ghost !h-8 !px-2.5 !text-xs"
                      disabled={completingSessionId !== null}
                      onClick={() => handleCancelUploadSession(session)}
                    >
                      重试清理
                    </button>
                  ) : uploadSessionRef.current === session.uploadSessionId && uploading ? (
                    <span className="text-[var(--ink-3)]">任务进行中</span>
                  ) : session.receivedParts.length === session.partCount && session.receivedBytes >= session.sizeBytes ? (
                    <button
                      type="button"
                      className="stub-btn signal !h-8 !px-2.5 !text-xs"
                      disabled={completingSessionId !== null}
                      onClick={() => handleCompleteRecoveredUpload(session)}
                    >
                      <Check size={13} />
                      {completingSessionId === session.uploadSessionId ? "正在完成" : "完成登记"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="stub-btn ghost !h-8 !px-2.5 !text-xs"
                      onClick={() => {
                        setResumeSessionId(session.uploadSessionId);
                        setUploadBiz(session.businessId);
                        setUploadPath(session.path);
                        setUploadFile(null);
                        setUploadOpen(true);
                      }}
                    >
                      <Upload size={13} />
                      选择文件续传
                    </button>
                  )}
                  {session.status !== "cleanup_pending" && (
                    <button
                      type="button"
                      className="cursor-pointer text-[var(--ink-2)] hover:text-red-600 disabled:opacity-50"
                      disabled={completingSessionId !== null}
                      onClick={() => handleCancelUploadSession(session)}
                      aria-label={`取消 ${session.fileName} 上传`}
                    >
                      取消
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
        title={resumeSessionId ? "继续分片上传" : "上传托管素材"}
        open={uploadOpen}
        onCancel={uploading ? handleCancelUpload : () => { setResumeSessionId(null); setUploadOpen(false); }}
        onOk={handleUpload}
        confirmLoading={uploading}
        okText={uploadTask?.status === "paused" ? "继续上传" : "开始上传"}
        cancelText={uploading ? "取消上传" : "取消"}
      >
        <div className="flex flex-col gap-4 pt-2">
          {uploadTask && (
            <div className="rounded border border-[var(--line-2)] bg-[var(--paper-2)] p-3 text-xs text-[var(--ink-2)]">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-medium">{uploadTask.fileName}</span>
                <span className="shrink-0">{uploadTask.mode === "multipart" ? "分片续传" : "单文件上传"} · {uploadTaskStatusLabel(uploadTask.status)}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded bg-[var(--line)]">
                <div className="h-full bg-[var(--ink)] transition-[width]" style={{ width: `${Math.min(100, (uploadTask.loaded / Math.max(1, uploadTask.total)) * 100)}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-[var(--ink-3)]">
                <span>{formatMB(uploadTask.loaded)} / {formatMB(uploadTask.total)} · {Math.round((uploadTask.loaded / Math.max(1, uploadTask.total)) * 100)}%</span>
                <span>{formatUploadSpeed(uploadTask.speed)} · 剩余 {formatRemaining(uploadTask.eta)}</span>
              </div>
              {uploading && uploadFile && uploadFile.size > NORMAL_UPLOAD_LIMIT && (
                <button type="button" onClick={handlePauseUpload} className="mt-2 cursor-pointer text-[var(--ink-2)] hover:text-[var(--ink)]">
                  暂停
                </button>
              )}
            </div>
          )}
          <div className="text-xs leading-5 text-[var(--ink-3)]">
            分片上传失败会自动重试；刷新页面后可从下方任务恢复，选择原文件后只补传缺失分片。网页关闭期间浏览器无法继续读取本地文件。
          </div>
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
            <label className="text-xs font-medium text-[var(--ink-2)]">选择或拖入一个文件</label>
            <input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setUploadFile(f);
                if (f && uploadPath === "docs/manual.pdf") {
                  setUploadPath(`uploads/${f.name}`);
                }
                e.target.value = "";
              }}
              className="rounded border border-dashed border-[var(--line)] bg-[var(--paper-3)] p-3 text-xs"
            />
            {resumeSessionId && (
              <span className="text-xs text-[var(--ink-3)]">请选择原文件，并保持原来的业务和目录，页面会校验后只补传缺少的分片。</span>
            )}
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
