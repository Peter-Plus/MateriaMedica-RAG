"""UTF-8 text ingestion and retrieval for the course knowledge base."""

import hashlib
import html
import json
import math
import re
from collections import defaultdict
from pathlib import Path

from .config import EMBED_MODEL, MAX_DOCUMENT_BYTES
from .db import connect, transaction, utcnow
from .provider import embeddings

try:
    from opencc import OpenCC
    _to_traditional = OpenCC("s2t").convert
except ImportError:
    # Full conversion is provided by opencc-python-reimplemented in deployment.
    _COMMON_MAP = str.maketrans({
        "参": "參", "黄": "黃", "药": "藥", "纲": "綱", "别": "別",
        "记": "記", "载": "載", "归": "歸", "乌": "烏", "陈": "陳",
        "党": "黨", "灵": "靈", "银": "銀", "翘": "翹", "蓝": "藍",
        "叶": "葉", "绿": "綠", "苏": "蘇", "贝": "貝", "麦": "麥",
        "当": "當", "龙": "龍", "风": "風", "门": "門", "头": "頭",
        "气": "氣", "热": "熱", "温": "溫", "补": "補", "发": "發",
        "实": "實", "书": "書", "经": "經", "观": "觀", "连": "連",
    })
    _to_traditional = lambda value: value.translate(_COMMON_MAP)


SECTION_RE = re.compile(r"^【([^】]+)】(.*)$")
ENTRY_RE = re.compile(r"^([^\s【】︰:]{1,18})\s+（《[^》]{1,30}》")


def _split_long(text, limit=850, overlap=100):
    if len(text) <= limit:
        return [text]
    result = []
    step = limit - overlap
    for start in range(0, len(text), step):
        part = text[start:start + limit].strip()
        if part:
            result.append(part)
        if start + limit >= len(text):
            break
    return result


def split_document(text):
    """Yield (section, title, start_line, end_line, content)."""
    section = "卷首"
    title = "卷首"
    parts = []
    start_line = 1
    end_line = 1
    previous_separator = False

    def flush():
        if not parts:
            return []
        body = "\n".join(parts).strip()
        return [(section, title, start_line, end_line, chunk)
                for chunk in _split_long(body) if len(chunk) >= 15]

    for number, raw in enumerate(text.splitlines(), 1):
        line = html.unescape(raw).strip()
        if not line:
            continue
        if line.startswith("================"):
            previous_separator = True
            continue
        match = SECTION_RE.match(line) if previous_separator else None
        previous_separator = False
        if match:
            yield from flush()
            parts = []
            section = (match.group(1) + " " + match.group(2)).strip()
            title = section
            start_line = number
            end_line = number
            continue
        entry = ENTRY_RE.match(line)
        if entry:
            yield from flush()
            parts = []
            title = entry.group(1)
            start_line = number
        if not parts:
            start_line = number
        parts.append(line)
        end_line = number
        if sum(len(part) for part in parts) >= 750:
            yield from flush()
            parts = []
    yield from flush()


def ingest_file(path, display_name=None):
    path = Path(path)
    if path.suffix.lower() != ".txt":
        raise ValueError("仅支持 UTF-8 编码的 .txt 文件")
    if path.stat().st_size > MAX_DOCUMENT_BYTES:
        raise ValueError("文件超过大小限制")
    data = path.read_bytes()
    text = data.decode("utf-8-sig")
    name = display_name or path.name
    digest = hashlib.sha256(data).hexdigest()
    chunks = list(split_document(text))
    if not chunks:
        raise ValueError("没有可索引的正文")
    with transaction() as con:
        old = con.execute("SELECT id, sha256 FROM documents WHERE name=?", (name,)).fetchone()
        if old and old["sha256"] == digest:
            return {"name": name, "chunks": len(chunks), "changed": False}
        if old:
            con.execute("DELETE FROM documents WHERE id=?", (old["id"],))
        cur = con.execute(
            "INSERT INTO documents(name, sha256, chunk_count, updated_at) VALUES (?, ?, ?, ?)",
            (name, digest, len(chunks), utcnow()),
        )
        con.executemany(
            "INSERT INTO chunks(document_id, section, title, start_line, end_line, content) VALUES (?, ?, ?, ?, ?, ?)",
            ((cur.lastrowid, *chunk) for chunk in chunks),
        )
    return {"name": name, "chunks": len(chunks), "changed": True}


def embed_pending(batch_size=10, max_chunks=None, document_name=None):
    total = 0
    if document_name is not None:
        with connect() as con:
            if not con.execute("SELECT 1 FROM documents WHERE name=?", (document_name,)).fetchone():
                raise ValueError("知识库中没有该文献：{}".format(document_name))
    while True:
        with connect() as con:
            if document_name is None:
                rows = con.execute(
                    "SELECT id, section, title, content FROM chunks "
                    "WHERE vector_json IS NULL ORDER BY id LIMIT ?",
                    (min(batch_size, 10),),
                ).fetchall()
            else:
                rows = con.execute(
                    "SELECT c.id, c.section, c.title, c.content FROM chunks c "
                    "JOIN documents d ON d.id=c.document_id "
                    "WHERE c.vector_json IS NULL AND d.name=? ORDER BY c.id LIMIT ?",
                    (document_name, min(batch_size, 10)),
                ).fetchall()
        if not rows or (max_chunks is not None and total >= max_chunks):
            break
        if max_chunks is not None:
            rows = rows[:max_chunks - total]
        texts = ["{} / {}\n{}".format(r["section"], r["title"], r["content"]) for r in rows]
        vectors = embeddings(texts, EMBED_MODEL)
        if len(vectors) != len(rows):
            raise RuntimeError("向量接口返回数量不匹配")
        with transaction() as con:
            con.executemany(
                "UPDATE chunks SET vector_json=? WHERE id=?",
                ((json.dumps(vector, separators=(",", ":")), row["id"])
                 for row, vector in zip(rows, vectors)),
            )
        total += len(rows)
    return total


def _lexical(query, limit=25):
    # Include Hanzi bigrams so a simplified question can still match a traditional
    # herb name even when the rest of the sentence is phrased differently.
    variants = [query, _to_traditional(query)]
    phrases = [term for variant in variants
               for term in re.split(r"[\s，。？！、,.;；:：]+", variant) if term]
    terms = []
    for phrase in phrases:
        if len(phrase) >= 3:
            terms.append(phrase)
        terms.extend(phrase[i:i + 2] for i in range(max(0, len(phrase) - 1)))
    terms = list(dict.fromkeys(term for term in terms if len(term) >= 2))[:18]
    candidates = {}
    with connect() as con:
        for term in terms:
            if len(term) >= 3:
                rows = con.execute(
                    "SELECT c.id, c.title, bm25(chunks_fts) AS rank FROM chunks_fts "
                    "JOIN chunks c ON c.id=chunks_fts.rowid WHERE chunks_fts MATCH ? "
                    "ORDER BY rank LIMIT ?",
                    ('"' + term.replace('"', '""') + '"', limit),
                ).fetchall()
            else:
                rows = con.execute(
                    "SELECT id, title, 0 AS rank FROM chunks "
                    "WHERE content LIKE ? OR title LIKE ? "
                    "ORDER BY CASE WHEN title=? THEN 0 WHEN title LIKE ? THEN 1 ELSE 2 END, id LIMIT ?",
                    ("%" + term + "%", "%" + term + "%", term, "%" + term + "%", limit),
                ).fetchall()
            for rank, row in enumerate(rows, 1):
                bonus = 0.05 if row["title"] == term else (0.015 if term in row["title"] else 0)
                candidates[row["id"]] = candidates.get(row["id"], 0) + 1 / (60 + rank) + bonus
    return candidates


def _cosine(a, b):
    if len(a) != len(b):
        return -1
    dot = sum(x * y for x, y in zip(a, b))
    an = math.sqrt(sum(x * x for x in a))
    bn = math.sqrt(sum(x * x for x in b))
    return dot / (an * bn) if an and bn else -1


def search(query, limit=5, query_vector=None):
    scores = defaultdict(float, _lexical(query))
    if query_vector:
        with connect() as con:
            rows = con.execute("SELECT id, vector_json FROM chunks WHERE vector_json IS NOT NULL").fetchall()
        ranked = sorted(
            ((_cosine(query_vector, json.loads(row["vector_json"])), row["id"]) for row in rows),
            reverse=True,
        )[:25]
        for rank, (_, chunk_id) in enumerate(ranked, 1):
            scores[chunk_id] += 1 / (60 + rank)
    if not scores:
        return []
    ids = [chunk_id for chunk_id, _ in sorted(scores.items(), key=lambda pair: pair[1], reverse=True)[:limit]]
    placeholders = ",".join("?" for _ in ids)
    with connect() as con:
        rows = con.execute(
            "SELECT c.id, c.section, c.title, c.start_line, c.end_line, c.content, d.name "
            "FROM chunks c JOIN documents d ON d.id=c.document_id "
            "WHERE c.id IN ({})".format(placeholders), ids,
        ).fetchall()
    lookup = {row["id"]: dict(row) for row in rows}
    return [lookup[chunk_id] for chunk_id in ids if chunk_id in lookup]


def status():
    with connect() as con:
        documents = [dict(row) for row in con.execute(
            "SELECT name, chunk_count, updated_at FROM documents ORDER BY name")]
        vectors = con.execute("SELECT COUNT(*) FROM chunks WHERE vector_json IS NOT NULL").fetchone()[0]
    return {"documents": documents, "embedded_chunks": vectors}
