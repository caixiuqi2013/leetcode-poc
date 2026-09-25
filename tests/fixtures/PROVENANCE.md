# Fixture provenance

`google-thirty-days.page1.json` is a sanitized user-supplied real response:
skip=0, limit=100, totalLength=152, hasMore=true. One of the 100 rows has no topics.
Only problem and pagination fields remain; status, isInMyFavorites, paidOnly,
acRate, contestPoint and __typename were removed. No personal completion is retained.
The user observed POST https://leetcode.com/graphql/ with favoriteQuestionList.
This is a supplied first page, not a complete extension capture.

`synthetic.json` is an explicitly synthetic contract fixture. Other transformed
response envelopes and non-Google page harnesses in tests are synthetic too.
The checked-in full real export is version 0.2.0; a version-0.4 compatibility test
modifies its metadata and is not a separately observed real export.
