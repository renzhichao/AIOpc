# AIOpc - AI基础服务平台

## 项目概述

为电商公司部署OpenClaw AI Agent基础设施，为财务和电商部门建立AI能力。

## 项目结构

```
AIOpc/
├── docs/           # 技术方案、架构设计、运维文档
├── scripts/        # 部署、运维脚本
├── platform/       # 运营平台代码
├── config/         # 配置文件
└── deployment/     # 部署清单和模板
```

## 技术栈

- **AI基础设施**: OpenClaw (基于DeepSeek-V3/Qwen)
- **运行时**: Node.js v22
- **IM集成**: 飞书、邮件
- **部署**: Docker容器化

## 核心能力

- 25个Tools: 文件操作、命令执行、网络访问、自动化等
- 53个Skills: 办公、开发、通讯、数据处理等场景
- 三层安全体系: 核心能力、进阶能力、知识层
