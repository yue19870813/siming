# 司命（Siming）品牌资产

## 设计概念

品牌标记以“命运印记 + 剧情分支”为核心：

- 外框借鉴现代印章与编辑器节点容器，表达“司掌、编排”。
- 中央星图从一颗主星分出不同路径，同时表达星官、剧情节点、条件分支与命运走向。
- 星图呼应“司命星君”的名称来源，但不直接使用古典人物或传统书法，保持专业工具属性。
- 紫色沿用产品界面的主色，适用于游戏叙事创作与开发工具场景。
- 应用图标采用响应式星图标记，只保留五颗高对比主星、加粗分支连线和外框；横向 Logo
  在较大展示空间中使用信息更完整的品牌标记。

## 文件

| 文件 | 用途 |
| --- | --- |
| `siming-app-icon-master.png` | 当前应用图标母版，与 V5 内容一致 |
| `siming-app-icon-master-v5.png` | 当前透明通道版应用图标 |
| `siming-app-icon-master-v4.png` | 加粗星图版应用图标 |
| `siming-app-icon-master-v3.png` | 第一版细线星图图标 |
| `siming-app-icon-master-v2.png` | 简化后的三节点应用图标 |
| `siming-app-icon-master-v1.png` | 第一版复杂图标存档 |
| `siming-mark.png` | 透明底独立品牌标记 |
| `siming-logo-light.png` | 透明底、深色文字，用于浅色背景 |
| `siming-logo-dark.png` | 透明底、白色文字，用于深色背景 |

桌面端、Windows、macOS、iOS 和 Android 所需尺寸位于
`apps/desktop/src-tauri/icons/`，由应用图标母版统一生成。

## 色彩

| 名称 | 色值 | 用途 |
| --- | --- | --- |
| Siming Violet | `#806CF5` | 主品牌色、主路径 |
| Violet Highlight | `#917FF8` | 渐变高光、选中状态 |
| Ink Black | `#101017` | 应用图标背景 |
| Paper White | `#F5F5FA` | 深色界面的文字与节点高光 |

## 使用规则

- 独立标记四周至少保留标记宽度 `12.5%` 的净空。
- 小于 32 px 时优先使用应用图标，不使用横向 Logo。
- 浅色背景使用 `siming-logo-light.png`，深色背景使用
  `siming-logo-dark.png`。
- 不改变标记比例，不旋转，不重新着色，不添加描边或投影。
- 不把标记与太极、龙、古典纹样等元素组合，避免削弱现代创作工具定位。
