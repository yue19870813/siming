# 司命（Siming）

司命（Siming）是一个面向游戏和互动叙事的跨平台剧情对话编辑器。它将对白、选项、条件分支、变量和业务事件组织成可视化剧情图，并把项目编译为与引擎无关的运行时数据，供 Unity、Unreal Engine 或自研宿主接入。

![司命 Logo](./docs/assets/brand/siming-logo-light.png)

> 本仓库包含桌面编辑器、Rust 核心与 CLI、运行时数据契约，以及 C# / Unity 6 SDK。

## 功能概览

- **可视化剧情编辑**：通过节点和连线编排对白、选项、条件、事件和结束节点。
- **分支与条件判断**：支持基于变量的剧情分支，以及玩家选择驱动的多路径流程。
- **多语言文本**：项目可配置多个语言，导出时生成独立的本地化资源。
- **宿主事件与业务事件**：节点可以发送表现层通知，也可以调用由游戏宿主实现的异步业务事件。
- **运行时导出**：支持 JSON、XML 和二进制格式；支持合并导出与按目录分片导出。
- **工程校验与迁移**：CLI 和共享核心提供 Schema 校验、警告升级、项目迁移和导出前检查。
- **C# / Unity SDK**：提供纯 C# 播放运行库、变量与事件接入、多语言切换、播放状态捕获/恢复和 Unity 6 UPM 包。

## 快速开始

### 环境要求

- Node.js 22.13 或更高版本
- Rust stable，且包含 `rustfmt` 和 `clippy`
- 运行 Tauri 2 所需的当前平台系统依赖
- 使用 C# SDK 时需要 .NET 8 或更高版本；Unity 接入目标为 Unity 6

### 启动桌面编辑器

```bash
cd apps/desktop
npm install

# 启动 Vite 前端
npm run dev

# 启动 Tauri 桌面应用
npm run tauri -- dev
```

`prototype/` 是产品交互稿和私有预览，不参与正式桌面应用构建。

### 使用示例项目和 CLI

仓库提供了一个最小固定项目：[`fixtures/minimal-project`](./fixtures/minimal-project)。可以用它验证项目格式、运行 CLI，并生成运行时产物。

```bash
# 查看 CLI 版本
cargo run -p siming-cli -- --version

# 校验项目
cargo run -p siming-cli -- validate fixtures/minimal-project

# 查看项目摘要
cargo run -p siming-cli -- info fixtures/minimal-project

# 导出到指定目录
cargo run -p siming-cli -- export fixtures/minimal-project \
  --output /tmp/siming-runtime \
  --format json \
  --layout directory-chunks \
  --pretty
```

导出完成后，`/tmp/siming-runtime` 中的文件就是宿主或 SDK 要读取的运行时数据。省略 `--format` 和 `--layout` 时，将使用项目 `.siming/project.json` 中的默认设置。

## CLI 使用说明

CLI 的完整入口是 `siming`；在源码仓库中可使用 `cargo run -p siming-cli --` 代替已安装的 `siming`。

| 命令 | 用途 | 示例 |
| --- | --- | --- |
| `validate` | 校验项目结构、引用、文本和运行时约束 | `siming validate . --warnings-as-errors` |
| `export` | 编译并导出运行时数据 | `siming export . --output exports/runtime --format json` |
| `migrate` | 检查或写入 Schema 迁移 | `siming migrate . --check` / `siming migrate . --write` |
| `info` | 查看项目 Schema、语言、内容数量和校验摘要 | `siming info . --format json` |

常用命令：

```bash
# 输出机器可读的校验结果
siming validate . --format json

# 导出 JSON、XML 或二进制运行时数据
siming export . --output exports/runtime --format json --pretty
siming export . --output exports/runtime --format xml --pretty
siming export . --output exports/runtime --format binary

# 选择文件组织方式
siming export . --output exports/runtime --layout bundled
siming export . --output exports/runtime --layout directory-chunks

# 迁移前检查；执行写入迁移时会自动生成备份
siming migrate . --check
siming migrate . --write
```

退出码为：`0` 成功，`1` 校验或编译失败，`2` 参数、路径或版本错误，`3` 未预期的内部错误。

## 项目结构

```text
apps/desktop/          React + Tauri 正式桌面应用
crates/siming-core/    共享数据契约、校验与运行时编译核心
crates/siming-storage/ 项目读取、迁移与安全导出边界
crates/siming-cli/     独立命令行程序
schemas/               版本化 JSON Schema
fixtures/              GUI、CLI 和迁移共用固定样例
examples/              引擎无关的运行时读取示例
sdks/csharp/           纯 C# 运行库、Unity 6 包、示例和测试
prototype/             产品交互稿与私有在线预览
```

一个项目通常包含以下内容：

```text
my-project/
├── .siming/project.json       # 项目清单、语言和导出设置
├── dialogues/                 # 对话图文件
├── definitions/               # 角色、变量、事件和标签定义
└── exports/runtime/           # CLI 生成的运行时数据
```

## 运行时导出格式

### 合并布局（`bundled`）

适合一次性加载整个项目：

```text
exports/runtime/
├── manifest.json
├── dialogues.runtime.json
└── locales/
    ├── zh-CN.json
    └── en-US.json
```

### 目录分片布局（`directory-chunks`）

适合按章节、场景或对话按需加载。项目索引和对话结构、语言资源会拆成多个文件，宿主可根据对话入口只读取需要的分片。

JSON 运行时产物的结构契约见：

- [`schemas/runtime.schema.json`](./schemas/runtime.schema.json)
- [`schemas/runtime-index.schema.json`](./schemas/runtime-index.schema.json)
- [`schemas/runtime-dialogue-chunk.schema.json`](./schemas/runtime-dialogue-chunk.schema.json)
- [`schemas/runtime-locale-chunk.schema.json`](./schemas/runtime-locale-chunk.schema.json)

运行时格式、节点推进规则、文本键和二进制协议详见[运行时格式文档](./docs/运行时格式.md)。仓库还提供了一个不依赖特定引擎的读取示例：

```bash
node examples/runtime-reader/index.mjs exports/runtime intro zh-CN
```

## C# / Unity SDK 接入

C# SDK 消费 `siming export` 生成的运行时数据，不依赖 Rust 原生库，也不负责 UI、音视频、任务系统或存档文件写入。SDK 包含：

- 通用 .NET 运行库：`Siming.Runtime` 与 `Siming.Serialization.Json`
- Unity 6 UPM 包：`sdks/csharp/Packages/dev.siming.sdk`
- JSON 合并布局与目录分片布局加载
- 对话播放、选项、自动对白、变量、条件和异步业务事件
- 宿主事件通知、多语言切换和宿主管理的播放状态捕获/恢复

### .NET 控制台接入

在 .NET 项目中引用 SDK 后，使用 JSON 加载器打开导出目录并创建会话：

```csharp
using Siming;
using Siming.Serialization.Json;

using var project = await SimingProject.OpenAsync(
    new JsonProjectLoader(new DirectoryDataSource("exports/runtime")),
    cancellationToken);

using var session = project.CreateSession(
    businessEvents: new GameEvents(),
    locale: "zh-CN");

session.StateChanged += view =>
{
    Console.WriteLine($"{view.SpeakerName}: {view.Text}");
};

session.HostEventReceived += message =>
{
    // 播放音效、切换镜头、播放动画等表现层通知
    HandleHostEvent(message);
};

await session.StartByKeyAsync("intro", cancellationToken);

if (session.Current.Status == SessionStatus.WaitingDialogue)
{
    await session.ContinueAsync(cancellationToken);
}
else if (session.Current.Status == SessionStatus.WaitingChoice)
{
    await session.ChooseAsync(choiceId, cancellationToken);
}
```

业务事件由宿主实现 `IBusinessEventHandler`：

```csharp
sealed class GameEvents : IBusinessEventHandler
{
    public async Task ExecuteAsync(
        string name,
        DataValue parameters,
        BusinessEventContext context,
        CancellationToken cancellationToken)
    {
        switch (name)
        {
            case "quest.begin":
                await BeginQuestAsync(parameters, cancellationToken);
                context.Set("accepted", new VariableValue(true));
                break;
            default:
                throw new InvalidOperationException($"Unknown event: {name}");
        }
    }
}
```

| API | 用途 |
| --- | --- |
| `SimingProject.OpenAsync(...)` | 打开并校验运行时清单、索引和默认语言资源 |
| `CreateSession(...)` | 创建独立会话，可注入变量存储和业务事件处理器 |
| `StartAsync(...)` / `StartByKeyAsync(...)` | 从对话 ID 或入口 Key 开始播放 |
| `ContinueAsync(...)` | 推进等待中的对白 |
| `ChooseAsync(choiceId, ...)` | 选择一个选项 |
| `TickAsync(deltaSeconds, ...)` | 由宿主驱动自动对白计时 |
| `SetLocaleAsync(locale, ...)` | 切换当前会话语言 |
| `CaptureState()` / `RestoreStateAsync(...)` | 捕获或恢复安全等待点的最小播放状态 |
| `Stop()` / `Dispose()` | 停止会话并释放资源 |

回调中不要直接调用推进、切换语言、捕获或恢复接口，以免重入；应把后续操作交给下一次宿主更新。SDK 不会替宿主写入存档，宿主应将播放状态和变量值作为一致的存档保存。

### Unity 6 接入

1. 在 Unity Package Manager 中选择 **Install package from disk**。
2. 选择 [`sdks/csharp/Packages/dev.siming.sdk/package.json`](./sdks/csharp/Packages/dev.siming.sdk/package.json)。
3. 将 `siming export` 生成的运行时目录放入 `Assets/StreamingAssets/Siming/`，或实现自定义 `IRuntimeDataSource`（例如 Addressables、内存或远程资源）。
4. 安装 **Basic Dialogue** 示例，参考其中的 `BasicDialogue` 组件创建播放入口。

Unity 中所有 SDK 调用、事件处理器以及对 Unity 对象的操作都应在主线程完成。自动对白默认由宿主通过 `TickAsync` 驱动；示例组件支持按 `timeScale` 或真实时间推进。

完整安装说明、API 约束、存档恢复、错误码和 Unity 验证命令见 [C# SDK 接入文档](./sdks/csharp/README.md) 和 [SDK 指南](./sdks/csharp/Packages/dev.siming.sdk/SDK-GUIDE.md)。

## 开发与验证

```bash
# Rust
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace

# 桌面端
cd apps/desktop
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run tauri -- build --no-bundle

# C# SDK（从仓库根目录执行）
dotnet run --project sdks/csharp/tests/Siming.Tests
dotnet run --project sdks/csharp/examples/Console -- \
  sdks/csharp/contracts/directory-chunks sdk_demo en-US
```

生成 SDK 测试契约和本地包：

```bash
python3 sdks/csharp/scripts/generate-contracts.py
python3 sdks/csharp/scripts/package.py
```

## 文档索引

- [产品需求文档](./docs/产品需求文档.md)
- [技术方案](./docs/技术方案.md)
- [运行时格式与宿主接入](./docs/运行时格式.md)
- [C# SDK 文档](./sdks/csharp/README.md)
- [C# SDK 指南](./sdks/csharp/Packages/dev.siming.sdk/SDK-GUIDE.md)
- [CLI 与数据契约示例](./examples/runtime-reader/README.md)
- [English documentation](./README.md)

## License

Siming 使用 [Apache License 2.0](./LICENSE) 发布。
