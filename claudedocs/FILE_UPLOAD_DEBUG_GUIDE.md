# 文件上传白屏问题调试指南

## 问题描述

在飞书WebView环境中使用文件上传功能时，选择文件后出现白屏，无法回到对话界面。

## 问题分析

### 可能的原因

1. **JavaScript错误**：未捕获的异常导致React组件崩溃
2. **API请求失败**：网络问题或服务器错误未正确处理
3. **响应数据格式错误**：后端返回的数据结构不符合前端预期
4. **CORS问题**：跨域请求被阻止
5. **WebView兼容性**：飞书WebView对某些API或功能不支持
6. **内存溢出**：大文件上传导致浏览器崩溃

### 文件上传流程

```
用户选择文件
    ↓
前端验证（大小、类型）
    ↓
创建FormData
    ↓
POST /api/chat/upload
    ↓
Nginx转发（10MB限制）
    ↓
后端multer处理
    ↓
FileStorageService存储
    ↓
返回文件元数据
    ↓
前端显示预览
```

## 解决方案

### 1. 前端改进

#### 1.1 全局调试存储

在`MessageInput.tsx`中添加了全局调试日志系统：

```typescript
// 调试日志存储在window.__UPLOAD_DEBUG__
// 可通过以下方式访问：
// 1. 控制台输入: window.__UPLOAD_DEBUG__
// 2. URL参数: ?upload_debug=true
// 3. 点击上传按钮5次
```

#### 1.2 错误恢复机制

- ✅ 批量上传时单个文件失败不影响其他文件
- ✅ 显示用户友好的错误提示
- ✅ 自动清除错误消息（5秒后）
- ✅ 允许重试和继续操作

#### 1.3 详细日志记录

每个上传步骤都有详细日志：
- 文件选择和验证
- FormData创建
- API请求发起
- 响应接收和解析
- 成功/失败状态

### 2. 后端改进

#### 2.1 增强的日志记录

```typescript
logger.info('File upload requested', {
  userId,
  originalname,
  mimetype,
  size: buffer.length,
  encoding: req.file.encoding,
  fieldName: req.file.fieldname,
  clientIp: req.ip,
  userAgent: req.headers['user-agent'],
});
```

#### 2.2 文件类型验证

添加了明确的文件类型白名单：
- 图片：image/*
- PDF：application/pdf
- 文本：text/*
- JSON：application/json
- CSV：text/csv
- Excel：application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
- XML：application/xml, text/xml
- Markdown：text/markdown

#### 2.3 详细的错误消息

针对不同的错误类型返回具体的错误消息：
- 文件过大：超过10MB
- 文件类型不允许
- 存储目录不可用
- 权限被拒绝
- 磁盘空间不足

### 3. 调试工具

#### 3.1 访问调试面板

有三种方式访问调试面板：

1. **URL参数**：在URL后添加`?upload_debug=true`
   ```
   http://renava.cn?upload_debug=true
   ```

2. **点击5次**：快速点击上传按钮5次（2秒内）

3. **控制台访问**：在浏览器控制台输入
   ```javascript
   window.__UPLOAD_DEBUG__
   ```

#### 3.2 复制调试日志

调试面板有"复制日志"按钮，可以一键复制所有日志到剪贴板，便于分享给技术支持。

#### 3.3 日志内容

调试日志包含：
- 时间戳
- 日志级别（info/warn/error/success）
- 操作描述
- 相关数据（JSON格式）

### 4. 错误处理

#### 4.1 前端错误显示

错误显示为红色警告框，包含：
- 错误图标
- 错误消息
- 建议操作
- 关闭按钮

#### 4.2 错误恢复

- ✅ 单个文件失败不影响其他文件
- ✅ 可以重试失败的文件
- ✅ 可以继续发送已成功上传的文件
- ✅ 错误自动清除（5秒后）

## 测试验证

### 1. 本地测试

```bash
# 前端开发服务器
cd platform/frontend
pnpm dev

# 后端开发服务器
cd platform/backend
pnpm dev
```

### 2. 飞书WebView测试

1. 在飞书中打开应用
2. 添加`?upload_debug=true`参数
3. 尝试上传不同类型的文件
4. 查看调试面板日志
5. 复制日志分析问题

### 3. 测试用例

#### 3.1 正常上传

- [ ] 上传小文件（<1MB）
- [ ] 上传中等文件（1-5MB）
- [ ] 上传大文件（5-10MB）
- [ ] 上传多个文件

#### 3.2 错误情况

- [ ] 上传超大文件（>10MB）
- [ ] 上传不允许的文件类型
- [ ] 未登录时上传
- [ ] 网络断开时上传
- [ ] 服务器错误时上传

#### 3.3 边界情况

- [ ] 文件名为空
- [ ] 特殊字符文件名
- [ ] 中文文件名
- [ ] 超长文件名

### 4. 性能测试

- [ ] 上传时间 < 5秒（1MB文件）
- [ ] 内存使用稳定
- [ ] 无内存泄漏
- [ ] CPU使用正常

## 部署说明

### 1. 前端部署

```bash
# 构建前端
cd platform/frontend
pnpm build

# 部署到Nginx
# 将dist目录内容复制到Nginx静态文件目录
```

### 2. 后端部署

```bash
# 构建后端
cd platform/backend
pnpm build

# 重启服务
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "cd /opt/opclaw/platform && docker-compose restart backend"
```

### 3. 验证部署

```bash
# 检查后端日志
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker logs opclaw-backend --tail 50"

# 检查文件上传目录
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "ls -lh /tmp/opclaw-uploads/"
```

## 常见问题

### Q1: 白屏后如何恢复？

A: 刷新页面即可。白屏通常是由于JavaScript错误导致的，刷新后会重新加载页面。

### Q2: 如何查看飞书WebView中的错误？

A: 使用调试面板功能：
1. 添加URL参数`?upload_debug=true`
2. 或点击上传按钮5次
3. 查看调试日志
4. 复制日志分享给技术支持

### Q3: 文件上传失败怎么办？

A:
1. 查看错误提示
2. 检查文件大小（<10MB）
3. 检查文件类型（是否在允许列表中）
4. 查看调试日志了解详细错误
5. 重试上传

### Q4: 如何确认服务器端正常？

A:
1. 检查后端日志：`docker logs opclaw-backend`
2. 检查文件上传目录：`ls -lh /tmp/opclaw-uploads/`
3. 检查磁盘空间：`df -h`
4. 检查权限：`ls -ld /tmp/opclaw-uploads/`

### Q5: 为什么有些文件类型不允许？

A: 安全考虑，只允许常见的办公文件和图片类型。如需添加其他类型，请联系管理员。

## 监控指标

### 关键指标

- 文件上传成功率
- 文件上传平均时间
- 文件上传错误率
- 文件类型分布
- 文件大小分布

### 日志监控

```bash
# 查看文件上传日志
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker logs opclaw-backend | grep 'File upload'"

# 查看错误日志
ssh -i ~/.ssh/rap001_opclaw root@118.25.0.190 "docker logs opclaw-backend | grep 'Failed to upload file'"
```

## 后续优化

### 短期优化

1. 添加文件预览功能（图片、PDF）
2. 添加上传进度百分比显示
3. 添加文件大小显示
4. 优化大文件上传体验

### 长期优化

1. 支持断点续传
2. 支持分片上传
3. 添加病毒扫描
4. 添加文件水印
5. 优化存储策略

## 技术支持

如果问题仍未解决，请提供以下信息：

1. 调试日志（从调试面板复制）
2. 文件信息（类型、大小）
3. 错误提示截图
4. 浏览器和版本信息
5. 操作系统信息

技术支持联系方式：
- 邮件：support@openclaw.ai
- 微信：OpenClaw技术支持
