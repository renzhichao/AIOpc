# Mock Feishu OAuth Service Dockerfile

# 开发环境镜像
FROM node:22-alpine AS development

WORKDIR /app

# 安装依赖
COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install

# 复制源代码
COPY . .

# 暴露端口
EXPOSE 3000

# 启动开发服务器
CMD ["pnpm", "run", "dev"]

# 生产环境镜像
FROM node:22-alpine AS production

WORKDIR /app

# 安装依赖
COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --prod

# 复制构建产物
COPY dist ./dist

# 暴露端口
EXPOSE 3000

# 启动生产服务器
CMD ["node", "dist/server.js"]
