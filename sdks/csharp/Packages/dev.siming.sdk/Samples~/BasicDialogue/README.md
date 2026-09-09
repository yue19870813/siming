# Basic Dialogue

1. 在 Package Manager 导入此示例。
2. 把 `RuntimeData/` 中的文件和子目录复制到 `Assets/StreamingAssets/Siming/`，保留目录结构。
3. 在空场景创建 GameObject，添加 `BasicDialogue` 组件并进入播放模式。

示例使用 IMGUI，不需要配置 Canvas 或预制体。接受任务演示变量写入、嵌套条件、异步事件及自动对白；稍后再来走另一条分支。按钮可切换语言或由宿主捕获/恢复内存中的播放位置和变量。它不写入存档文件。

正式项目只需使用 `SimingPlayer` 或直接调用核心 SDK，换成自己的 UI、变量库和业务事件执行器。示例变量声明只对应随包提供的 demo 数据。
