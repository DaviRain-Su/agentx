# gstack 使用说明

## 安装状态

✅ **gstack 已成功安装**到 `.pi/skills/gstack/`

### 安装步骤（已执行）

```bash
# 1. 克隆 gstack 仓库（保留 .git）
cd /Users/davirian/dev/zig/gradience/.pi/skills
git clone --depth 1 https://github.com/garrytan/gstack.git

# 2. 运行 setup 脚本（需要 .git 来检查版本）
cd gstack
./setup

# 3. 构建完成后，可选删除 .git 目录
rm -rf .git
```

**注意**: setup 脚本需要 .git 目录来检查版本信息，所以必须先克隆，运行 setup，然后再删除 .git。

## 什么是 gstack？

gstack 是 Y Combinator CEO Garry Tan 创建的一套 AI 辅助开发工具，将 AI Agent 转变为一个"虚拟工程团队"。

## 核心概念

### 虚拟团队角色

| 命令 | 角色 | 用途 |
|------|------|------|
| `/office-hours` | YC Office Hours | 产品构思、问题重新定义 |
| `/plan-ceo-review` | CEO | 战略审查、范围决策 |
| `/plan-eng-review` | Eng Manager | 架构锁定、技术规划 |
| `/plan-design-review` | Senior Designer | 设计审查、AI Slop 检测 |
| `/review` | Staff Engineer | 代码审查、Bug 发现 |
| `/qa` | QA Lead | 测试应用、修复 Bug |
| `/ship` | Release Engineer | 同步、测试、发布 |

### 专业工具

| 命令 | 角色 | 用途 |
|------|------|------|
| `/browse` | QA Engineer | 真实浏览器操作 |
| `/codex` | Second Opinion | OpenAI Codex 独立审查 |
| `/cso` | Chief Security Officer | OWASP + STRIDE 审计 |
| `/careful` | Safety Guardrails | 破坏性命令警告 |
| `/freeze` | Edit Lock | 限制编辑范围 |
| `/guard` | Full Safety | careful + freeze |
| `/retro` | Eng Manager | 团队回顾 |

## 使用方法

### 1. 启动 pi code agent

确保你在 gradience 项目目录中：

```bash
cd /Users/davirian/dev/zig/gradience
```

### 2. 使用 gstack 技能

在 pi 的交互界面中，直接输入斜杠命令：

```
/office-hours
```

或者带参数：

```
/office-hours 我想设计一个去中心化的 Agent 协议网络
```

### 3. 典型工作流程

```
1. /office-hours    → 重新定义问题
2. /plan-ceo-review → 战略审查
3. /plan-eng-review → 架构规划
4. [编写代码/文档]
5. /review          → 代码审查
6. /qa              → 测试
7. /ship            → 发布
```

## 首次使用设置

### 1. 安装 Bun（如果需要浏览器功能）

```bash
curl -fsSL https://bun.sh/install | bash
```

### 2. 构建 gstack 二进制工具

```bash
cd /Users/davirian/dev/zig/gradience/.pi/skills/gstack
./setup
```

### 3. 配置环境变量（可选）

```bash
cp .pi/skills/gstack/.env.example .pi/skills/gstack/.env
# 编辑 .env 文件配置必要的 API 密钥
```

## 应用到 Gradience 项目

gstack 的工作流程非常适合 Gradience 的协议设计：

### 1. 使用 `/office-hours` 进行产品诊断

```
/office-hours 设计一个去中心化的 AI Agent 协议网络
```

这将帮助你：
- 重新定义问题
- 找到最窄的切入点
- 验证需求真实性

### 2. 使用 `/plan-ceo-review` 进行战略审查

```
/plan-ceo-review 多链架构设计
```

这将帮助你：
- 评估不同架构选择的优劣
- 确定 MVP 范围
- 制定路线图

### 3. 使用 `/plan-eng-review` 进行技术规划

```
/plan-eng-review P2P 网络层设计
```

这将帮助你：
- 锁定技术架构
- 设计数据流
- 规划测试策略

### 4. 使用 `/review` 审查文档和代码

```
/review docs/architecture/03-network-layer.md
```

这将帮助你：
- 发现文档中的问题
- 检查逻辑一致性
- 提出改进建议

## 关键理念借鉴

### Completeness Principle (Boil the Lake)

> AI 让完整实现的边际成本趋近于零。当呈现选项时：
> - 如果选项 A 是完整实现（全覆盖、所有边界情况），选项 B 是捷径——**总是推荐 A**
> - 80 行和 150 行的差异在 AI 辅助下毫无意义
> - "足够好"是错误的直觉，当"完整"只多花费几分钟时

应用到 Gradience：
- 设计协议时追求完整性
- 不要跳过边界情况和错误处理
- 文档要完整，不要留 TODO

### 角色分工

| 角色 | 职责 | Gradience 应用 |
|------|------|----------------|
| CEO | 战略、范围、愿景 | 协议定位、竞争分析 |
| Eng Manager | 架构、技术决策 | 网络层、共识机制设计 |
| Designer | 用户体验、API 设计 | 开发者体验、SDK 设计 |
| QA | 测试、验证 | 协议正确性验证 |
| Security Officer | 安全审计 | 密码学、经济安全 |

### 工作流程

```
Think → Plan → Build → Review → Test → Ship → Reflect

1. Think: /office-hours - 理解问题
2. Plan: /plan-* - 制定计划
3. Build: 实现代码/文档
4. Review: /review - 审查
5. Test: /qa - 验证
6. Ship: /ship - 发布
7. Reflect: /retro - 回顾
```

## 故障排除

### 技能未识别

如果 pi 没有识别 gstack 技能，检查：

1. 目录结构是否正确：
   ```
   .pi/skills/gstack/
   ├── office-hours/SKILL.md
   ├── review/SKILL.md
   └── ...
   ```

2. SKILL.md 格式是否正确：
   ```yaml
   ---
   name: skill-name
   description: Skill description
   ---
   ```

### 二进制工具找不到

```bash
# 添加 gstack bin 到 PATH
export PATH="/Users/davirian/dev/zig/gradience/.pi/skills/gstack/bin:$PATH"
```

### 浏览器功能不可用

```bash
# 进入 browse 目录安装依赖
cd /Users/davirian/dev/zig/gradience/.pi/skills/gstack/browse
bun install
```

## 学习资源

- [gstack 完整文档](.pi/skills/gstack/README.md)
- [技能详细说明](.pi/skills/gstack/SKILL.md)
- [架构设计](.pi/skills/gstack/ARCHITECTURE.md)
- [使用哲学](.pi/skills/gstack/ETHOS.md)

## 更新 gstack

```bash
cd /Users/davirian/dev/zig/gradience/.pi/skills/gstack
git init
git remote add origin https://github.com/garrytan/gstack.git
git pull origin main
./setup
```

---

**提示**: gstack 是一个强大的工具，但记住它是辅助你思考，而不是替代你思考。最好的使用方式是结合你的领域专业知识，让 gstack 帮助你结构化思考和发现盲点。
