# Siming C# SDK 0.1

纯 C# 剧情运行库，支持现有 JSON 合并和目录分片导出；附带 Unity 6 UPM 包。SDK 不依赖 Rust 原生库，不负责 UI、任务系统、音视频播放或存档文件读写。

## 安装和运行

- 通用 .NET：引用 `Siming.Serialization.Json` NuGet 包，它依赖 `Siming.Runtime`。核心目标是 .NET Standard 2.1，示例与测试使用 .NET 8。
- Unity 6：Package Manager → **Install package from disk**，选择 `Packages/dev.siming.sdk/package.json`。也可安装生成的 `.tgz`，或使用 Git URL `https://github.com/sunyingyingmu/Siming.git?path=/sdks/csharp/Packages/dev.siming.sdk`（该路径提交到远端后可用）。
- .NET 与 UPM 直接编译 `Packages/dev.siming.sdk/Runtime` 中同一份源代码，请勿同时导入 NuGet DLL 和 UPM 源码。

从仓库根目录运行：

```sh
# 真实 Rust 导出器生成两种布局，并用 Rust 模拟器生成参考轨迹。
python3 sdks/csharp/scripts/generate-contracts.py
# 失败时非零退出；测试使用固定产物，可独立于 Rust 执行。
dotnet run --project sdks/csharp/tests/Siming.Tests
# 交互式控制台示例
dotnet run --project sdks/csharp/examples/Console -- sdks/csharp/contracts/directory-chunks sdk_demo en-US
# 生成 NuGet 和 UPM 包，不发布
python3 sdks/csharp/scripts/package.py
```

产物位于 `artifacts/packages`。需要 .NET 8 或更高 SDK；Unity 适配目标为 Unity 6，WebGL 暂未纳入支持范围。

## 最小接入

```csharp
using Siming;
using Siming.Serialization.Json;

using var project = await SimingProject.OpenAsync(
    new JsonProjectLoader(new DirectoryDataSource(exportDirectory)), token);
using var session = project.CreateSession(
    businessEvents: gameEventHandler, locale: "zh-CN");
session.StateChanged += view => RenderDialogue(view);
session.HostEventReceived += notification => HandlePresentation(notification);
session.Diagnostic += error => Log(error.Code, error.Message);

await session.StartByKeyAsync("intro", token);
// 玩家确认当前对白
await session.ContinueAsync(token);
// 玩家点击选项：传入 Choices 中的稳定 Id
await session.ChooseAsync(choiceId, token);
```

`StateChanged` 包括中间运行状态；UI 应按 `Status` 判断是否展示正文或选项。回调内不能调用推进、切换语言、捕获或恢复等接口，避免重入；需要后续操作时将其交给下一次宿主更新。`Stop()` 可在回调内调用。通知异常转成 `ListenerFailure` 诊断，不阻断后续监听器或节点消息。

会话和项目的控制接口采用单线程串行调用约定；共享加载任务可供多个同线程会话并发等待。Unity 中所有调用和事件处理器对 Unity 对象的操作都必须留在主线程；SDK 不使用 `Task.Run`。不要从任意后台线程读写共享变量库。

## API 与状态

| API | 行为 |
| --- | --- |
| `SimingProject.OpenAsync(loader, token)` | 打开清单、索引和默认语言的全局文本；失败时释放 loader |
| `CreateSession(variables, businessEvents, locale)` | 默认创建独立内存变量库；可显式注入或共享存储 |
| `PreloadAsync(dialogueId, locale, token)` | 预加载目标对话，完成后允许清理缓存 |
| `ClearUnusedChunks()` | 清理无活动会话引用的已完成分片加载 |
| `StartAsync(id)` / `StartByKeyAsync(key)` | 从入口开始；允许未启动、停止、完成或故障的会话启动 |
| `ContinueAsync()` / `ChooseAsync(id)` | 仅对白等待或选项等待状态允许对应操作 |
| `TickAsync(deltaSeconds)` | 宿主提供经过秒数，自动推进；每次调用最多越过一条自动对白 |
| `SetLocaleAsync(locale)` | 仅等待状态允许；原子更新当前显示，保留访问序号和剩余计时 |
| `CaptureState()` / `RestoreStateAsync(state)` | 安全等待点的最小状态接口，不持久化 |
| `Stop()` / `Dispose()` | 取消运行、撤销事件上下文并释放会话持有的分片 |

`Current` 是不可变显示快照，包含 `Status`、`DialogueId`、`NodeId`、`NodeKey`、`VisitSequence`、`Locale`、`SpeakerId`、`SpeakerName`、`Text`、`Choices`、`AutoDelayMs`、`RemainingDelayMs`、`Error`。计时递减会更新 `Current`，无需每帧广播 `StateChanged`。

状态依次按流程进入 `NotStarted`、`Running`、`WaitingDialogue` / `WaitingChoice` / `WaitingEvent`，最后到 `Completed`、`Stopped` 或 `Faulted`。完成时释放分片，最后一个显示快照仍可读取。非法操作直接抛出结构化错误，不破坏等待状态。有效操作的执行错误进入故障状态；语言切换或恢复失败保留原位置。取消启动/推进会停止会话；取消语言切换/恢复保留原位置。调用方应观察返回的 Task 并处理异常。

## 变量与业务事件

```csharp
public async Task ExecuteAsync(string eventName, DataValue parameters,
    BusinessEventContext context, CancellationToken cancellationToken)
{
    switch (eventName)
    {
        case "quest.begin":
            await quests.BeginAsync(parameters.Fields["quest"].Scalar.String,
                cancellationToken);
            context.Set("accepted", new VariableValue(true));
            break;
        default:
            throw new InvalidOperationException("Unknown event: " + eventName);
    }
}
```

实现 `IBusinessEventHandler` 并传入会话。SDK 执行内置 `variable.set`、`variable.add`，其他事件完成后才继续。失败不重试、不自动回滚游戏副作用，宿主需设计自己的业务一致性。停止会话会发送取消信号，之后使用该事件上下文读写变量会失败；游戏仍须主动响应取消，SDK 无法撤销已经产生的外部效果。

`IVariableStore` 只有 `Get` 和 `Set`；SDK 包装它以校验声明和类型。传入自定义存储时，宿主需保证每个已声明变量可读取。`MemoryVariableStore` 可从 `project.Info.Variables.Values` 初始化。数字为有限 `double`，不做字符串到数字等隐式转换；大于双精度精确整数范围的数值不保证整数精度，与 Rust 条件求值一致。

`DataValue` 是不可变 JSON 树，支持空值、布尔、数字、字符串、数组和对象。`Fields`、`Items` 和 `Scalar` 提供类型明确的访问；JSON 库类型不出现在公共 API 中。

`HostEventReceived` 提供消息、对话 ID、节点 ID/Key、节点访问序号和消息索引。宿主消息仅作表现通知，没有可写变量上下文，返回值不影响分支。

## 宿主保存与恢复

```csharp
var variables = new MemoryVariableStore(project.Info.Variables.Values);
using var session = project.CreateSession(variables, gameEventHandler);
// 在 Start/Continue/Choose 返回、且会话处于对白或选项等待状态后：
PlaybackState position = session.CaptureState();
var values = variables.CaptureValues();
// 宿主自行序列化、储存 position 和 values。

// 恢复时，先还原宿主变量，再恢复播放位置。
variables.RestoreValues(values);
await session.RestoreStateAsync(position);
```

`PlaybackState` 包含版本、内容指纹、对话/节点 ID、语言、访问序号、剩余毫秒。仅支持相同布局及相同导出内容；不支持在异步事件中途捕获，也不做跨内容版本迁移。恢复只刷新 UI，不再次进入节点，不重放消息、任务、奖励或其他业务事件。宿主负责将变量与播放状态作为一份一致的存档保存；外部变量库由宿主自行恢复。

## 加载与数据契约

- `IRuntimeDataSource.ReadAsync(relativePath, token)` 返回原始文件字节。自定义 Addressables、内存或远程数据源实现此接口即可；数据源由宿主管理，不由项目调用 Dispose。
- JSON 加载器拥有项目级缓存，按清单校验字节数和 SHA-256，再解析数据。并发请求复用文件加载，单个等待者取消不会影响其他等待者；释放项目时取消底层读取。
- 启动加载清单和项目索引；结构及语言分片按对话加载。活动会话持有分片，停止、完成或释放后可清理。未知版本和不完整产物拒绝加载，不把损坏的索引当合并格式重试。
- 路径须为无空段的相对路径，拒绝 `..`、反斜杠、URL 控制字符和越界路径；目录数据源拒绝可信根目录下的符号链接。
- UUID 用于对话/节点结构引用；Key 用于入口查找及日志。实际 v1 导出 `speakerId` 是角色 Key，SDK 同时兼容角色 UUID，并拒绝歧义引用。
- 已声明语言的翻译回退由导出器完成；缺失文本是错误。未知请求语言使用默认语言，不推导语言层级。
- 最多连续执行 1,000 个非交互节点。业务事件、条件和宿主消息不会重置该上限；每次玩家推进开启新的计数。自动对白以宿主时间推进，无后台计时器。

常见 `SimingException.Code`：`SessionBusy`、`InvalidAction`、`UnknownDialogue`、`UnknownChoice`、`VariableTypeMismatch`、`MissingEventHandler`、`LoopGuard`、`IntegrityFailure`、`UnsupportedVersion`、`MissingText`、`InvalidPlaybackState`。运行失败可附带 `DialogueId`、`NodeId` 和原始异常；读文件失败的消息包含路径。

## Unity 示例与验证

在 Package Manager 中导入 **Basic Dialogue** 示例。把示例 `RuntimeData` 的内容复制到 `Assets/StreamingAssets/Siming/`，在空场景创建物体并添加 `BasicDialogue` 组件，进入播放模式即可；组件自动附加 `SimingPlayer`，使用简单 IMGUI 绘制交互界面。自动计时默认受 `timeScale` 影响，设置 `UseUnscaledTime` 可改为真实经过时间。组件销毁时停止会话。

可复现本地验证：

```sh
python3 sdks/csharp/scripts/prepare-unity.py
# UNITY 指向 Unity 6 可执行程序。Play 不加 -quit，由测试结束时退出。
"$UNITY" -batchmode -nographics -projectPath "$PWD/sdks/csharp/artifacts/unity-validation" -executeMethod SimingValidation.Play -logFile "$PWD/sdks/csharp/artifacts/unity-play.log"
"$UNITY" -batchmode -nographics -quit -projectPath "$PWD/sdks/csharp/artifacts/unity-validation" -executeMethod SimingValidation.BuildMac -logFile "$PWD/sdks/csharp/artifacts/unity-build.log"
# 构建后执行 macOS Player
sdks/csharp/artifacts/unity-validation/Builds/SimingSmoke.app/Contents/MacOS/SimingSmoke -batchmode -nographics --siming-smoke -logFile "$PWD/sdks/csharp/artifacts/unity-player.log"
```

结果与未覆盖的平台见 [VALIDATION.md](VALIDATION.md)。Unity 包不需要 `link.xml` 保留全部类型：解析采用显式引用，验证构建启用 High managed stripping。
