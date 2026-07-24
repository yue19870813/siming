---
name: git-push-all
description: 一次性把父仓库及所有 Git submodule 当前分支中尚未推送的 commit 按依赖顺序推送到各自远程。执行前递归检查工作区、分支、上游、远端差异与 gitlink 可获取性，并让用户一次性确认精确 push 计划。默认不创建 commit、不推标签、不 force push。触发：「push 所有内容」「全部 push」「把父仓库和 submodule 都推上去」「递归 push」等。
---

# git-push-all

把顶层父仓库及所有已注册、已初始化 Git submodule 当前检出分支中的本地 commit，按“最深层 submodule → 直接父仓库 → 顶层父仓库”的依赖顺序推送到各自远程。

这里的“所有”指所有相关仓库的**当前检出分支**，不表示所有本地分支、所有标签或未提交文件。Git 无法 push 工作区内容；未暂存、已暂存但未 commit、未追踪文件都不属于可推送内容。

## 适用场景

- 用户说「push 所有内容」「全部 push」「父仓库和 submodule 一起 push」
- 父仓库已经提交新的 submodule gitlink，需要先确保对应 submodule commit 可从远程获取
- 多层嵌套 submodule 都有本地 commit，需要按依赖顺序推送
- 希望一次确认所有远程写入，而不是逐个仓库反复确认

## 核心边界

- 父仓库与每个 submodule 是独立 Git 仓库，必须分别 push。
- 默认只处理每个仓库当前检出的分支，不推其他分支，不推标签。
- 本 Skill 只 push 已存在的 commit，不执行 `git add`、`git commit`、rebase、merge、branch 创建或工作区清理。
- 若有未提交内容，默认停止并引导先执行 `git-commit-changes`；不能声称这些内容已经被 push。
- push 顺序必须从最深层 submodule 到顶层父仓库，避免父仓库发布一个远程无法获取的 gitlink。
- 多仓库、多远程 push 不具备全局事务性。某个 push 成功后，后续失败时不能自动回滚远端；必须停止依赖项并报告部分完成状态。
- 执行 push 属于对外写入。必须先展示完整计划，并通过专用选择控件或明确授权取得一次性确认。

## 绝对不能做的事

- ❌ **绝不在确认前执行任何真实 `git push`**
- ❌ **绝不使用 `--force`、`--force-with-lease`、前导 `+` refspec 或删除远程 ref**
- ❌ **绝不使用 `git push --all`、`git push --mirror` 或 `git push --tags`**
- ❌ **绝不隐式创建 commit、暂存文件、切换分支、创建分支、merge 或 rebase**
- ❌ **绝不在 detached HEAD 上猜测目标分支并 push**
- ❌ **绝不在远端领先或历史分叉时自动解决冲突**
- ❌ **绝不因某个 submodule push 失败而继续 push 依赖它的新父仓库 gitlink**
- ❌ **绝不把一个仓库的授权视为其他仓库、远程或分支的无限授权**；确认计划必须列出全部精确目标
- ❌ **绝不把 `git fetch`、`git push --dry-run` 或本地 remote-tracking ref 当成真实 push 成功**

## 执行流程

### 1. 递归发现全部仓库

从顶层父仓库开始执行：

```bash
git rev-parse --show-toplevel
git submodule status --recursive
git config -f .gitmodules --get-regexp '^submodule\..*\.path$'
```

递归建立仓库图，记录每个仓库：

- 仓库路径与直接父仓库；
- submodule 深度；
- 当前 HEAD SHA；
- 当前分支或 detached HEAD；
- `.gitmodules` 中的注册路径；
- 是否已初始化并可访问；
- 直接父仓库当前 HEAD 记录的 gitlink SHA。

若没有 `.gitmodules`，按普通单仓库 push 流程处理。

未初始化或无法访问的 submodule 必须列为阻塞项。不要自动运行 `git submodule update --init`，因为它可能访问网络、需要凭据或改变工作区。

### 2. 检查所有工作区是否完整提交

在父仓库和每个已初始化 submodule 中分别执行：

```bash
git -C <repo-path> status --short --branch --untracked-files=all --ignore-submodules=none
git -C <repo-path> diff --quiet
git -C <repo-path> diff --staged --quiet
git -C <repo-path> ls-files --others --exclude-standard
```

判断规则：

- 任一仓库存在已修改、已暂存、未追踪或冲突文件时，默认停止整个“push 所有内容”流程。
- 清楚列出每个仓库尚未 commit 的内容，并说明 Git 无法 push 这些文件。
- 优先建议用户先执行 `git-commit-changes`，该 Skill 会递归提交 submodule 内容并更新父级 gitlink。
- 若用户明确要求“忽略未提交文件，只 push 已有 commit”，必须重新生成计划，并在确认文案中明确写出哪些文件不会被 push；不能沿用“所有内容已推送”的表述。
- 存在 merge、rebase、cherry-pick、revert 或未合并冲突状态时直接阻塞，不提供“忽略后继续”选项。

只有父仓库和所有相关 submodule 的工作区都干净，才能默认继续。

### 3. 解析当前分支、远程和上游

对每个仓库分别执行：

```bash
git -C <repo-path> symbolic-ref --short -q HEAD
git -C <repo-path> rev-parse HEAD
git -C <repo-path> rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'
git -C <repo-path> remote -v
git -C <repo-path> remote get-url --push <remote>
git -C <repo-path> config --get remote.pushDefault
git -C <repo-path> config --get branch.<branch>.pushRemote
git -C <repo-path> config --get branch.<branch>.remote
```

目标选择规则：

1. 当前分支已有 upstream：使用 upstream 对应的 remote 和 branch。
2. 没有 upstream，但只有一个可写 remote：可提议推送到同名远程分支，并在计划中明确将使用 `--set-upstream`。
3. 没有 upstream 且存在多个 remote，或 pushRemote 与 upstream 指向不同目标：使用选择控件让用户决定，不能猜测。
4. remote 没有 push URL：列为阻塞项。
5. remote URL 看起来包含明文凭据或异常目标：暂停并提示风险。

**detached HEAD**：

- detached HEAD 在 submodule 中很常见，不等于自动失败。
- 若 detached HEAD 已被某个远程 ref 包含，并且没有新的本地 commit需要推送，该仓库无需 push，可以继续校验 gitlink。
- 若 detached HEAD 含有远程不可获取的新 commit，必须阻塞并让用户先将该 commit 放到明确分支上；本 Skill 不创建分支，也不直接把 detached HEAD 推到猜测的远程分支。

### 4. 刷新远端状态并计算精确 outgoing commits

在生成 push 计划前，对每个将使用的 remote 执行只读远端同步：

```bash
git -C <repo-path> fetch --prune <remote>
```

`fetch` 会更新本地 remote-tracking refs，但不会写入远端。若 fetch 因权限、网络或凭据失败，停止该仓库及依赖它的父级计划，不能使用陈旧引用声称 push 安全。

对于已有 upstream 的分支：

```bash
git -C <repo-path> rev-list --left-right --count '@{upstream}...HEAD'
git -C <repo-path> log --oneline --decorate '@{upstream}..HEAD'
git -C <repo-path> log --oneline --decorate 'HEAD..@{upstream}'
```

解释 `rev-list` 结果：

- behind = 0，ahead > 0：可计划 fast-forward push。
- behind = 0，ahead = 0：该仓库无需 push。
- behind > 0，ahead = 0：本地没有内容可推，报告远端领先；不自动 pull。
- behind > 0，ahead > 0：历史分叉，阻塞；不自动 merge、rebase 或 force push。

对于尚无 upstream、准备首次推送的分支：

- 展示从适当基线到 HEAD 的 commit 列表；若远程已存在同名分支，必须 fetch 后按该远程 ref 计算 ahead/behind。
- 若远程同名分支不存在，明确标注为“创建远程分支并设置 upstream”。

对每个拟 push 仓库执行 dry-run：

```bash
git -C <repo-path> push --dry-run --porcelain <remote> HEAD:refs/heads/<remote-branch>
```

首次设置 upstream 时，dry-run 不需要修改配置。dry-run 失败则不进入真实 push 计划。

### 5. 校验 submodule gitlink 的远程可获取性

对每个父仓库当前 HEAD 记录的 submodule gitlink：

1. 读取父仓库记录的目标 SHA：

   ```bash
   git -C <parent-path> ls-tree HEAD <submodule-path-relative-to-parent>
   ```

2. 确认该 SHA 满足以下至少一项：
   - 已被 submodule 的远程 ref 包含；
   - 是本次计划中该 submodule 将要 push 的 commit 或其祖先。

3. 如果父仓库待 push 的 commit 历史包含多个 gitlink 更新，至少保证最终将发布的父仓库 HEAD 所指 SHA 在远程可获取；若中间 commit 也可能被协作者检出，优先校验每个新增 gitlink SHA。

4. 如果 submodule 当前 HEAD 已前进，但直接父仓库 HEAD 仍记录旧 gitlink：
   - 这是未记录的依赖关系，不属于 push 能修复的问题；
   - 阻塞“push 所有内容”，提示先运行 `git-commit-changes` 创建父级 gitlink commit。

5. 嵌套 submodule 按同样规则逐层校验。

### 6. 生成一次性跨仓库 push 计划

只列出确实 ahead、需要真实 push 的仓库。按深度从深到浅排序；同一深度按稳定路径顺序排列。

示例：

```text
拟执行 2 次 push（涉及 2 个仓库，执行顺序为 1 → 2）：

【1/2】【repo: dd-play-script】
  local:  master @ abc1234
  remote: origin (git@gitee.com:ooie/dd-play-script.git)
  target: master → refs/heads/master
  commits: 2
    abc1234 feat: 补充鸿胪寺案件对白
    def5678 docs: 更新制作备注
  mode: fast-forward

【2/2】【repo: 父仓库】【依赖 1】
  local:  dev/vertical-slicing @ 9876abc
  remote: origin (git@gitee.com:ooie/dd-game.git)
  target: dev/vertical-slicing → refs/heads/dev/vertical-slicing
  commits: 1
    9876abc chore: 更新 dd-play-script 子模块
  mode: fast-forward
```

计划必须同时展示：

- 每个仓库的路径、当前分支和 HEAD；
- remote 名称、完整 push URL 和目标远程分支；
- 精确 outgoing commit 数量、hash 与 subject；
- push 模式是 fast-forward，还是首次创建远程分支并设置 upstream；
- submodule → 父仓库依赖顺序；
- 无需 push 的干净仓库；
- 被跳过或阻塞的仓库及原因；
- 不会推送其他分支、标签或未提交文件；
- 不会使用 force push。

若所有仓库都 ahead = 0，直接说明“没有需要 push 的 commit”，不要发起确认或空 push。

### 7. 对全部远程写入取得一次性确认

优先使用 `AskUserQuestion` 或同类选择控件：

- `确认并推送（推荐）`：严格按展示的仓库、remote、branch 和顺序执行；
- `调整方案`：暂停，等待用户说明要排除的仓库或修改的目标；
- `取消`：不执行任何 push。

确认问题必须明确：`是否按上述方案向 N 个远程分支执行 M 次 push？`

如果没有专用控件但真实 push 会触发系统授权弹窗，可将确认与授权合并，但弹窗描述必须列明仓库数量、远程目标和“不会 force push”。只有两者都不可用时才接受文字确认。

用户只选择部分仓库时必须重新校验依赖：

- 可以只 push submodule，暂不 push 父仓库。
- 不可以跳过一个尚未远程可获取的 submodule，却 push 依赖其新 gitlink 的父仓库。
- 跳过中间层仓库时，所有依赖该层新 gitlink 的更高层仓库也必须跳过。
- 调整后的精确计划涉及不同远程目标时，要重新确认。

### 8. 按依赖顺序执行真实 push

每次 push 前重新检查目标仓库：

```bash
git -C <repo-path> status --short --untracked-files=all --ignore-submodules=none
git -C <repo-path> rev-parse HEAD
git -C <repo-path> symbolic-ref --short -q HEAD
git -C <repo-path> fetch --prune <remote>
```

若工作区、HEAD、分支、upstream 或远端状态与确认计划不一致，停止并重新生成计划；不能继续使用过期授权。

已有 upstream：

```bash
git -C <repo-path> push --porcelain <remote> HEAD:refs/heads/<remote-branch>
```

首次建立 upstream：

```bash
git -C <repo-path> push --porcelain --set-upstream <remote> HEAD:refs/heads/<remote-branch>
```

每次 push 后：

```bash
git -C <repo-path> fetch <remote> <remote-branch>
git -C <repo-path> rev-parse HEAD
git -C <repo-path> rev-parse refs/remotes/<remote>/<remote-branch>
git -C <repo-path> rev-list --left-right --count refs/remotes/<remote>/<remote-branch>...HEAD
```

只有本地 HEAD 与目标 remote-tracking ref 一致、ahead/behind 均为 0，才能报告该仓库 push 成功。

失败处理：

- 任一 submodule push 失败，立即停止所有依赖该 commit 的父仓库 push。
- 同一深度的无依赖仓库是否继续，默认停止整个批次，以免扩大部分完成状态；除非用户在确认计划中明确授权“独立项可继续”。
- 不自动重试认证失败、权限失败、非快进、hook 拒绝或网络错误。
- 不回滚已成功的远端更新，不删除远程 commit，不改写历史。
- 记录真实完成与失败状态，不能笼统声称“全部已 push”。

### 9. 收尾汇报

按仓库列出：

- 成功 push 的 remote/branch、旧远端 SHA → 新 SHA；
- 实际发布的 commit hash 与 subject；
- 无需 push 的仓库；
- 失败或因依赖被跳过的仓库；
- 各仓库最终 ahead/behind 状态；
- 仍未提交、因此没有被 push 的文件；
- submodule gitlink 是否均可从对应远程获取。

若全部成功，明确写“父仓库及所有相关 submodule 当前分支均已同步到计划中的远程分支”。不要把其他本地分支或标签描述为已同步。

## 边界与例外

- 工作区存在未提交内容时，默认先执行 `git-commit-changes`，再重新运行本 Skill。
- submodule 工作区干净但 detached HEAD 已被远程 ref 包含时，不需要 push，可继续处理父仓库。
- submodule detached HEAD 含本地独有 commit 时，必须先由用户把提交放到明确分支；本 Skill 不代做。
- 没有 upstream 的正常分支可以提议推到唯一 remote 的同名分支，但必须明确展示 `--set-upstream` 并取得确认。
- 多 remote、不同 pushRemote 或异常 refspec 必须让用户选择。
- 远端领先、历史分叉、受保护分支拒绝、服务端 hook 失败均停止，不自动修复。
- `.gitmodules` URL 与实际 remote 不一致时必须提示；不能假设两者可互换。
- 本 Skill 不推 tags。用户明确要求 tags 时，应单独列出具体 tag 和目标 remote，再取得额外确认；仍不得使用 `--tags` 批量推送未经审查的标签。
- 本 Skill 不处理 Git LFS 上传策略。发现 LFS 指针或相关 hook 时，应说明 push 可能同时上传 LFS 对象，并在计划中披露。

## 反例

- ❌ `git push --recurse-submodules=on-demand` 后不审查各 submodule 的分支和 remote。
- ❌ `git push --all` 或 `git push --mirror`。
- ❌ 父仓库先 push，之后才发现新 gitlink 指向的 submodule commit 尚未发布。
- ❌ submodule 处于 detached HEAD 时把 `HEAD` 随意推到 `master`。
- ❌ 远端领先时自动 `pull --rebase`、merge 或 force push。
- ❌ 工作区仍有未提交文件，却告诉用户“所有内容都推上去了”。
- ❌ dry-run 成功后未经用户确认直接执行真实 push。
- ❌ 一个仓库 push 失败后仍继续推送依赖它的新父级 gitlink。
