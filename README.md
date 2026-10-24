# Stub 短链前端 (`shortlink_web`)

受控短链与 MinIO 业务素材分发平台 Web 端（产品着陆页、认证注册页、用户控制台与管理员治理后台），对接 `D:\Go_All\short_links\back` 后端 API。

## 核心功能

- **产品着陆页 (`/`)**：快速造链演示、能力矩阵、三选一规则来源演示与状态页矩阵。
- **认证与注册 (`/login`, `/register`, `/reset-password`)**：密码登录（自动携带 `X-Client-App: shortlink_web`）、邀请码/公开注册（自动识别 `?inviteCode=` 参数）、邮箱验证码找回密码。
- **用户控制台 (`/console/*`)**：
  - 概览与统计趋势（十进制 MB 存储额度、短链配额、24h/7d/30d 四维统计指标与失败原因分布）
  - 短链管理（新建短链、单链趋势、续期恢复、更换短码、重置访问次数、启停）
  - MinIO 托管素材（按业务桶上传、7 天回收站恢复、一键从素材创建短链）
  - 规则模板（不可变版本历史 `v1, v2...`、启停、软删除与恢复）
  - 邀请码管理（单次 7 天内邀请码生成、一次性明文复制、作废）
  - 访问日志与操作审计日志查询
  - 账号权限与多端会话管理（每 5 分钟自动发送 `/api/v1/me/sessions/heartbeat`）
- **管理员治理 (`/console/admin/*`)**：
  - 用户权限开关、业务桶授权与配额调整
  - MinIO 业务即桶登记 (`bucketName = businessId`)
  - 全局注册模式开关 (`allowPublicRegistration` / `allowInviteRegistration`)
  - 未知短码与探测安全事件查询

## 快速开始

```bash
cd D:\Go_All\short_links\front
npm install
npm run dev
```

默认开发端口为 `http://localhost:5173`，Vite 已配置将 `/api` 与 `/r/` 代理至 `VITE_API_PROXY_TARGET`（默认 `http://localhost:8588`）。

## Docker 部署

CI (GitHub Actions) 在每次 push `master` 后自动构建并推送镜像到 GHCR, 任何有 Docker 的机器可直接使用:

```bash
# <owner> = 仓库所有者的 GitHub 用户名 (即 git 提交人 / 仓库 owner)
# 例: 仓库为 jimoying/Stub_front 时, 镜像为 ghcr.io/jimoying/stub-front
docker pull ghcr.io/<owner>/stub-front:latest

# 移除旧容器 (如有)
docker rm -f stub-front

# 运行: API_UPSTREAM 指向 Stub 后端地址 (必填)
docker run -d --name stub-front -p 8000:80 \
  -e API_UPSTREAM=https://<你的后端地址> \
  ghcr.io/<owner>/stub-front:latest
```

访问 `http://<主机>:8000` 即可。

说明:

- `API_UPSTREAM` 必填, 容器内 nginx 会把 `/api` 与 `/r/` 同源反代到该后端;
- GHCR 镜像包默认 private: 拉取前需 `docker login ghcr.io` (GitHub 用户名 + 带 `read:packages` 权限的 PAT), 或到 GitHub → Packages 里将该包改为 public;
- 构建参数、本地部署与故障排查详见 [DEPLOY.md](DEPLOY.md)。
