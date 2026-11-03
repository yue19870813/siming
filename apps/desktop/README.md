# 司命桌面应用

正式桌面应用骨架，使用 React 19、TypeScript、Vite、Tailwind CSS 4 和 Tauri 2。

```bash
npm install
npm run dev
npm run tauri -- dev
```

质量检查：

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

`prototype/` 是产品交互稿与在线预览，不参与正式桌面应用构建。

## 枚举条件分支

选中条件节点，在节点属性中把“分支模式”切换为“枚举分支（Switch / Case）”，选择判断变量，再添加各 Case 值。每项 Case 和默认分支都有独立出口，需要分别连接后续节点。

Case 值须与变量类型一致且互不重复；支持字符串、数字和布尔值。运行时按类型严格匹配，未匹配时走默认出口。修改 Case 值会保留连线；删除 Case 会移除该出口的连线。切换布尔/枚举模式会在确认后清除原有出口连线，可撤销。

源文件将枚举配置保存在节点的 `data.switch` 中。发布时编译为原有条件节点判断链，保持现有运行时格式及 C# SDK 兼容；宿主事件仅附在判断链入口，执行一次。
