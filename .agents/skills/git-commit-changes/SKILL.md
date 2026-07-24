---
name: git-commit-changes
description: 把父仓库及其 Git submodule 中的未提交改动递归整理成一个或多个 commit，按仓库、目录和主题智能分组，使用各仓库既有的 Conventional Commits 风格。提交前必须让用户一次性确认全部分组与 message。**绝不 push**。触发：「帮我提交」「commit 一下」「把改动 commit 了」「整理一下 git」等。
---

# git-commit-changes

把父仓库及所有已注册、已初始化 Git submodule 中的未提交改动（已修改、已暂存、未追踪及 gitlink 变化）整理成一次或多次 `git commit`，向用户一次性展示跨仓库分组方案与 commit message，得到确认后再按依赖顺序执行。

## 适用场景

- 用户说「帮我提交」「commit 一下」「把改动提交了」「整理 git」
- 用户写完一段内容/做完一波编辑想留存版本
- 多个文件的改动需要拆分成独立 commit
- 父工程包含 Git submodule，子模块内部也有需要提交的改动

## 仓库与 submodule 边界

- 父仓库和每个 submodule 都是独立 Git 仓库；一个 commit 绝不能跨越两个仓库。
- 必须递归检查所有已注册 submodule，而不是只看父仓库的 `git status`。父仓库通常只会把子模块显示为一条路径，无法代替对子模块内部文件的审查。
- submodule 内部有改动时，先在该 submodule 中提交内容，再在它的直接父仓库中单独提交更新后的 gitlink。
- 嵌套 submodule 按最深层优先处理：最深层内容 commit → 直接父级 gitlink commit → 逐层向上，最后提交顶层父仓库 gitlink。
- 每个仓库都必须读取并遵循该仓库自己的 `CLAUDE.md`、更深层指令和提交风格；子模块规则优先于父仓库规则。
- 所有仓库的 commit 方案必须一次性展示、一次性确认，不能先提交子模块再补问父仓库。
- 父仓库 commit 只记录 gitlink SHA，不会包含 submodule 内部文件内容。

## 绝对不能做的事

- ❌ **绝不 `git push`**，适用于父仓库和所有 submodule；除非用户在同一句话里明确要求 push，但本 skill 默认职责仍只到 commit
- ❌ **绝不使用 `git add -A` / `git add .` / `git add --all`**，无论在哪个仓库——这类命令会把意料之外的文件一并带入
- ❌ **绝不 `--amend`** 已有 commit——一律新建 commit
- ❌ **绝不 `--no-verify`** 跳过 hooks
- ❌ **绝不在用户确认之前修改任何仓库的暂存区或执行 `git commit`**
- ❌ **绝不把父仓库文件混入 submodule commit，也不把 submodule 内部路径当成父仓库普通文件提交**
- ❌ **绝不在 detached HEAD 的 submodule 上静默创建 commit**；必须先让用户选择分支处理方式
- ❌ **绝不在子模块 commit 失败后继续提交依赖它的新 gitlink**

## 执行流程

### 1. 发现仓库并摸清全部状态

先在顶层父仓库并行执行：

```bash
git status --short --untracked-files=all --ignore-submodules=none
git diff
git diff --staged
git log --oneline -5
git submodule status --recursive
git config -f .gitmodules --get-regexp '^submodule\..*\.path$'
```

若不存在 `.gitmodules` 或没有已注册 submodule，就按普通单仓库流程继续。

对每个已注册、已初始化 submodule（包括嵌套 submodule）分别执行，不能只依赖 `git submodule foreach` 的汇总文本：

```bash
git -C <submodule-path> status --short --branch --untracked-files=all --ignore-submodules=none
git -C <submodule-path> diff
git -C <submodule-path> diff --staged
git -C <submodule-path> log --oneline -5
git -C <submodule-path> symbolic-ref --short -q HEAD
git -C <submodule-path> rev-parse HEAD
```

同时记录：

- 仓库路径、当前分支、HEAD SHA 和上游关系；
- 各仓库自己的已修改、已暂存、未追踪文件；
- 每个 submodule 的 HEAD 是否与直接父仓库记录的 gitlink 一致；
- 是否存在未合并冲突、detached HEAD、未初始化 submodule 或无法读取的仓库；
- 每个仓库自己的 `CLAUDE.md`、适用的 scoped skill 及最近 commit 风格。

对每个未追踪文件，用 `Read` 或等价的只读方式检查内容，尤其是新增 Markdown、配置和脚本，不能只凭文件名判断。

**特殊状态处理**：

- 未初始化 submodule：列为跳过项并说明原因，不自动执行 `git submodule update --init`，因为它可能需要网络和凭据。
- detached HEAD 且有内部改动：先暂停方案，使用选择控件让用户决定切到已有分支、创建分支或跳过；未解决前不得 commit。
- 存在 unresolved merge/rebase/cherry-pick 或未合并冲突：报告阻塞并停止该仓库及所有依赖它的父级 gitlink commit。
- submodule 仅 HEAD 与父仓库 gitlink 不一致、内部工作区干净：把它视为一项待审查的 gitlink 更新，展示旧 SHA、新 SHA 及对应 commit subject。
- 顶层父仓库干净但 submodule 内部有改动：仍然有可提交内容，不能说「没有可提交的内容」。

**安全过滤**：

- 跳过看起来是密钥或凭据的文件（`.env`、`credentials.json`、`*.key` 等），如果用户明确要提交再单独提醒风险。
- 跳过系统或编辑器产物（`.DS_Store`、`Thumbs.db`、`*.swp` 等），提醒用户考虑加入对应仓库的 `.gitignore`，不要默认纳入 commit。
- 对大体积二进制文件、生成产物和仓库规则不明确的配置，先确认来源和是否应由 Git 跟踪。

### 2. 按仓库、目录和主题分组

先按仓库边界分组，再在每个仓库内部按目录和主题分组。分组目标是让每个 commit 语义自洽。

1. **不同仓库** → 必须拆开
   - `dd-play-script/剧情脚本/...` 必须在 `dd-play-script` 仓库提交；不能与父仓库文件进入同一 commit。
2. **同目录 + 同性质** → 一组
   - 例：两个角色档案都在补充角色设定，可以合并。
3. **跨目录 + 同主题** → 一组
   - 例：案件线索与对应嫌疑人档案同步更新，且同属一个仓库，可以合并。
4. **同目录 + 不同主题** → 拆开
   - 例：同一参考目录下的服饰与官制修订应分别提交。
5. **README.md / 灵感记录.md 的特殊处理**：
   - README 仅因新增文件同步目录树时，跟触发它的同仓库改动合并。
   - `灵感记录.md` 中独立的新灵感单独提交。
   - 将成熟灵感迁出并留下链接时，跟同仓库迁出目标合并。
6. **gitlink 更新** → 在直接父仓库单独一组
   - 默认 message：`chore: 更新 <submodule-name> 子模块`。
   - 不与父仓库其他内容混合，便于明确依赖和回滚。
   - 嵌套 submodule 的 gitlink commit 位于它的直接父仓库，不直接跳到顶层父仓库。

**Conventional Commits 的 type 选择**以每个仓库自身历史和规则为准；没有更具体约定时使用：

| type | 用于 |
| --- | --- |
| `feat` | 新增剧情、角色、案件、章节或产品功能 |
| `docs` | 调整文档结构、格式或措辞，不改变功能或剧情走向 |
| `refactor` | 文件移动、重命名、目录调整或代码重构，主体行为不变 |
| `chore` | gitlink、README 目录树、`.claude` 配置、`.gitignore` 等元工作 |
| `fix` | 修正错误、行为缺陷、史实问题或不一致设定 |

### 3. 起草 commit message 与依赖

格式：`<type>: <中文简述>`（首行 ≤ 50 字，必要时添加正文）。

- 简述说「做了什么」，不要写空泛的 `update` 或 `add new files`。
- 多文件 commit 的正文可以用 `- ` 列出关键改动。
- **每条 commit message 的最后一行必须是 `【由 git-commit-changes skill 自动提交】`**，与正文之间空一行。
- 每条方案必须标明目标仓库，例如 `repo: dd-play-script` 或 `repo: 父仓库`。
- gitlink commit 必须标注其依赖的 submodule commit 编号。
- 嵌套 submodule 的全部 commit 建立从深到浅的依赖链。

### 4. 一次性向用户展示跨仓库方案

用如下结构汇总，编号覆盖所有仓库：

```text
拟提交 3 个 commit（涉及 2 个仓库，执行顺序为 1 → 2 → 3）：

【1/3】【repo: dd-play-script】feat: 补充鸿胪寺案件对白
  文件:
    M 剧情脚本/剧情章节/S2A-001a-初入鸿胪寺.md
  正文:
    - 补充问询反馈和结尾对白

    【由 git-commit-changes skill 自动提交】

【2/3】【repo: 父仓库】docs: 同步垂直切片方案
  文件:
    M dd-game-design/S2A-001a垂直切片Demo技术设计方案.md
  正文:
    【由 git-commit-changes skill 自动提交】

【3/3】【repo: 父仓库】【依赖 1】chore: 更新 dd-play-script 子模块
  文件:
    M dd-play-script (gitlink: <old-sha> → 由 commit 1 产生的新 SHA)
  正文:
    - 记录剧情脚本子模块的新版本

    【由 git-commit-changes skill 自动提交】
```

文件标记使用 `+`、`M`、`R`、`D`；gitlink 要明确标为 `M ... (gitlink)`，不能伪装成普通目录内容。

方案后必须说明：

- 哪些仓库会产生 commit；
- 精确执行顺序和依赖关系；
- 哪些文件或仓库被跳过及原因；
- **不会 push**；如果父仓库将记录尚未 push 的 submodule commit，要明确警告其他协作者暂时无法从远程解析该 gitlink。

汇报后按以下优先级取得确认：

1. **专用选择控件优先**：使用 `AskUserQuestion` 或同类工具，选项为：
   - `确认并提交（推荐）`：按展示方案和依赖顺序提交全部仓库；
   - `调整方案`：暂停，等待用户说明要调整的分组、仓库或 message；
   - `取消`：不修改任何仓库。
   用户可通过自由输入说明只提交哪些编号。
2. **系统授权弹窗作为确认**：没有专用控件、但执行需要授权时，在弹窗中明确写：`确认按上述方案在 N 个仓库创建 M 个 commit（不会 push）？`。
3. **文字确认兜底**：仅在以上方式均不可用时接受 `确认`、`提交全部`、`只提交 1 和 3`、`调整分组` 等回复。

无论采用哪种方式，确认前不得修改父仓库或任何 submodule 的暂存区。

**部分提交的依赖规则**：

- 用户只选 submodule 内容 commit、未选父级 gitlink commit：允许，但必须在收尾说明父仓库会保留 gitlink 修改。
- 用户选了依赖某个新 submodule commit 的 gitlink commit，却未选该 submodule commit：该方案无效，必须重新确认或自动移除依赖项并明确告知，不能提交错误指针。
- 用户跳过中间层 gitlink 时，更高层 gitlink 也不能执行，因为更高层仓库 HEAD 不会包含最深层更新。

### 5. 确认后按依赖顺序执行

执行顺序必须从最深层 submodule 向顶层父仓库推进。对每个已确认 commit：

1. 在目标仓库中显式暂存已展示的文件：

   ```bash
   git -C <repo-path> add -- <file-1> <file-2>
   ```

   顶层父仓库可直接使用 `git add -- <file>`。绝不使用 `-A`、`.` 或 `--all`。新增目录必须先枚举并审查其中的具体文件，再逐项暂存。

2. 提交前执行 `git -C <repo-path> diff --staged --name-status`，确认暂存文件与方案完全一致。

3. 在对应仓库中创建 commit：

   ```bash
   git -C <repo-path> commit -m "$(cat <<'EOF'
   feat: 新增故事大纲v1

   - 完成第一案主线骨架

   【由 git-commit-changes skill 自动提交】
   EOF
   )"
   ```

4. 每个 commit 后立即记录 hash，并运行：

   ```bash
   git -C <repo-path> status --short --untracked-files=all --ignore-submodules=none
   ```

5. submodule 内容 commit 全部成功后，在直接父仓库重新读取该 submodule 的 HEAD 和 gitlink diff，再显式暂存 submodule 路径：

   ```bash
   git -C <parent-path> add -- <submodule-path-relative-to-parent>
   git -C <parent-path> diff --staged --submodule=log
   ```

   确认 gitlink 指向刚创建的 submodule commit 后，才能创建父级 gitlink commit。

6. 若 pre-commit hook 失败：
   - 不使用 `--amend` 或 `--no-verify`；
   - 修复问题并重新审查、暂存受影响文件后，再重试该 commit；
   - 在该 commit 成功前，不执行依赖它的任何父级 gitlink commit。

7. 若任一仓库中途失败：
   - 保留已经成功创建的 commit，如实报告；
   - 停止所有依赖失败项的后续 commit；
   - 不回滚、不重写历史、不假称全部完成。

### 6. 收尾汇报

提交完成后给出：

- 按仓库列出新增 commit hash 和 message；
- 列出每个 gitlink 的旧 SHA → 新 SHA；
- 分别列出父仓库和各 submodule 中仍未提交的改动；
- 明确哪些计划项因失败、跳过或部分选择而未执行；
- 明确说明未执行 push；若父仓库已记录本地 submodule commit，提醒该 SHA 在 submodule push 前无法被其他协作者从远程获取；
- **不要询问是否要 push**，skill 到此为止。

## 边界与例外

- 只有在父仓库和所有已初始化 submodule 都没有改动、也没有 gitlink 变化时，才说「没有可提交的内容」。
- 只有一个语义分组时不强行拆分，但 submodule 内容与父级 gitlink 天然属于两个仓库，因此至少是两个 commit。
- 用户要求「全合并成一个」时，仍不能跨 Git 仓库合并；应说明 Git 边界限制，并在每个涉及的仓库内尽量合并。
- 用户要求只提交部分编号时，先校验 submodule → gitlink 依赖，再执行有效子集。
- submodule 未初始化时不自动联网初始化；报告路径和跳过原因。
- submodule detached HEAD 时不擅自选分支；先让用户决定。
- submodule 已有本地 commit、父仓库只差 gitlink 时，可以只创建父仓库 gitlink commit，但必须展示新旧 SHA 和 commit subject。
- `.gitmodules` 本身的修改属于父仓库普通文件；submodule URL、path 或注册关系变化需要作为独立配置改动审查，不能当作普通 gitlink 更新。
- 用户说「先 push」时，除非同一句明确授权了具体仓库和远程，否则拒绝并说明本 skill 默认不负责 push。

## 反例

- ❌ 只运行父仓库 `git status`，看到 `M dd-play-script` 就直接提交，完全不审查子模块内部改动。
- ❌ 在父仓库执行 `git add dd-play-script/剧情脚本/...`，误以为父仓库 commit 会包含子模块文件。
- ❌ 子模块还没 commit，就先提交父仓库 gitlink。
- ❌ 在 detached HEAD 的 submodule 中直接 commit，留下没有分支承载的提交。
- ❌ 最深层 submodule commit 失败后，仍继续提交上层 gitlink。
- ❌ `git add . && git commit -m "update"`。
- ❌ 用户还没确认就修改任一仓库暂存区或执行 commit。
- ❌ commit 完顺手 push 父仓库或 submodule。
