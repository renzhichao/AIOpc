# AIOpc Frontend Dockerfile
# Multi-stage build for development and production

################################################################################
# 开发环境镜像
################################################################################
FROM node:22-alpine AS development

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制 package.json
COPY package.json pnpm-lock.yaml* ./

# 安装依赖
RUN pnpm install

# 复制源代码
COPY . .

# 暴露端口
EXPOSE 5173

# 开发模式启动命令 (Vite dev server)
CMD ["pnpm", "run", "dev", "--", "--host", "0.0.0.0"]

################################################################################
# 构建阶段
################################################################################
FROM node:22-alpine AS build

# 接受构建参数
ARG VITE_API_URL=http://localhost:3000
ARG VITE_APP_NAME=AIOpc

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制 package.json
COPY package.json pnpm-lock.yaml* ./

# 安装所有依赖
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建生产版本
# Set NODE_ENV=production to ensure .env.production is loaded by Vite
# 将构建参数设置为环境变量，供Vite使用
ENV NODE_ENV=production
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_APP_NAME=${VITE_APP_NAME}
RUN pnpm run build

################################################################################
# 生产环境镜像
################################################################################
FROM node:22-alpine AS production

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 设置 NODE_ENV
ENV NODE_ENV=production

# 复制 package.json
COPY package.json pnpm-lock.yaml* ./

# 仅安装生产依赖
RUN pnpm install --prod --frozen-lockfile

# 从构建阶段复制构建产物
COPY --from=build /app/dist ./dist

# 复制其他必要文件
COPY package.json ./

# 使用 nginx 提供静态文件服务 (可选)
# 或者使用简单的 HTTP 服务器
RUN npm install -g serve

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S opclaw -u 1001 && \
    chown -R opclaw:nodejs /app

USER opclaw

# 暴露端口
EXPOSE 5173

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5173', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 生产模式启动命令
# -s dist: 服务静态文件目录
# -l 0.0.0.0:5173: 监听所有网络接口的5173端口
CMD ["npx", "serve", "-s", "dist", "-l", "0.0.0.0:5173"]
