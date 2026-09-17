# 真实样本
`google-thirty-days.page1.json` 来自用户本次提供的真实响应 data 部分，skip=0、limit=100、totalLength=152、hasMore=true。100 条中 1 条 topics 为空。仅保留题目字段，删除 status、isInMyFavorites、paidOnly、acRate、contestPoint、__typename 等无关字段；不复制用户解题进度。
请求来源为用户观察的 POST https://leetcode.com/graphql/，operationName=favoriteQuestionList。不是扩展现场抓取，也不是完整集合。
`synthetic.json` 为上一版内部契约合成样本。测试中所有其他变体均为合成。
