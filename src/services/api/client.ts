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

export async function request<T = void>(
  path: string,
  options: RequestInit & { query?: Record<string, string | number | boolean | undefined | null> } = {},
): Promise<T> {
  const { query, headers: customHeaders, body, ...rest } = options;
  const url = `${API_BASE}${path}${buildQuery(query)}`;
  const token = getStoredToken();

  const headers = new Headers(customHeaders);
  headers.set("X-Client-App", "shortlink_web");
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (body && !(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    ...rest,
    headers,
    body,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const errPayload = data as APIErrorPayload | null;
    const code = errPayload?.error?.code || `http_${res.status}`;
    const msg = errPayload?.error?.message || `请求失败 (${res.status})`;
    const reqId = errPayload?.error?.requestId;

    if (res.status === 401 && token && !path.startsWith("/auth/login")) {
      setStoredToken(null);
      window.dispatchEvent(new CustomEvent("stub:unauthorized", { detail: msg }));
    }
    throw new ApiError(res.status, code, msg, reqId);
  }

  return data as T;
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
    signal?.addEventListener("abort", abort, { once: true });
    xhr.upload.onprogress = (event) => onProgress(event.loaded, event.total || body.size);
    xhr.onerror = () => reject(new ApiError(0, "network_error", "分片上传网络错误"));
    xhr.onabort = () => reject(new DOMException("上传已取消", "AbortError"));
    xhr.onload = () => {
      signal?.removeEventListener("abort", abort);
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
    xhr.send(body);
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
		signal?.addEventListener("abort", abort, { once: true });
		xhr.upload.onprogress = (event) => onProgress(event.loaded, event.total || 0);
		xhr.onerror = () => reject(new ApiError(0, "network_error", "上传网络错误"));
		xhr.onabort = () => reject(new DOMException("上传已取消", "AbortError"));
		xhr.onload = () => {
			signal?.removeEventListener("abort", abort);
			let data: unknown = null;
			try { data = xhr.responseText ? JSON.parse(xhr.responseText) : null; } catch { data = null; }
			if (xhr.status < 200 || xhr.status >= 300) {
				const payload = data as APIErrorPayload | null;
				reject(new ApiError(xhr.status, payload?.error?.code || `http_${xhr.status}`, payload?.error?.message || "上传失败", payload?.error?.requestId));
				return;
			}
			resolve(data as T);
		};
		xhr.send(body);
	});
}
