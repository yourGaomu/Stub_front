import { request, uploadBinaryPart, uploadFormData } from "./client";
import type {
  APIKeyDTO,
  AccessEvent,
  AdminUserItem,
  AnalyticsResponse,
  AssetDTO,
	UploadSessionDTO,
  AuditEvent,
  BusinessDTO,
  BusinessItem,
  CreateAPIKeyRequest,
  CreateAPIKeyResponse,
  CreateLinkRequest,
  EmailCodeRequest,
  EmailCodeResponse,
  InviteCreateRequest,
  InviteCreateResponse,
  InviteDTO,
  LinkDTO,
  LinkListItem,
  UpdateLinkMetadataRequest,
  UpdateLinkRulesRequest,
  LoginRequest,
  LoginResponse,
  PageResponse,
  PasswordResetRequest,
  PermissionCatalogItem,
  PermissionsResponse,
  QuotaPatch,
  Quotas,
  RegisterRequest,
  RegisterResponse,
  RegistrationSettings,
  RenewLinkRequest,
  RenewLinkResponse,
  RotateCodeRequest,
  RotateCodeResponse,
  Session,
  TemplateCreateRequest,
  TemplateDTO,
  TemplateListItem,
  TemplateUpdateRequest,
  TemplateVersionDTO,
  TemplateVersionListItem,
  TemplateVersionRequest,
  UnknownShortCodeEvent,
  UpdateAPIKeyRequest,
  UsageResponse,
  User,
  UserBusinessItem,
  UserPermissionsResponse,
} from "./types";

export const authApi = {
  requestEmailCode: (body: EmailCodeRequest) =>
    request<EmailCodeResponse>("/auth/email-codes", { method: "POST", body: JSON.stringify(body) }),

  register: (body: RegisterRequest) =>
    request<RegisterResponse>("/auth/register", { method: "POST", body: JSON.stringify(body) }),

  login: (body: LoginRequest) =>
    request<LoginResponse>("/auth/login", { method: "POST", body: JSON.stringify(body) }),

  resetPassword: (body: PasswordResetRequest) =>
    request<void>("/auth/password-resets", { method: "POST", body: JSON.stringify(body) }),

  me: () => request<User>("/me"),

  logout: () => request<void>("/auth/logout", { method: "POST" }),

  myPermissions: () => request<PermissionsResponse>("/me/permissions"),

  myUsage: () => request<UsageResponse>("/me/usage"),

  myBusinesses: () => request<{ items: BusinessItem[] }>("/me/businesses"),

  listSessions: (page = 1, pageSize = 20) =>
    request<PageResponse<Session>>("/me/sessions", { query: { page, pageSize } }),

  heartbeat: () => request<Session>("/me/sessions/heartbeat", { method: "POST" }),

  revokeSession: (sessionId: string) =>
    request<void>(`/me/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),
};

export const invitesApi = {
  list: (params: { status?: string; createdByUserId?: string; page?: number; pageSize?: number }) =>
    request<PageResponse<InviteDTO>>("/invites", { query: params }),

  create: (body: InviteCreateRequest) =>
    request<InviteCreateResponse>("/invites", { method: "POST", body: JSON.stringify(body) }),

  revoke: (inviteId: string) =>
    request<{ inviteId: string; status: string; revokedAt: string }>(
      `/invites/${encodeURIComponent(inviteId)}/revoke`,
      { method: "POST" },
    ),
};

export const linksApi = {
  create: (body: CreateLinkRequest) =>
    request<LinkDTO>("/links", { method: "POST", body: JSON.stringify(body) }),

  list: (params: {
    page?: number;
    pageSize?: number;
    status?: string;
    availability?: string;
    workspaceId?: string;
    targetType?: string;
    code?: string;
    keyword?: string;
    assetId?: string;
    createdFrom?: string;
    createdTo?: string;
  }) => request<PageResponse<LinkListItem>>("/links", { query: params }),

  get: (linkId: string) => request<LinkDTO>(`/links/${encodeURIComponent(linkId)}`),

  updateMetadata: (linkId: string, body: UpdateLinkMetadataRequest) =>
    request<LinkDTO>(`/links/${encodeURIComponent(linkId)}/metadata`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  updateRules: (linkId: string, body: UpdateLinkRulesRequest) =>
    request<LinkDTO>(`/links/${encodeURIComponent(linkId)}/rules`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  renew: (linkId: string, body: RenewLinkRequest) =>
    request<RenewLinkResponse>(`/links/${encodeURIComponent(linkId)}/renew`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  rotateCode: (linkId: string, body: RotateCodeRequest) =>
    request<RotateCodeResponse>(`/links/${encodeURIComponent(linkId)}/rotate-code`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  resetVisits: (linkId: string) =>
    request<{ linkId: string; visitsUsed: number; maxVisits: number; resetAt: string }>(
      `/links/${encodeURIComponent(linkId)}/reset-visits`,
      { method: "POST" },
    ),

  disable: (linkId: string) =>
    request<{ linkId: string; status: string; availability: string; updatedAt: string }>(
      `/links/${encodeURIComponent(linkId)}/disable`,
      { method: "POST" },
    ),

  enable: (linkId: string) =>
    request<{ linkId: string; status: string; availability: string; updatedAt: string }>(
      `/links/${encodeURIComponent(linkId)}/enable`,
      { method: "POST" },
    ),
};

export const templatesApi = {
  create: (body: TemplateCreateRequest) =>
    request<{
      templateId: string;
      workspaceId: string;
      name: string;
      description: string;
      status: "active" | "disabled";
      latestVersion: number;
      version: TemplateVersionDTO;
      createdAt: string;
    }>("/rule-templates", { method: "POST", body: JSON.stringify(body) }),

  list: (params: {
    workspaceId?: string;
    status?: string;
    includeDeleted?: boolean;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) => request<PageResponse<TemplateListItem>>("/rule-templates", { query: params }),

  get: (templateId: string) =>
    request<TemplateDTO>(`/rule-templates/${encodeURIComponent(templateId)}`),

  update: (templateId: string, body: TemplateUpdateRequest) =>
    request<TemplateDTO>(`/rule-templates/${encodeURIComponent(templateId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  createVersion: (templateId: string, body: TemplateVersionRequest) =>
    request<TemplateVersionDTO>(`/rule-templates/${encodeURIComponent(templateId)}/versions`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listVersions: (templateId: string) =>
    request<{ templateId: string; versions: TemplateVersionListItem[] }>(
      `/rule-templates/${encodeURIComponent(templateId)}/versions`,
    ),

  getVersion: (templateId: string, version: number) =>
    request<TemplateVersionDTO>(
      `/rule-templates/${encodeURIComponent(templateId)}/versions/${version}`,
    ),

  disable: (templateId: string) =>
    request<{ templateId: string; status: string }>(
      `/rule-templates/${encodeURIComponent(templateId)}/disable`,
      { method: "POST" },
    ),

  enable: (templateId: string) =>
    request<{ templateId: string; status: string }>(
      `/rule-templates/${encodeURIComponent(templateId)}/enable`,
      { method: "POST" },
    ),

  remove: (templateId: string) =>
    request<{ templateId: string; status: string; deletedAt: string }>(
      `/rule-templates/${encodeURIComponent(templateId)}`,
      { method: "DELETE" },
    ),

  restore: (templateId: string) =>
    request<{ templateId: string; status: string; restoredAt: string }>(
      `/rule-templates/${encodeURIComponent(templateId)}/restore`,
      { method: "POST" },
    ),
};

export const assetsApi = {
  upload: (input: { businessId: string; path: string; file: File }) => {
    const fd = new FormData();
    fd.append("businessId", input.businessId);
    fd.append("path", input.path);
    fd.append("file", input.file);
    return request<AssetDTO>("/assets", { method: "POST", body: fd });
  },

  uploadWithProgress: (input: { businessId: string; path: string; file: File }, onProgress: (loaded: number, total: number) => void, signal?: AbortSignal) => {
		const fd = new FormData();
		fd.append("businessId", input.businessId);
		fd.append("path", input.path);
		fd.append("file", input.file);
		return uploadFormData<AssetDTO>("/assets", fd, onProgress, signal);
	},

  beginUpload: (body: { businessId: string; path: string; fileName: string; contentType: string; sizeBytes: number; idempotencyKey?: string }) =>
    request<UploadSessionDTO>("/assets/uploads", { method: "POST", body: JSON.stringify(body) }),

  activeUploads: () => request<{ items: UploadSessionDTO[] }>("/assets/uploads"),

  uploadPart: (sessionId: string, partNumber: number, chunk: Blob, onProgress: (loaded: number, total: number) => void, signal?: AbortSignal) =>
    uploadBinaryPart<UploadSessionDTO>(`/assets/uploads/${encodeURIComponent(sessionId)}/parts/${partNumber}`, chunk, onProgress, signal),

  uploadStatus: (sessionId: string) => request<UploadSessionDTO>(`/assets/uploads/${encodeURIComponent(sessionId)}`),

  completeUpload: (sessionId: string) => request<UploadSessionDTO>(`/assets/uploads/${encodeURIComponent(sessionId)}/complete`, { method: "POST" }),

  cancelUpload: (sessionId: string) => request<UploadSessionDTO>(`/assets/uploads/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),

  list: (params: {
    businessId?: string;
    workspaceId?: string;
    ownerUserId?: string;
    keyword?: string;
    includeDeleted?: boolean;
    page?: number;
    pageSize?: number;
  }) => request<PageResponse<AssetDTO>>("/assets", { query: params }),

  get: (assetId: string) => request<AssetDTO>(`/assets/${encodeURIComponent(assetId)}`),

  remove: (assetId: string) =>
    request<{ assetId: string; deletedAt: string; purgeAfter: string; status: string }>(
      `/assets/${encodeURIComponent(assetId)}`,
      { method: "DELETE" },
    ),

  restore: (assetId: string) =>
    request<{ assetId: string; restoredAt: string; status: string }>(
      `/assets/${encodeURIComponent(assetId)}/restore`,
      { method: "POST" },
    ),
};

export const logsApi = {
  access: (params: {
    linkId?: string;
    from?: string;
    to?: string;
    result?: string;
    reason?: string;
    workspaceId?: string;
    businessId?: string;
    linkOwnerUserId?: string;
    page?: number;
    pageSize?: number;
  }) => request<PageResponse<AccessEvent>>("/logs/access", { query: params }),

  audit: (params: {
    workspaceId?: string;
    actorUserId?: string;
    businessId?: string;
    resourceType?: string;
    resourceId?: string;
    action?: string;
    result?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) => request<PageResponse<AuditEvent>>("/logs/audit", { query: params }),

  analyticsSummary: (params: { range?: "24h" | "7d" | "30d"; timeZone?: string; workspaceId?: string }) =>
    request<AnalyticsResponse>("/analytics/summary", { query: params }),

  analyticsLink: (linkId: string, params: { range?: "24h" | "7d" | "30d"; timeZone?: string }) =>
    request<AnalyticsResponse>(`/analytics/links/${encodeURIComponent(linkId)}`, { query: params }),
};

export const adminApi = {
  getRegistrationSettings: () => request<RegistrationSettings>("/admin/settings/registration"),

  updateRegistrationSettings: (body: {
    allowPublicRegistration?: boolean;
    allowInviteRegistration?: boolean;
  }) =>
    request<RegistrationSettings>("/admin/settings/registration", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  listUsers: (params: { query?: string; role?: string; page?: number; pageSize?: number }) =>
    request<PageResponse<AdminUserItem>>("/admin/users", { query: params }),

  getUser: (userId: string) =>
    request<AdminUserItem>(`/admin/users/${encodeURIComponent(userId)}`),

  getUserQuotas: (userId: string) =>
    request<Quotas>(`/admin/users/${encodeURIComponent(userId)}/quotas`),

  updateUserQuotas: (userId: string, body: QuotaPatch) =>
    request<Quotas>(`/admin/users/${encodeURIComponent(userId)}/quotas`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  permissionCatalog: () =>
    request<{ items: PermissionCatalogItem[] }>("/admin/permissions/catalog"),

  getUserPermissions: (userId: string) =>
    request<UserPermissionsResponse>(`/admin/users/${encodeURIComponent(userId)}/permissions`),

  grantPermission: (userId: string, permissionCode: string) =>
    request<{ userId: string; code: string; enabled: boolean; changedAt: string }>(
      `/admin/users/${encodeURIComponent(userId)}/permissions/${encodeURIComponent(permissionCode)}`,
      { method: "PUT" },
    ),

  revokePermission: (userId: string, permissionCode: string) =>
    request<{ userId: string; code: string; enabled: boolean; changedAt: string }>(
      `/admin/users/${encodeURIComponent(userId)}/permissions/${encodeURIComponent(permissionCode)}`,
      { method: "DELETE" },
    ),

  revokeUnusedInvites: (body: { userId?: string; confirmAll: boolean }) =>
    request<{ revokedCount: number; revokedAt: string }>("/admin/invites/revoke-unused", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listBusinesses: (params: { status?: string; page?: number; pageSize?: number }) =>
    request<PageResponse<BusinessDTO>>("/admin/businesses", { query: params }),

  createBusiness: (body: { businessId: string; displayName: string; bucketName: string }) =>
    request<BusinessDTO>("/admin/businesses", { method: "POST", body: JSON.stringify(body) }),

  updateBusiness: (businessId: string, body: { displayName?: string; status?: "active" | "disabled" }) =>
    request<BusinessDTO>(`/admin/businesses/${encodeURIComponent(businessId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  getUserBusinesses: (userId: string) =>
    request<{ items: UserBusinessItem[] }>(`/admin/users/${encodeURIComponent(userId)}/businesses`),

  grantBusiness: (userId: string, businessId: string) =>
    request<{ userId: string; businessId: string; grantedAt: string; grantedBy: string }>(
      `/admin/users/${encodeURIComponent(userId)}/businesses/${encodeURIComponent(businessId)}`,
      { method: "PUT" },
    ),

  revokeBusiness: (userId: string, businessId: string) =>
    request<void>(
      `/admin/users/${encodeURIComponent(userId)}/businesses/${encodeURIComponent(businessId)}`,
      { method: "DELETE" },
    ),

  listUnknownShortCodes: (params: {
    from?: string;
    to?: string;
    sourceIp?: string;
    rateLimited?: boolean;
    page?: number;
    pageSize?: number;
  }) =>
    request<PageResponse<UnknownShortCodeEvent>>("/admin/security-events/unknown-short-codes", {
      query: params,
    }),

  listUserAPIKeys: (userId: string, params?: { status?: string; page?: number; pageSize?: number }) =>
    request<PageResponse<APIKeyDTO>>(`/admin/users/${encodeURIComponent(userId)}/api-keys`, {
      query: params,
    }),

  revokeAPIKey: (apiKeyId: string) =>
    request<void>(`/admin/api-keys/${encodeURIComponent(apiKeyId)}/revoke`, {
      method: "POST",
    }),
};

export const apiKeysApi = {
  list: (params?: { status?: string; page?: number; pageSize?: number }) =>
    request<PageResponse<APIKeyDTO>>("/api-keys", { query: params }),

  create: (body: CreateAPIKeyRequest) =>
    request<CreateAPIKeyResponse>("/api-keys", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (apiKeyId: string, body: UpdateAPIKeyRequest) =>
    request<APIKeyDTO>(`/api-keys/${encodeURIComponent(apiKeyId)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  disable: (apiKeyId: string) =>
    request<APIKeyDTO>(`/api-keys/${encodeURIComponent(apiKeyId)}/disable`, {
      method: "POST",
    }),

  enable: (apiKeyId: string) =>
    request<APIKeyDTO>(`/api-keys/${encodeURIComponent(apiKeyId)}/enable`, {
      method: "POST",
    }),

  revoke: (apiKeyId: string) =>
    request<APIKeyDTO>(`/api-keys/${encodeURIComponent(apiKeyId)}/revoke`, {
      method: "POST",
    }),
};
