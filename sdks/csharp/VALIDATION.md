# C# SDK 验证记录

验证环境：macOS Apple Silicon、.NET SDK 9.0.305（测试目标 .NET 8）、Unity 6000.3.13f1。记录日期：2026-09-08。

| 项目 | 结果 |
| --- | --- |
| .NET Standard 2.1 核心与 JSON 程序集 | 编译通过，零警告 |
| .NET 契约测试 | 17 组通过；每种布局独立覆盖六类节点、变量、事件、恢复、多语言、错误数据和循环保护 |
| Rust 导出及模拟器参考 | 两种 JSON 布局由真实导出器生成；接受/拒绝分支与 Rust 模拟器的节点、消息、业务事件和变量结果一致 |
| 生成可重复性 | 导出文件、参考轨迹、Unity 示例数据与 GUID 元数据重复生成后无变化 |
| 控制台示例 | 实际输入接受选项，成功执行任务事件并完成 |
| Unity 6 编辑器 | 批处理进入 Play Mode，加载 StreamingAssets、切换语言、恢复位置、完成异步事件和分支，输出 `SIMING_UNITY_SMOKE_PASS` |
| macOS IL2CPP | Universal 构建通过，High managed stripping；Apple Silicon 独立 Player 执行通过，输出 `SIMING_UNITY_SMOKE_PASS` |
| Android / iOS | 未验收：本机 Unity 仅安装 MacStandaloneSupport，没有对应构建模块及真机环境 |
| Windows / Linux Player | 未在本机验收 |
| WebGL | 不在首版支持承诺内 |

Unity 测试以无图形方式运行，验证加载、主线程异步执行、会话行为和 AOT/裁剪兼容性，不代表对所有分辨率或设备完成视觉验收。示例 UI 使用 IMGUI，可手动导入包后直接播放。

首次创建测试工程时，Unity 编辑器自己的 QuickSearch 索引曾报告异常；SDK 播放流程仍通过。SDK 验收依据是测试标记及进程成功退出，不把编辑器网络服务日志作为运行时结果。

本地日志和构建位于忽略跟踪的 `artifacts/`：`unity-play.log`、`unity-build.log`、`unity-player.log`。完整复现命令见 README。GitHub Actions 已配置 .NET 测试、Rust 参考产物一致性检查及包构建；尚未在远端运行。Unity 检查需有许可证及对应平台模块的本地/自托管执行环境。
