# Cloudflare Workers Monorepo

这是一个管理多个 Cloudflare Workers 的代码库。

## Workers

- **get-npb-schedule**: 获取 NPB 赛程的 Worker
- **download-and-analysis-player-information**: 下载和分析球员信息的 Worker

## 项目结构

```
cloudflare-worker/
├── package.json              # 根 package.json，包含所有脚本
├── workers/                  # 所有 worker 的目录
│   ├── get-npb-schedule/
│   │   ├── wrangler.toml    # Worker 配置文件
│   │   ├── package.json
│   │   └── src/
│   │       └── index.js     # Worker 代码
│   └── download-and-analysis-player-information/
│       ├── wrangler.toml
│       ├── package.json
│       └── src/
│           └── index.js
└── README.md
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 开发模式

运行单个 worker：

```bash
# 运行 get-npb-schedule
npm run dev:npb-schedule

# 运行 download-and-analysis-player-information
npm run dev:player-info
```

### 3. 部署

部署单个 worker：

```bash
# 部署 get-npb-schedule
npm run deploy:npb-schedule

# 部署 download-and-analysis-player-information
npm run deploy:player-info
```

部署所有 workers：

```bash
npm run deploy:all
```

## 配置

### Wrangler 配置

每个 worker 都有自己的 `wrangler.toml` 配置文件，可以在其中配置：

- Worker 名称
- 环境变量
- KV 命名空间
- R2 存储桶
- Durable Objects
- 等等

### 环境变量

如果需要使用环境变量，可以在每个 worker 目录下创建 `.dev.vars` 文件（开发环境）：

```bash
# workers/get-npb-schedule/.dev.vars
API_KEY=your-api-key
SECRET=your-secret
```

生产环境的环境变量需要通过 `wrangler secret put` 命令设置：

```bash
cd workers/get-npb-schedule
npx wrangler secret put API_KEY
```

## 认证

首次部署前，需要登录 Cloudflare 账户：

```bash
npx wrangler login
```

## 文档

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [Workers API 参考](https://developers.cloudflare.com/workers/runtime-apis/)

