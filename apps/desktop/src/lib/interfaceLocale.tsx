import { useLayoutEffect, useRef } from "react";
import type { SystemSettings } from "../model/types";

type InterfaceLocale = SystemSettings["interfaceLocale"];

const english = new Map<string, string>([
  ["设置", "Settings"],
  ["项目设置", "Project Settings"],
  ["系统设置", "System Settings"],
  ["设置范围", "Settings Scope"],
  ["项目内容", "Project"],
  ["项目搜索", "Search"],
  ["角色", "Characters"],
  ["变量", "Variables"],
  ["业务事件", "Events"],
  ["标签", "Tags"],
  ["欢迎页", "Welcome"],
  ["主导航", "Main navigation"],
  ["调整左侧面板宽度", "Resize left panel"],
  ["调整右侧面板宽度", "Resize right panel"],
  ["调整底部面板高度", "Resize bottom panel"],
  ["画布", "Canvas"],
  ["表格", "Table"],
  ["数据", "Data"],
  ["编辑模式", "Editor mode"],
  ["撤销", "Undo"],
  ["重做", "Redo"],
  ["预览语言", "Preview language"],
  ["命令行", "Terminal"],
  ["校验", "Validate"],
  ["模拟运行", "Simulate"],
  ["导出 JSON", "Export JSON"],
  ["选择导出格式", "Choose export format"],
  ["导出格式", "Export format"],
  ["运行时 JSON", "Runtime JSON"],
  ["结构数据与多语言资源", "Structure and localized resources"],
  ["后续格式扩展", "Planned format"],
  ["二进制包", "Binary package"],
  ["新建项目", "New Project"],
  ["打开项目", "Open Project"],
  ["保存项目", "Save Project"],
  ["保存中…", "Saving…"],
  ["检查项目迁移", "Check Project Migration"],
  ["未选择对话", "No dialogue selected"],
  ["存在未保存修改", "Unsaved changes"],
  ["剧情对话编辑器", "Narrative Dialogue Editor"],
  ["让每一条剧情分支清晰可见", "Make every story branch clear"],
  [
    "在本地完成对话编排、数据校验与模拟运行，并交付与 Unity、UE 等宿主无关的运行时数据。",
    "Author dialogue, validate data, and simulate locally, then deliver engine-agnostic runtime data for Unity, Unreal, and other hosts.",
  ],
  ["可视化编排", "Visual Authoring"],
  [
    "用画布组织节点与分支，也可切换表格和源数据视图。",
    "Organize nodes and branches on a canvas, or switch to table and source views.",
  ],
  ["校验与模拟", "Validation and Simulation"],
  [
    "在接入游戏前定位内容问题，复现不同变量下的运行路径。",
    "Find content issues and reproduce runtime paths before game integration.",
  ],
  ["引擎无关交付", "Engine-agnostic Delivery"],
  [
    "项目文件适合版本控制，运行时数据可由不同宿主消费。",
    "Project files work well with version control, and runtime data can be consumed by different hosts.",
  ],
  ["欢迎使用司命。", "Welcome to Siming."],
  ["新建对话", "New dialogue"],
  ["保存目录（相对于项目根目录）", "Save directory (relative to project root)"],
  ["搜索对话、路径…", "Search dialogues and paths…"],
  ["快速访问", "Quick access"],
  ["全部对话", "All dialogues"],
  ["最近编辑", "Recently edited"],
  ["翻译未完成", "Translation incomplete"],
  ["对话目录", "Dialogue files"],
  ["添加节点", "Add node"],
  ["插入画布", "Insert into canvas"],
  ["点击添加，或拖拽到画布", "Click to add, or drag onto the canvas"],
  ["项目资源", "Project resources"],
  ["对话", "Dialogue"],
  ["选项", "Choice"],
  ["条件", "Condition"],
  ["事件", "Event"],
  ["开始", "Start"],
  ["结束", "End"],
  ["角色或旁白", "Character or narration"],
  ["玩家分支", "Player branch"],
  ["变量判断", "Variable condition"],
  ["通知游戏侧", "Notify game host"],
  ["入口节点", "Entry node"],
  ["流程终点", "Flow end"],
  ["搜索项目内容", "Search project content"],
  ["输入名称、Key 或正文进行搜索。", "Search by name, key, or dialogue text."],
  ["暂无匹配结果", "No matching results"],
  ["未连接", "Unconnected"],
  ["路径", "Path"],
  ["类型 / Key", "Type / Key"],
  ["角色与正文", "Speaker and text"],
  ["下一步", "Next"],
  ["编辑源 JSON", "Edit Source JSON"],
  ["存在未应用草稿", "Unapplied draft"],
  ["已与画布同步", "Synced with canvas"],
  ["格式化", "Format"],
  ["放弃", "Discard"],
  ["应用修改", "Apply Changes"],
  ["设置", "Settings"],
  [
    "项目设置保存到项目配置，可随版本控制共享",
    "Project settings are saved with the project and can be shared through version control.",
  ],
  [
    "系统设置仅保存在本机，不影响项目成员",
    "System settings are stored only on this device and do not affect collaborators.",
  ],
  [
    "这些配置属于当前项目。相对路径会随项目一起共享，适合版本控制和多人协作。",
    "These settings belong to the current project. Relative paths are shared with it and work well for version control and collaboration.",
  ],
  [
    "这些偏好仅保存在当前设备，不会写入项目文件，也不会影响其他协作者。",
    "These preferences are stored only on this device. They are not written to project files or shared with collaborators.",
  ],
  ["项目文件", "Project Files"],
  ["项目根目录", "Project root"],
  [
    "本机上打开项目的位置，不写入项目配置。",
    "Local project location; not written to project settings.",
  ],
  ["尚未选择项目目录", "No project directory selected"],
  ["选择…", "Choose…"],
  ["项目配置文件", "Project settings file"],
  ["保存可共享的项目级设置。", "Stores shareable project settings."],
  ["项目名称", "Project name"],
  [
    "显示在窗口标题和项目菜单中。",
    "Shown in the window title and project menu.",
  ],
  ["对话文件目录", "Dialogue directory"],
  [
    "相对于项目根目录，移动项目后仍然有效。",
    "Relative to the project root, so it remains valid when moved.",
  ],
  ["解析为：", "Resolves to: "],
  ["导出", "Export"],
  ["路径类型", "Path type"],
  [
    "团队项目推荐使用相对于项目根目录的路径。",
    "Relative paths are recommended for team projects.",
  ],
  ["相对路径", "Relative path"],
  ["绝对路径", "Absolute path"],
  [
    "绝对路径仅保存在当前设备，不会写入项目配置。",
    "The absolute path is stored only on this device and is not written to project settings.",
  ],
  ["导出文件位置", "Export location"],
  [
    "桌面端与 CLI 默认输出到同一目录。",
    "Desktop and CLI export to the same directory by default.",
  ],
  [
    "绝对路径仅用于当前设备的桌面端导出。",
    "The absolute path is used only for desktop exports on this device.",
  ],
  [
    "未设置，首次导出时选择目录。",
    "Not set. Choose a directory on the first export.",
  ],
  ["默认导出格式", "Default export format"],
  [
    "工具栏主按钮将优先使用该格式。",
    "The toolbar primary action uses this format.",
  ],
  ["多语言目录结构", "Localization directory structure"],
  [
    "结构与文本资源分离，方便翻译文件独立维护。",
    "Separates structure from text resources for independent translation maintenance.",
  ],
  ["按语言拆分目录", "Split directories by locale"],
  ["语言", "Languages"],
  ["默认语言", "Default language"],
  ["缺失翻译时回退到此语言。", "Fallback language for missing translations."],
  ["支持语言", "Supported languages"],
  [
    "语言代码使用 BCP 47，以逗号分隔。",
    "Use comma-separated BCP 47 language codes.",
  ],
  [
    "写入 .siming/project.json，可随版本控制共享",
    "Written to .siming/project.json and shared through version control",
  ],
  ["应用项目设置", "Apply Project Settings"],
  ["默认位置", "Default Location"],
  ["新项目保存位置", "New project location"],
  [
    "新建项目时默认打开的本机目录。",
    "Default local directory used when creating a project.",
  ],
  ["尚未设置", "Not set"],
  ["外观与编辑", "Appearance and Editing"],
  ["界面语言", "Interface language"],
  ["只影响编辑器界面。", "Affects only the editor interface."],
  ["主题", "Theme"],
  [
    "选择后立即预览，保存后作为本机偏好。",
    "Preview immediately; save to keep it as a local preference.",
  ],
  ["深色", "Dark"],
  ["浅色", "Light"],
  ["简体中文", "Simplified Chinese"],
  ["数据编辑器字号", "Data editor font size"],
  ["仅影响 JSON 数据视图。", "Affects only the JSON data view."],
  ["编辑器字号", "Editor font size"],
  [
    "影响编辑器界面的常规文字大小。",
    "Controls regular text size throughout the editor UI.",
  ],
  ["小", "Small"],
  ["中", "Medium"],
  ["大", "Large"],
  ["快捷键方案", "Keymap"],
  [
    "可使用系统默认或常见编辑器键位。",
    "Use the system default or a familiar editor keymap.",
  ],
  ["系统默认", "System default"],
  ["本地行为", "Local Behavior"],
  ["自动保存", "Auto Save"],
  [
    "项目内容无操作一段时间后自动写入。",
    "Save project content after a period of inactivity.",
  ],
  ["关闭", "Off"],
  ["30 秒后", "After 30 seconds"],
  ["60 秒后", "After 60 seconds"],
  ["2 分钟后", "After 2 minutes"],
  ["启动时恢复", "Restore on launch"],
  ["重新打开上次使用的项目和对话。", "Reopen the last project and dialogue."],
  ["上次项目", "Last project"],
  ["项目选择页", "Project picker"],
  [
    "保存在本机系统配置中，不提交到版本控制",
    "Stored in local system settings and not committed to version control",
  ],
  ["恢复默认", "Restore Defaults"],
  ["保存系统设置", "Save System Settings"],
  ["基础信息", "Basic Information"],
  ["节点属性", "Node Properties"],
  ["节点类型", "Node type"],
  ["说话人", "Speaker"],
  ["正文", "Text"],
  ["宿主消息", "Host Messages"],
  ["新增", "Add"],
  ["高级", "Advanced"],
  ["删除节点", "Delete Node"],
  ["当前节点没有宿主消息。", "This node has no host messages."],
  ["问题", "Problems"],
  ["终端", "Terminal"],
  ["开始模拟", "Start Simulation"],
  ["从当前选中节点开始", "Start from selected node"],
  [
    "验证当前对话的实际运行路径",
    "Validate the current dialogue's runtime path",
  ],
]);

const attributes = ["aria-label", "placeholder", "title"] as const;

function translateInterfaceText(source: string, locale: InterfaceLocale) {
  if (locale !== "en-US") return source;
  const exact = english.get(source);
  if (exact) return exact;
  return source
    .replace(/^(\d+) 个节点$/, "$1 nodes")
    .replace(/^(\d+) 个定义$/, "$1 definitions")
    .replace(/^(\d+) 个选项$/, "$1 choices")
    .replace(/^引用 (.+)$/, "Reference $1");
}

export function InterfaceLocaleEffect({ locale }: { locale: InterfaceLocale }) {
  const originalTexts = useRef(new Map<Text, string>());
  const originalAttributes = useRef(
    new Map<Element, Map<(typeof attributes)[number], string>>(),
  );

  useLayoutEffect(() => {
    const restore = () => {
      originalTexts.current.forEach((source, node) => {
        if (node.isConnected) node.data = source;
      });
      originalAttributes.current.forEach((values, element) => {
        if (!element.isConnected) return;
        values.forEach((source, attribute) =>
          element.setAttribute(attribute, source),
        );
      });
      originalTexts.current.clear();
      originalAttributes.current.clear();
    };

    restore();
    document.documentElement.lang = locale;
    if (locale !== "en-US") return restore;

    const shouldSkip = (element: Element | null) =>
      Boolean(
        element?.closest("input, textarea, .cm-editor, .flow-node-content"),
      );

    const localizeText = (node: Text) => {
      if (shouldSkip(node.parentElement)) return;
      const translatedSource = (source: string) => {
        const leading = source.match(/^\s*/)?.[0] ?? "";
        const trailing = source.match(/\s*$/)?.[0] ?? "";
        return `${leading}${translateInterfaceText(source.trim(), locale)}${trailing}`;
      };
      const currentSource = originalTexts.current.get(node);
      const expected = currentSource
        ? translatedSource(currentSource)
        : undefined;
      if (currentSource && node.data !== expected) {
        originalTexts.current.set(node, node.data);
      } else if (!currentSource) {
        originalTexts.current.set(node, node.data);
      }
      const source = originalTexts.current.get(node) ?? node.data;
      const translated = translatedSource(source);
      if (node.data !== translated) node.data = translated;
    };

    const localizeElement = (element: Element) => {
      if (shouldSkip(element)) return;
      for (const attribute of attributes) {
        const value = element.getAttribute(attribute);
        if (!value) continue;
        let saved = originalAttributes.current.get(element);
        if (!saved) {
          saved = new Map();
          originalAttributes.current.set(element, saved);
        }
        const source = saved.get(attribute) ?? value;
        saved.set(attribute, source);
        element.setAttribute(attribute, translateInterfaceText(source, locale));
      }
    };

    const localizeTree = (root: Node) => {
      if (root instanceof Text) {
        localizeText(root);
        return;
      }
      if (!(root instanceof Element)) return;
      localizeElement(root);
      const walker = document.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      );
      let current = walker.nextNode();
      while (current) {
        if (current instanceof Text) localizeText(current);
        else if (current instanceof Element) localizeElement(current);
        current = walker.nextNode();
      }
    };

    const root = document.getElementById("root") ?? document.body;
    localizeTree(root);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData") {
          localizeText(record.target as Text);
        } else {
          record.addedNodes.forEach(localizeTree);
        }
      }
    });
    observer.observe(root, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => {
      observer.disconnect();
      restore();
    };
  }, [locale]);

  return null;
}
