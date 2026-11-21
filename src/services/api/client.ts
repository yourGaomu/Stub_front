import type { APIErrorPayload } from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "") + "/api/v1";
const TOKEN_KEY = "stub_access_token";

export class ApiError extends Error {
  status: number;
  code: string;
  requestId?: string;

  constructor(status: number, code: string, message: string, requestId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function buildQuery(params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      sp.set(k, String(v));
    }
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
}

type RequestOptions = RequestInit & { query?: Record<string, string | number | boolean | undefined | null> };

async function authenticatedFetch(path: string, options: RequestOptions = {}) {
  const { query, headers: customHeaders, body, ...rest } = options;
  const token = getStoredToken();
  const headers = new Headers(customHeaders);
  headers.set("X-Client-App", "shortlink_web");
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  if (body && !(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${API_BASE}${path}${buildQuery(query)}`, { ...rest, headers, body });
  return { response, token: headers.get("Authorization") === `Bearer ${token}` ? token : null };
}

function responseError(path: string, status: number, token: string | null, data: unknown): ApiError {
  const payload = data as APIErrorPayload | null;
  const message = payload?.error?.message || `请求失败 (${status})`;
  if (status === 401 && token && getStoredToken() === token && !path.startsWith("/auth/login")) {
    setStoredToken(null);
    window.dispatchEvent(new CustomEvent("stub:unauthorized", { detail: message }));
  }
  return new ApiError(status, payload?.error?.code || `http_${status}`, message, payload?.error?.requestId);
}

async function readJSON(response: Response): Promise<unknown> {
  try { return JSON.parse(await response.text()); } catch { return null; }
}

export async function request<T = void>(path: string, options: RequestOptions = {}): Promise<T> {
  const { response, token } = await authenticatedFetch(path, options);
  if (response.status === 204) return undefined as T;
  const data = await readJSON(response);
  if (!response.ok) throw responseError(path, response.status, token, data);
  return data as T;
}

export async function downloadBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const { response, token } = await authenticatedFetch(path, options);
  const contentType = response.headers.get("Content-Type") || "";
  if (!response.ok || /\bjson\b/i.test(contentType)) {
    const data = await readJSON(response);
    if (!response.ok) throw responseError(path, response.status, token, data);
    const payload = data as APIErrorPayload | null;
    throw new ApiError(response.status, payload?.error?.code || "invalid_download", payload?.error?.message || "导出未返回 CSV 文件，请重试", payload?.error?.requestId);
  }
  if (contentType.split(";", 1)[0].trim().toLowerCase() !== "text/csv") {
    throw new ApiError(response.status, "invalid_download", "导出未返回 CSV 文件，请重试");
  }
  const maxBytes = 20 * 1024 * 1024;
  const declaredBytes = Number(response.headers.get("Content-Length"));
  if (declaredBytes > maxBytes) {
    await response.body?.cancel();
    throw new ApiError(413, "export_too_large", "导出文件超过 20 MiB，请缩小筛选范围");
  }
  const blob = await response.blob();
  if (blob.size > maxBytes) throw new ApiError(413, "export_too_large", "导出文件超过 20 MiB，请缩小筛选范围");
  return blob;
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  try {
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Let the browser consume the URL before releasing the backing Blob.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function uploadBinaryPart<T = unknown>(
  path: string,
  body: Blob,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  // 1. 分片使用 XHR，仅为浏览器提供上传进度；请求仍然先到 Go 后端。
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const token = getStoredToken();
    xhr.open("PUT", `${API_BASE}${path}`);
    xhr.setRequestHeader("X-Client-App", "shortlink_web");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    const abort = () => xhr.abort();
    const cleanup = () => signal?.removeEventListener("abort", abort);
    if (signal?.aborted) {
      reject(new DOMException("上传已取消", "AbortError"));
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    xhr.upload.onprogress = (event) => onProgress(event.loaded, event.total || body.size);
    xhr.onerror = () => {
      cleanup();
      reject(new ApiError(0, "network_error", "分片上传网络错误"));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException("上传已取消", "AbortError"));
    };
    xhr.onload = () => {
      cleanup();
      let data: unknown = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        data = null;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        const payload = data as APIErrorPayload | null;
        reject(new ApiError(xhr.status, payload?.error?.code || `http_${xhr.status}`, payload?.error?.message || "分片上传失败", payload?.error?.requestId));
        return;
      }
      resolve(data as T);
    };
    try {
      xhr.send(body);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

export function uploadFormData<T = unknown>(path: string, body: FormData, onProgress: (loaded: number, total: number) => void, signal?: AbortSignal): Promise<T> {
	// 1. 普通上传保持 multipart/form-data 协议，同时报告浏览器上传进度。
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		const token = getStoredToken();
		xhr.open("POST", `${API_BASE}${path}`);
		xhr.setRequestHeader("X-Client-App", "shortlink_web");
		if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
		const abort = () => xhr.abort();
		const cleanup = () => signal?.removeEventListener("abort", abort);
		if (signal?.aborted) {
			reject(new DOMException("上传已取消", "AbortError"));
			return;
		}
		signal?.addEventListener("abort", abort, { once: true });
		xhr.upload.onprogress = (event) => onProgress(event.loaded, event.total || 0);
		xhr.onerror = () => {
			cleanup();
			reject(new ApiError(0, "network_error", "上传网络错误"));
		};
		xhr.onabort = () => {
			cleanup();
			reject(new DOMException("上传已取消", "AbortError"));
		};
		xhr.onload = () => {
			cleanup();
			let data: unknown = null;
			try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { data = null; }
			if (xhr.status < 200 || xhr.status >= 300) {
				const payload = data as APIErrorPayload | null;
				reject(new ApiError(xhr.status, payload?.error?.code || `http_${xhr.status}`, payload?.error?.message || "上传失败", payload?.error?.requestId));
				return;
			}
			resolve(data as T);
		};
		try {
			xhr.send(body);
		} catch (error) {
			cleanup();
			reject(error);
		}
	});
}
