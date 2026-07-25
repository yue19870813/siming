# 司命（Siming）

<img src="./docs/assets/brand/siming-logo-light.png" width="420" alt="司命（Siming）Logo">

掌管命运与叙事走向的剧情对话编辑器。
这是一个剧情对话编辑器。帮助你快速配置生产带有分支和条件判断的剧情对话。

## 工程结构

```text
apps/desktop/          React + Tauri 正式桌面应用
crates/siming-core/    共享数据契约与领域核心
crates/siming-storage/ 安全文件存储边界
crates/siming-cli/     独立命令行程序
schemas/               版本化 JSON Schema
fixtures/              GUI、CLI 和迁移共用固定样例
examples/              引擎无关的运行时读取示例
prototype/             产品交互稿与私有在线预览
```

## 开发环境

- Node.js 22.13 或更高版本
- Rust stable（包含 `rustfmt`、`clippy`）
- 当前平台对应的 Tauri 2 系统依赖

安装桌面端依赖：

```bash
cd apps/desktop
npm install
```

运行前端或桌面应用：

```bash
npm run dev
npm run tauri -- dev
```

验证完整工程：

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
cargo run -p siming-cli -- --version
cargo run -p siming-cli -- validate fixtures/minimal-project
cargo run -p siming-cli -- export fixtures/minimal-project --output /tmp/siming-runtime

cd apps/desktop
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run tauri -- build --no-bundle
```

产品与技术文档：

- [产品需求文档](./docs/产品需求文档.md)
- [技术方案](./docs/技术方案.md)
- [运行时格式与宿主接入](./docs/运行时格式.md)
