// Fetch wrapper: JWT in localStorage, Authorization: Bearer, 401 -> /login.

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const TOKEN_KEY = "edutech_token";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore
  }
}

export function clearToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Do not redirect to /login on 401 (used on the login page itself). */
  noAuthRedirect?: boolean;
}

export async function api<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(
      "Không kết nối được máy chủ. Vui lòng thử lại sau.",
      0,
      "network"
    );
  }

  if (res.status === 401) {
    clearToken();
    if (!options.noAuthRedirect && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    throw new ApiError("Phiên đăng nhập đã hết hạn.", 401, "unauthorized");
  }

  let data: any = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (!res.ok) {
    const code: string | undefined =
      (data && (data.code || data.status_code || data.reason)) || undefined;
    const message: string =
      (data && (data.error || data.message)) ||
      `Lỗi máy chủ (${res.status})`;
    throw new ApiError(message, res.status, code);
  }

  return data as T;
}

export const apiGet = <T = unknown>(path: string) => api<T>(path);
export const apiPost = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body });
export const apiPatch = <T = unknown>(path: string, body?: unknown) =>
  api<T>(path, { method: "PATCH", body });
export const apiDelete = <T = unknown>(path: string) =>
  api<T>(path, { method: "DELETE" });
