# LeetCode 公司题单 POC 0.4.0

支持 Google 的30 days、3 months、6 months、More than 6 months和All。**现在可在页面任何滚动位置提取，无需提前加载题目行，也不会替用户自动滚动。**

提取语义明确为**完整 company + recency 题单**：忽略页面额外的搜索、难度/topic等筛选和排序，接口使用已观察到的空额外筛选与CUSTOM_ASCENDING排序。不会把当前可见行当作结果集合。面板与JSON中的`scope`均说明这一语义。

30 days实际152题导出已验证；用户已反馈0.2.1的30 days/3 months切换提取正常。0.4.0无滚动行为已通过模拟回归，仍需实际Chrome复测。

## 安装、升级与操作

1. chrome://extensions → Load unpacked，选择`apps/extension/dist`，或旁边独立的`chrome-extension`目录。
2. 已安装时点Reload，确认0.4.0，再刷新LeetCode一次，替换旧版content script。
3. 在Google公司页选好recency，在顶部、中部或底部都可打开扩展并点击Extract problems。不必清空搜索/其他筛选；这些条件不应用于导出。
4. 刚切换范围、页面标题/下拉框尚未就绪时，会等待最多10秒；期间换到另一个范围则中止。
5. 可关闭popup，普通点击与滚动不取消任务。提取时不要改变公司/recency；发生实际范围变化会取消。Cancel仍可随时停止请求。
6. 提取结束后查看API总数、唯一题数、complete/partial与topics覆盖；Export JSON保存结果。Retry开始新任务。

## 构建与测试

Node24.19.0、pnpm11.19.0，版本及锁文件已固定。

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm typecheck
pnpm build
pnpm test
pnpm validate examples/google-thirty-days.live.complete.json
```

测试使用构建产物，先build。实际测试输出在TEST-RESULTS.txt。`node --import tsx scripts/replay-sample.ts`可重建仅100条的离线部分示例，不是现场提取。

## 来源、范围与完整性

真实来源为用户提供的POST https://leetcode.com/graphql/、operationName=favoriteQuestionList。content script在隔离世界用既有同源会话主动请求，每次100条，按实际行数推进skip直到hasMore=false。一次一个请求，15秒超时，最多1000页，不自动重试429或访问拒绝。

`complete`要求已验证的来源/ID映射、分页结束、总数稳定、唯一题数等于已知总数、没有无效必需字段/冲突/失败；**与DOM题目数量、滚动位置或页面额外排序无关**。0条只有在响应明确totalLength=0、hasMore=false且结构正常时才是真空结果。失败或权限拒绝不能伪装成空结果。

题目以内部id去重，questionFrontendId独立作为字符串保存。topics来自topicTags.name；缺少为[]，不猜分类。frequency保留原值、不解释单位；rank=null，不以数组位置编造排名。topics覆盖率独立于题目集合完整性。

| recency label | favoriteSlug | days |
|---|---|---|
| 30 days | google-thirty-days | 30 |
| 3 months | google-three-months | null |
| 6 months | google-six-months | null |
| More than 6 months | google-more-than-six-months | null |
| All | google-all | null |

所有映射均观察过真实页面。每个范围独立读取，不从其他范围合并、相减或推导。只支持Google当前五个已确认范围，未知范围失败关闭。

0.4.0新增导出字段：

```json
"scope": {
  "kind": "company-recency",
  "pageFiltersApplied": false,
  "pageSortApplied": false,
  "sort": "CUSTOM_ASCENDING"
}
```

schemaVersion维持1.0，extractorVersion标明0.4.0；共享schema继续接受旧版文件，但0.4.0文件必须带scope。将来若实现“完全遵循页面额外筛选”，应新增明确模式及契约，不混用此结果。

## 架构与恢复

- popup：React界面、状态、预览、schema验证后下载。
- worker：任务协调；chrome.storage.local每页checkpoint；扩展sender、顶层tab、documentId、任务ID和实时tabs.get URL校验。
- content：DOM只确认公司与recency，负责同源分页；等待页面就绪；MutationObserver、每页上下文检查和心跳防止范围改变。不访问页面JS私有缓存，不假定可以读取过去网络响应。
- shared：类型/schema、recency映射、来源转换、分页引擎和就绪等待。
- web：只保留workspace位置，不实现网站、账号、数据库或部署。

worker休眠后可由内容消息唤醒并从storage读取任务；超过15秒无心跳时重新打开popup标记interrupted，用户Retry。浏览器冻结标签页可能保守中断；不承诺断点续传。页面关闭保留partial checkpoint，主动取消/范围改变清除本次结果，旧结果不能覆盖新任务。

## 权限与隐私

仅activeTab、scripting、storage，无全站host、Cookie、debugger、webRequest权限。不读取/复制凭证，不传到外部服务器。只发送所需列表请求，不请求status/isInMyFavorites等个人进度。导出使用字段白名单，sourceUrl只保留公司路径和favoriteSlug。

## 排错

- unsupported-scope：尚不支持该公司/范围。
- context-not-ready：页面10秒内未显示与URL一致的公司/范围，待页面就绪后Retry。
- cancelled：当前公司/recency变化或用户Cancel，防止混合结果。
- no-access：HTTP401/403，确认页面自身可访问，不需要发送凭证。
- rate-limited：稍后手动Retry。
- read-failed：超时、网络、GraphQL错误、非JSON或schema变化；已有结果仅partial。
- interrupted：任务失联/标签页冻结；Retry。

以前的DOM_SCOPE_UNVERIFIED/“滚动到底”限制只属于0.3.0及更早版本。若还看到该提示，检查版本并刷新来源页一次。

[验证报告](VALIDATION.md)区分真实样本、用户反馈与模拟测试；[真实导出校验](LIVE-VALIDATION.json)对应原样保存的0.2.0真实152题文件。
