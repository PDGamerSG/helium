// 15_fulltext: Lucene full-text lookup over a label's text index. Params: $index ('episode_text'|'fact_text'|'decision_text'),
// $q (sanitised: plain tokens joined with OR, see hiveboard.memory.sanitize_fulltext), $k.
CALL db.index.fulltext.queryNodes($index, $q) YIELD node, score
RETURN node, score
ORDER BY score DESC
LIMIT $k
