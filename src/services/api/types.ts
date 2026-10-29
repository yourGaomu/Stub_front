export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
}

export interface PageResponse<T> {
  items: T[];
  pagination: Pagination;
}

export interface APIErrorPayload {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}

export interface User {
  userId: string;
  email: string;
  role: "admin" | "user";
  emailVerifiedAt: string;
  invitedByUserId?: string | null;
  defaultWorkspaceId: string;
  createdAt: string;
}

export interface Session {
  sessionId: string;
  clientAppId: string;
  deviceInstanceId?: string;
  deviceName?: string;
  platform?: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  isCurrent: boolean;
  online: boolean;
}

export interface EmailCodeRequest {
  email: string;
  purpose: "register" | "password_reset";
  inviteCode?: string;
}

export interface EmailCodeResponse {
  accepted: boolean;
  expiresInSeconds: number;
  resendAvailableAt: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  verificationCode: string;
  inviteCode?: string;
}

export interface RegisterResponse {
  user: User;
  workspace: {
    workspaceId: string;
    name: string;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
  deviceInstanceId?: string;
  deviceName?: string;
  platform?: string;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresAt: string;
  user: User;
  session: Session;
}

export interface PasswordResetRequest {
  email: string;
  verificationCode: string;
  newPassword: string;
}

export interface PermissionCatalogItem {
  code: string;
  name: string;
  description: string;
}

export interface PermissionState {
  code: string;
  enabled: boolean;
  grantedAt?: string | null;
}

export interface PermissionsResponse {
  isAdmin: boolean;
  items: PermissionState[];
}

export interface UserPermissionsResponse {
  userId: string;
  isAdmin?: boolean;
  items: PermissionState[];
}

export interface UsageResponse {
  storage: {
    maxSingleFileBytes: number;
    quotaBytes: number;
    usedBytes: number;
    reservedBytes: number;
    remainingBytes: number;
  };
  urlLinks: {
    used: number;
    limit: number | null;
    remaining: number | null;
  };
  minioAssetLinks: {
    used: number;
    limit: number | null;
    remaining: number | null;
  };
  apiKeys?: {
    used: number;
    limit: number | null;
    remaining: number | null;
  };
}

export interface UploadSessionDTO {
  uploadSessionId: string;
  idempotencyKey?: string;
  status: string;
  fileName: string;
  businessId: string;
  path: string;
  sizeBytes: number;
  partSizeBytes: number;
  partCount: number;
  receivedParts: number[];
  receivedBytes: number;
  expiresAt: string;
  asset?: AssetDTO;
}

export interface InviteDTO {
  inviteId: string;
  createdByUserId: string;
  assignedRole: "user" | "admin";
  boundEmail?: string | null;
  expiresAt: string;
  redeemedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  status: "active" | "redeemed" | "expired" | "revoked";
}

export interface InviteCreateRequest {
  assignedRole: "user" | "admin";
  boundEmail?: string;
  expiresAt: string;
}

export interface InviteCreateResponse {
  inviteId: string;
  code: string;
  inviteURL: string;
  assignedRole: "user" | "admin";
  boundEmail?: string | null;
  expiresAt: string;
}

export interface PasswordPolicy {
  strategy: "fixed_cooldown" | "progressive_cooldown";
}

export interface LinkRulesInput {
  maxVisits?: number;
  allowedIpCidrs: string[];
  requirePassword: boolean;
  wrongPasswordPolicy?: PasswordPolicy;
}

export interface LinkRules {
  maxVisits: number;
  allowedIpCidrs: string[];
  requirePassword: boolean;
  wrongPasswordPolicy?: PasswordPolicy;
}

export interface TemplateRef {
  templateId: string;
  version?: number;
}

export interface LinkTargetInput {
  type: "url" | "minio_asset";
  url?: string;
  assetId?: string;
}

export interface LinkTargetDTO {
  type: "url" | "minio_asset";
  url?: string;
  assetId?: string;
  assetSizeBytes?: number;
}

export interface CreateLinkRequest {
  title?: string;
  tags?: string[];
  code?: string;
  target: LinkTargetInput;
  expiresAt?: string | null;
  accessPassword?: string;
  ruleSource: {
    type: "inline" | "template";
    rules?: LinkRulesInput;
    template?: TemplateRef;
  };
}

export interface LinkDTO {
  linkId: string;
  title: string;
  tags: string[];
  code: string;
  url: string;
  target: LinkTargetDTO;
  status: "enabled" | "disabled";
  availability: "available" | "expired" | "visit_limit_reached" | "disabled";
  rules: LinkRules;
  expiresAt?: string | null;
  visitsUsed: number;
  ruleTemplate?: TemplateRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface LinkListItem {
  linkId: string;
  title: string;
  tags: string[];
  code: string;
  url: string;
  targetType: "url" | "minio_asset";
  targetUrl?: string;
  assetId?: string;
  assetSizeBytes?: number;
  status: "enabled" | "disabled";
  availability: "available" | "expired" | "visit_limit_reached" | "disabled";
  expiresAt?: string | null;
  visitsUsed: number;
  maxVisits: number;
  createdAt: string;
}

export interface UpdateLinkMetadataRequest {
  title: string;
  tags: string[];
}

export interface UpdateLinkRulesRequest {
  expiresAt?: string | null;
  maxVisits?: number;
  allowedIpCidrs?: string[];
  requirePassword?: boolean;
  accessPassword?: string;
  wrongPasswordPolicy?: PasswordPolicy;
}

export interface RenewLinkRequest {
  expiresAt: string;
  codeStrategy?: "keep" | "generated";
}

export interface RenewLinkResponse {
  linkId: string;
  code: string;
  url: string;
  expiresAt: string;
  codeChanged: boolean;
  visitsUsed: number;
  maxVisits: number;
}

export interface RotateCodeRequest {
  strategy: "generated" | "custom";
  code?: string;
}

export interface RotateCodeResponse {
  linkId: string;
  oldCode: string;
  code: string;
  url: string;
  codeChanged: boolean;
}

export interface TemplateCreateRequest {
  workspaceId: string;
  name: string;
  description?: string;
  rules: LinkRulesInput;
}

export interface TemplateUpdateRequest {
  name?: string;
  description?: string;
}

export interface TemplateVersionRequest {
  changeNote?: string;
  rules: LinkRulesInput;
}

export interface TemplateVersionDTO {
  version: number;
  rules: LinkRules;
  changeNote?: string;
  createdAt: string;
}

export interface TemplateVersionListItem {
  version: number;
  changeNote: string;
  createdAt: string;
}

export interface TemplateDTO {
  templateId: string;
  workspaceId: string;
  name: string;
  description: string;
  status: "active" | "disabled";
  latestVersion: number;
  referencedLinkCount: number;
  latestRules: LinkRules;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateListItem {
  templateId: string;
  workspaceId: string;
  name: string;
  status: "active" | "disabled";
  latestVersion: number;
  referencedLinkCount: number;
  updatedAt: string;
}

export interface AssetDTO {
  assetId: string;
  businessId: string;
  path: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  deletedAt?: string | null;
  createdAt: string;
}

export interface BusinessItem {
  businessId: string;
  displayName: string;
}

export interface BusinessDTO {
  businessId: string;
  displayName: string;
  status: "active" | "disabled";
  bucketName: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserBusinessItem {
  businessId: string;
  displayName: string;
  grantedAt: string;
}

export interface AccessEvent {
  eventId: number;
  linkId: string;
  accessedAt: string;
  sourceIp?: string | null;
  userAgent?: string | null;
  result: "allowed" | "denied" | "challenge";
  reason?: string | null;
  consumesVisit: boolean;
  requestId?: string | null;
}

export interface AuditEvent {
  eventId: number;
  actorType: "user" | "system";
  actorId?: string | null;
  action: string;
  resourceType?: string | null;
  resourceId?: string | null;
  occurredAt: string;
  sourceIp?: string | null;
  result: "success" | "failure";
  details: Record<string, unknown>;
  requestId?: string | null;
}

export interface UnknownShortCodeEvent {
  eventId: number;
  codeFingerprint: string;
  windowStartedAt: string;
  firstOccurredAt: string;
  lastOccurredAt: string;
  eventCount: number;
  sourceIp: string;
  userAgent?: string | null;
  requestId?: string | null;
  rateLimited: boolean;
}

export interface MetricSummary {
  requestCount: number;
  visitAttemptCount: number;
  redirectCount: number;
  failureCount: number;
}

export interface MetricBucket extends MetricSummary {
  at: string;
}

export interface AnalyticsResponse {
  range: "24h" | "7d" | "30d";
  from: string;
  to: string;
  timeZone: string;
  totals: MetricSummary;
  failureReasons: { reason: string; count: number }[];
  series: MetricBucket[];
}

export interface RegistrationSettings {
  allowPublicRegistration: boolean;
  allowInviteRegistration: boolean;
  updatedAt: string;
}

export interface AdminUserItem {
  userId: string;
  email: string;
  role: "admin" | "user";
  invitedByUserId?: string | null;
  emailVerifiedAt: string;
  createdAt: string;
  defaultWorkspaceId: string;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  urlLinkQuota: number;
  urlLinkUsed: number;
  minioAssetLinkQuota: number;
  minioAssetLinkUsed: number;
  apiKeyQuota: number;
  apiKeyUsed: number;
  enabledPermissionCount: number;
  businessAccessCount: number;
}

export interface Quotas {
  maxSingleFileBytes: number;
  storageQuotaBytes: number;
  storageUsedBytes: number;
  urlLinkQuota: number | null;
  urlLinkUsed: number;
  minioAssetLinkQuota: number | null;
  minioAssetLinkUsed: number;
  apiKeyQuota: number | null;
  apiKeyUsed: number;
}

export interface QuotaPatch {
  maxSingleFileBytes?: number;
  storageQuotaBytes?: number;
  urlLinkQuota?: number;
  minioAssetLinkQuota?: number;
  apiKeyQuota?: number;
}

export type APIKeyStatus = "active" | "disabled" | "revoked";

export interface APIKeyQuota {
  maxUploadBytes: number | null;
  uploadedBytesUsed: number;
  maxCreatedLinks: number | null;
  createdLinksUsed: number;
  maxRequests: number | null;
  requestsUsed: number;
}

export interface APIKeyDTO {
  apiKeyId: string;
  name: string;
  description: string;
  keyPrefix: string;
  businessId: string;
  scopes: string[];
  allowedIpCidrs: string[];
  rateLimitPerMin: number;
  status: APIKeyStatus;
  allowAccountAccess: boolean;
  quotas: APIKeyQuota;
  maxUploadBytes?: number | null;
  maxCreatedLinks?: number | null;
  maxRequests?: number | null;
  uploadedBytesUsed?: number;
  createdLinksUsed?: number;
  requestsUsed?: number;
  expiresAt?: string | null;
  lastUsedAt?: string | null;
  lastUsedIp?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAPIKeyRequest {
  name: string;
  description?: string;
  businessId: string;
  scopes: string[];
  allowedIpCidrs?: string[];
  rateLimitPerMin?: number;
  maxUploadBytes: number | null;
  maxCreatedLinks: number | null;
  maxRequests: number | null;
  expiresAt: string | null;
  allowAccountAccess: boolean;
}

export interface CreateAPIKeyResponse extends APIKeyDTO {
  secretKey: string;
}

export interface UpdateAPIKeyRequest {
  name?: string;
  description?: string;
  businessId?: string;
  scopes?: string[];
  allowedIpCidrs?: string[];
  rateLimitPerMin?: number;
  maxUploadBytes?: number | null;
  maxCreatedLinks?: number | null;
  maxRequests?: number | null;
  expiresAt?: string | null;
  allowAccountAccess?: boolean;
}
