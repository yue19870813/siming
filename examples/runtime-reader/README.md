# Runtime reader example

先使用 `siming export` 生成运行时目录，再运行：

```bash
node examples/runtime-reader/index.mjs exports/runtime <dialogue-key> zh-CN
```

示例默认选择第一个玩家选项，适合验证运行时结构和宿主接入流程，不用于正式游戏逻辑。
