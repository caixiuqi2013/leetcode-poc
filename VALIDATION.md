# POC 验证报告（当前版本 0.4.0）

## 0.4.0 当前行为（以下历史段落中的滚动要求已废止）

用户要求任何位置提取。实现采用明确的完整company+recency语义，忽略额外页面搜索/筛选/排序，并在面板和JSON scope中声明。已移除DOM全量ID顺序核对；未采用自动滚动。完整性改由分页明确结束、稳定总数、去重数和字段/错误检查证明。

本次新增页面就绪最多10秒等待、普通点击不误取消、真实范围变更监测、明确scope契约。模拟覆盖DOM0/1/100条或中间行仍提取152条、无滚动的skip0→100分页、未完整返回不能complete、搜索/排序不改变声明的recency-only语义、就绪等待/超时/取消、关闭popup的普通点击、真实范围切换中止。分页响应是由已有真实导出构造的**模拟传输**，不是0.4.0现场抓取。

本次浏览器读取超时，未开展0.4.0现场提取；不能把旧版成功导出当作本版无滚动验收。本次实际运行pnpm typecheck、pnpm build、pnpm test均通过；68/68测试通过，完整输出见TEST-RESULTS.txt。后续在不滚动的Google页点击Extract problems，确认complete及数量，再验证popup关闭重开。

## 历史结论

**Google / 30 days 的真实全量提取与 JSON 导出已通过用户产物验收：152/152，complete。** 已将用户实际导出文件通过 Zod 校验，并与真实首屏响应及此前观察的 DOM 核对。第二个 recency 和真实 popup 关闭重开仍待验证；完整 POC 验收尚未全部完成。

## 本次真实导出验收

用户提供 `extractionId=6e0fa995-2c22-42b9-9c09-f52be00efec4`，extractedAt 为 `2026-09-17T04:25:36.465Z`，extractorVersion 为 0.2.0。

- 实际运行 `pnpm validate` 校验用户原始文件：通过。
- 152 个内部 ID 与 152 个 slug 均唯一；与 expectedTotal/extractedCount 一致；missingRequired=0。
- complete、warnings=[]、exhausted=true、failed=false。该结果表明扩展的分页和 DOM 对照守卫已通过；本次未直接检查第二页原始网络报文。
- 前100条的内部ID、顺序、title、slug和topics与先前用户提供的真实响应一致。
- 第1/77/152条为 Two Sum / Find Peak Element / Best Time to Buy and Sell Stock II，与之前真实DOM观察一致；152个导出链接均与各自slug吻合。没有逐个打开所有链接。
- topics覆盖151/152（99.34%）。内部ID 2809、显示题号2667的 Create Hello World Function 没有topics；保留空数组，不猜分类。后续网页可放入“未分类”。
- 原文件原样保存为 `examples/google-thirty-days.live.complete.json`；校验摘要及SHA-256见 `LIVE-VALIDATION.json`。这与离线回放的100题partial示例明确分开。

## 真实证据

用户提供 Google 30 days 页面 URL、显示 label、POST https://leetcode.com/graphql/ 的 favoriteQuestionList query/variables 与首屏响应：skip=0、limit=100、100 条题目、totalLength=152、hasMore=true。题目含 id、questionFrontendId、title、titleSlug、difficulty、topicTags、frequency；没有 rank。100 条中一条 topicTags 为空。

已保留脱敏真实 fixture：仅列出的题目字段和分页信息，不保留 status、isInMyFavorites 等个人信息。附带 examples/google-thirty-days.supplied-page.partial.json 是**用户响应离线转换**，100/152、partial、missingTopics=1，extractedAt 是转换时间，非原始网络采集时间。它不是扩展现场导出。

此前浏览器曾报 Debugger unattached。本次重连成功，实际读取并操作了同一 Chrome 标签页，观察到：

| 范围 | URL favoriteSlug | 实际页面总数 | DOM 观察 |
|---|---|---|---|
| 30 days | google-thirty-days | 152 | 初始 100；滚动后 152 |
| 3 months | google-three-months | 494 | 初始 100；滚动后 200、300 |

真实下拉框另有 6 months、More than 6 months、All；未调查它们的请求/URL 对应，本版不启用。

30 days 观察到的题目顺序核对：第 1 条 Two Sum（内部1）；第 50 条 Next Greater Element I（496）；第 77 条 Find Peak Element（162）；首屏第 100 条 Online Stock Span（内部937、显示901）；全表第 152 条 Best Time to Buy and Sell Stock II（122）。题目 anchor 含 /problems/<slug>、envType=company、envId=google、对应 favoriteSlug。

3 months 页面首条 Two Sum；第 50 条 Spiral Matrix；初始第 100 条 Find All Numbers Disappeared in an Array。滚动到300条时第151条 Bus Routes（内部833、显示815），第300条 Counter（内部2732、显示2620）。**尚未滚动到494条，未核对该范围最终末条，也未取得其完整 API 响应。** 调查结束返回了用户的30 days页。

用户说切换 recency 无新 API call；本次观察到切换时 URL、范围 label、统计总数和行顺序确实改变。但工具没有网络记录能力，无法证明是缓存、预加载或其他机制，保留为未知。扩展主动读取来源，既不依赖过去响应，也不要求切换时发生网络请求。

## 方案选择

- 真实请求字段完整，包含 topics、总数和 hasMore；选择串行主动请求，避免 DOM 中只有100条导致漏题。
- DOM 用于验证公司、当前 label、题目内部 ID、链接和结果范围。实际观察过上述 selectors，不靠猜测。
- 不读取页面内部缓存/JS 全局变量，不假定 content script 能访问 MAIN world。
- 目前没有可靠地读取所有额外筛选和排序参数，因此明确限定无额外筛选的 recency 查询。只有全量 DOM 与 API 顺序一致才允许 complete；否则 partial 且说明 scope 未确认。
- 需要用户先滚动至末尾用于独立核对。今后若有足够筛选状态证据，可省去此步骤。

## 已运行验证

- Node v24.19.0、pnpm 11.19.0。
- pnpm typecheck：通过。
- pnpm build：通过，0.2.0 dist 已生成。
- pnpm test：41 项通过，0 失败；完整输出在 TEST-RESULTS.txt。
- node --import tsx scripts/replay-sample.ts：从真实用户首屏转换100条部分 JSON。
- pnpm validate examples/google-thirty-days.supplied-page.partial.json：通过。
- 真实样本字段转换与 ID 分离、100/152 的不完整性：通过离线样本测试。
- 合成测试覆盖跨页去重、无权限、GraphQL errors、429、中途失败、页面变更、abort、checkpoint、旧任务/错误 tab 消息拒绝、worker 重启。
- content 和 worker 测试实际执行构建后的 JS，但 fetch、DOM、Chrome API 由测试模拟，**不等于 Chrome 实测**。

首轮新测试因 tsx CLI 的 IPC socket 权限失败；改用 node --import tsx 后全部通过。没有以失败测试充当成功。

## 仍待验收

| 项目 | 状态 |
|---|---|
| 真实公司/两个 recency 及 DOM 切换 | 已观察 |
| 真实无限滚动存在 | 已观察 |
| 30 days 完整152条 DOM及首中尾链接 | 已观察 |
| 首屏真实字段转换和 topics来源 | 已验证用户响应 |
| 扩展在Chrome加载、发起同源请求 | 用户实际导出产物验证了30 days路径；非代理现场操作录像 |
| 超过首屏的完整提取 | 用户实际导出152题通过；skip=100原始报文未直接复核 |
| 3 months完整494条及尾部核对 | 未验证 |
| popup关闭重开、真实worker休眠 | 未验证（仅模拟通过） |
| 扩展真实导出JSON schema | Google 30 days实际152题导出通过 |
| 实际权限失败/限流响应形状 | 未验证（只支持明确HTTP拒绝；GraphQL错误保守read-failed） |

## 下一步

继续验证3 months：滚动至末尾，Extract problems，确认实际总数和complete；导出JSON供校验。另确认关闭再打开popup能恢复同一任务/结果。没有这些证据前，不宣称两个范围及生命周期验收全部完成。

Chrome 架构参考：[activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)、[worker 生命周期](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)。这些是架构依据，不是 LeetCode 数据源证据。

## 0.2.1 修复记录

用户截图：切换recency后提取被取消，提示“来源范围已改变”；页面首次加载时能提取。该文案定位到worker中的sender.url完整URL比较。

新增模拟回归：当前tab和DOM已经切换至3 months，但消息sender.url仍为初始30 days。旧版在第二个范围的HEARTBEAT校验失败；修复后30 days→3 months→30 days全部通过。没有直接采集用户Chrome的sender元数据，因此这部分为与现象吻合的复现条件，不能冒称浏览器抓包确认。

修复使用实时tabs.get URL + 固定documentId + 顶层frame/tab/task/来源检查；保持真实范围改变时取消，禁止旧结果写入。Chrome官方[MessageSender文档](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender)将sender.url定义为发起连接的页面/框架URL，并提供documentId；本实现不再假设它是实时SPA筛选状态。

本次实际运行pnpm typecheck、pnpm build、pnpm test：均通过，45/45测试通过，完整记录见TEST-RESULTS.txt。构建后同步更新apps/extension/dist和outputs/chrome-extension，两个分发zip也已更新。已保存的0.2.0真实152题导出保持原样，不能将其当成0.2.1的现场回归证据。新版真实连续切换提取、popup恢复仍待用户确认。

## 0.3.0：五个范围支持与实地调查

2026-09-17 用户反馈30 days和3 months测试均正常，确认0.2.1切换修复的真实使用结果。本次未收到3 months JSON，因此记录为用户反馈通过，不冒称已做该文件schema校验。

本次在真实Google页操作下拉菜单，依次观察：

- 6 months：URL favoriteSlug=google-six-months；首条Two Sum题目链接也含相同favoriteSlug。
- More than 6 months：URL favoriteSlug=google-more-than-six-months；首条Add Two Numbers题目链接含相同favoriteSlug。
- All：URL favoriteSlug=google-all；首条Two Sum题目链接含相同favoriteSlug。

调查后恢复原先的3 months选择。本次该页面显示495题，说明旧报告中的494是当时的观察值，不应硬编码。

实现：shared中集中保存五个来源映射；DOM校验要求URL与选中label匹配；API发送实际favoriteSlug。仅30 days有days=30，所有月份范围、开放区间和All均保留days=null。不猜测区间包含关系，也不从已导入范围推导新范围。保留现有分页、去重、取消、documentId/实时URL隔离及全量DOM核对。

实际运行pnpm typecheck、pnpm build、pnpm test，全部通过，52/52测试通过。新增测试覆盖五范围的PROBE→请求变量→导出recency一致性、渲染期间URL/label不一致拒绝、未知范围拒绝，以及同文档五范围顺序切换后回到30 days。响应为明确模拟；新增三个范围尚未用扩展完成现场全量导出验证。

0.3.0 dist、已加载的chrome-extension目录与两个ZIP均已同步。
