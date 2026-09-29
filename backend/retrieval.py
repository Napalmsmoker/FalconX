"""FAISS cosine ranking with gallery-row tie breaking."""
import faiss
import numpy as np


def search_index(index, queries, top_k):
    if top_k < 1:
        raise ValueError("top_k must be positive")
    count = min(top_k, index.ntotal)
    if count == 0:
        return [(np.empty(0, dtype=np.float32), np.empty(0, dtype=np.int64)) for _ in queries]
    # Request one extra item to detect a tie at the cutoff without an Nq x Ng matrix.
    scores, ids = index.search(np.ascontiguousarray(queries, dtype=np.float32), min(count + 1, index.ntotal))
    results = []
    for q, s, idx in zip(queries, scores, ids):
        if len(s) > count and s[count - 1] == s[count]:
            # range_search is strict (> radius); include every item tied at the cutoff.
            radius = float(np.nextafter(s[count - 1], np.float32(-np.inf)))
            _, s, idx = index.range_search(q[None, :], radius)
        order = np.lexsort((idx, -s))[:count]
        results.append((np.clip(s[order], -1, 1), idx[order]))
    return results
