# Siming SDK for Unity 6

提供 JSON 合并/分片加载、剧情会话、变量、异步业务事件、多语言和最小播放状态接口。

导入 **Basic Dialogue** 示例，把其 `RuntimeData` 复制到 `Assets/StreamingAssets/Siming/`，在场景物体上添加 `BasicDialogue` 即可播放。

三个程序集：`Siming.Runtime`、`Siming.Serialization.Json`、`Siming.Unity`。只需要运行核心的宿主可直接创建 `SimingProject` 和 `DialogueSession`；Unity 包装组件为 `SimingPlayer`。运行核心不引用 Unity API。

完整 API、存档边界、错误处理、构建和验证说明见包内 [SDK-GUIDE.md](SDK-GUIDE.md)。
