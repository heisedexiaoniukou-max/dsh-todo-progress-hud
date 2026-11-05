<p align="center">
  <img src="./icon.svg" width="72" height="72" alt="dsh-todo-progress-hud icon">
</p>

<h1 align="center">dsh-todo-progress-hud</h1>

<p align="center">聊天页顶部的任务进度悬浮条 · Floating task-progress HUD for DeepSeek Harness</p>

---

## 它是什么

DSH 的 `todo_write` 会在会话里维护一份任务清单，但进度只藏在侧边面板里。
这个插件把同一份清单变成**页面顶部常驻的悬浮进度条**：

- 最顶部一条 **2px 全宽进度线**（品牌蓝 → 绿渐变，进行中缓慢漂移）
- 下方居中一枚 **胶囊卡**：任务标题 + 进度条 + `完成/总数` + **节点灯** + 当前节点
- 节点灯：`✅` 已完成（绿、弹跳入场）· `●` 进行中（蓝、脉冲光环）· `○` 待办（空心）· ⚠️ 失败（红、快脉冲）
- **点击卡片折叠**成横向迷你条（小进度条 + 节点灯 + 计数），再点展开，带收缩/展开动画；折叠状态记在 `localStorage`
- 全部完成时卡片绿光闪烁并保持显示（想让它让位就点一下折叠成迷你条）
- 明暗主题自动适配，支持 `prefers-reduced-motion`

它不产生数据，只**读取会话投影**（`todos`、`title`），所以进度永远和 agent 的
`todo_write` 一致，不需要任何手动维护。

## 安装

通过 GitHub 安装（跟随默认分支，永远拿到最新版）：

```sh
dsh plugin --profile web add github:heisedexiaoniukou-max/dsh-todo-progress-hud
```

需要可复现版本时锁定 tag（当前最新：`v1.1.0`）：

```sh
dsh plugin --profile web add github:heisedexiaoniukou-max/dsh-todo-progress-hud#v1.1.0
```

从本地目录安装（开发调试）：

```sh
dsh plugin --profile web add /absolute/path/to/dsh-todo-progress-hud
```

安装后刷新页面（或重启该 profile）即可在聊天页看到悬浮条。
在 DSH 界面里也可以通过 **Settings → Plugins** 或 agent 的 `plugin_manager`
`install_bundle` 完成同样的安装。

### 要求

- DSH `>= 0.2.0`（依赖 `shell.overlay` 与 `conversation.input.dock` 两个插槽）
- 只适用于 Web / Desktop 页面，纯 headless 环境不渲染

## 使用

| 场景 | 行为 |
| --- | --- |
| agent 调用 `todo_write` | 悬浮条实时出现并按节点点亮 |
| 点击卡片 | 折叠成横向迷你条 / 展开回胶囊（都有过渡动画）|
| 全部节点完成 | 显示「全部完成」，绿光闪烁并保持显示，可点击折叠 |
| 节点失败 | 内容以 `⚠` / `✗` / `❌` 开头即渲染为红色，卡片边框与顶部线同时告警 |

失败节点的约定写法（agent 侧）：

```text
todo_write([
  { content: "K1 定位问题", status: "completed" },
  { content: "⚠️ K3 联调（接口 500）", status: "in_progress" },
  { content: "K4 回归", status: "pending" }
])
```

## 数据来源

| 投影键 | 提供方 | 用途 |
| --- | --- | --- |
| `todos` | `@deepseek-ai/dsh-tool-todo` | 节点灯、进度条、百分比 |
| `title` | `@deepseek-ai/dsh-session-title` | 卡片左侧任务标题 |

两者都是只读：插件不写会话日志、不新增事件类型、不联网。

## 权限与副作用

- 不需要任何工具权限、网络权限或 Host 服务
- 唯一持久化数据：浏览器 `localStorage` 的 `todo-progress-hud:collapsed`（折叠偏好）、`todo-progress-hud:motion`（设为 `full` 可在系统「减少动画」时强制开启动效）
- 无 Todo 的会话不渲染任何东西；无会话时自动隐藏

## 配置

无。插件没有 Host 配置项，所有视觉规则内置；颜色全部取主题 token
（`--dsw-alias-*`），换主题自动跟随。

## 卸载

```sh
dsh plugin --profile web remove dsh-todo-progress-hud
```

刷新页面后条目消失；如需清理折叠偏好，删除浏览器里的
`todo-progress-hud:collapsed` 键即可。

## 开发

无构建步骤：`client.js` 直接以 DSH 的 Client 模块格式（`window.__ModuleLoader__.load`）
注册两个插槽座位。

```text
dsh-todo-progress-hud/
├── package.json         # dsh.bundle.patch + dsh.client 清单
├── cordis.patch.yml     # 插入 Host 行
├── index.js             # Host 半边（空实现）
├── client.js            # 浏览器半边：bridge 座位 + HUD 座位
├── locale/{zh,en}.json  # 商店展示元数据
└── icon.svg
```

架构：`conversation.input.dock`（会话级、不可见）负责用 `useProjection` 读投影并发布到
模块内快照；`shell.overlay`（框架级浮层）负责渲染，因此悬浮条不受滚动与列布局影响。

本地迭代：改完 `client.js` 后执行 `dsh plugin --profile web add /absolute/path`（或
`plugin_manager install_bundle`）再刷新页面。

## License

[MIT](./LICENSE)
