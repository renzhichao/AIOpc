# AIOpc Backend Dockerfile
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

# 安装依赖 (使用 pnpm)
RUN pnpm install

# 复制源代码
COPY . .

# 暴露端口
EXPOSE 3000

# 开发模式启动命令 (使用 nodemon)
CMD ["pnpm", "run", "dev"]

################################################################################
# 构建阶段
################################################################################
FROM node:22-alpine AS build

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制 package.json
COPY package.json pnpm-lock.yaml* ./

# 安装所有依赖 (包括 devDependencies)
RUN pnpm install --frozen-lockfile

# 复制源代码
COPY . .

# 构建 TypeScript
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
COPY ormconfig.js ./
COPY package.json ./

# 创建非 root 用户
RUN addgroup -g 1001 -S nodejs && \
    adduser -S opclaw -u 1001 && \
    chown -R opclaw:nodejs /app

USER opclaw

# 暴露端口
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# 生产模式启动命令
CMD ["node", "dist/app.js"]
