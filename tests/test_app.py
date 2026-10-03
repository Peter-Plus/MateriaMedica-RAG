import json
import os
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen


_temp = tempfile.TemporaryDirectory()
os.environ["BCRAG_DATA_DIR"] = _temp.name

from server import api, auth, knowledge  # noqa: E402
from server.db import connect, init_db  # noqa: E402


SAMPLE = """==============================
【草之一】草部 山草类
==============================
甘草 （《本經》上品）

釋名

密甘、國老。

集解

甘草生河西川谷。

==============================
【草之二】草部 山草类
==============================
人參 （《本經》上品）

釋名

神草、地精。

集解

人參有五葉。
"""


class AppTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.source = Path(_temp.name) / "sample.txt"
        cls.source.write_text(SAMPLE, encoding="utf-8")
        knowledge.ingest_file(cls.source)
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), api.Handler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = "http://127.0.0.1:{}".format(cls.httpd.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=3)
        _temp.cleanup()

    def request(self, route, method="GET", data=None, token=None):
        body = json.dumps(data).encode() if data is not None else None
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        req = Request(self.base + route, data=body, headers=headers, method=method)
        with urlopen(req, timeout=5) as response:
            return json.load(response)

    def test_ingest_update_and_simplified_search(self):
        first = knowledge.ingest_file(self.source)
        self.assertFalse(first["changed"])
        results = knowledge.search("人参有哪些记载")
        self.assertTrue(results)
        self.assertEqual(results[0]["title"], "人參")
        self.assertGreater(results[0]["start_line"], 0)
        changed = Path(_temp.name) / "update.txt"
        changed.write_text("甘草 （《本經》上品）\n\n新的甘草条目内容。", encoding="utf-8")
        self.assertTrue(knowledge.ingest_file(changed)["changed"])
        changed.write_text("甘草 （《本經》上品）\n\n更新后的甘草条目内容。", encoding="utf-8")
        self.assertTrue(knowledge.ingest_file(changed)["changed"])
        with connect() as con:
            rows = con.execute("SELECT content FROM chunks c JOIN documents d ON d.id=c.document_id WHERE d.name='update.txt'").fetchall()
        self.assertTrue(all("新的甘草" not in row[0] for row in rows))

    def test_second_classic_keeps_its_own_source(self):
        source = Path(_temp.name) / "伤寒论.txt"
        source.write_text("太阳病，头痛发热，汗出恶风，桂枝汤主之。\n桂枝汤方见于此篇。", encoding="utf-8")
        knowledge.ingest_file(source)
        results = knowledge.search("桂枝汤主之")
        self.assertTrue(any(row["name"] == "伤寒论.txt" for row in results))
        self.assertTrue(any(row["name"] == "sample.txt" for row in knowledge.search("人参有哪些记载")))
        with patch.object(knowledge, "embeddings", return_value=[[0.1, 0.2]]):
            self.assertEqual(knowledge.embed_pending(max_chunks=1, document_name="伤寒论.txt"), 1)
        with connect() as con:
            names = [row[0] for row in con.execute(
                "SELECT d.name FROM chunks c JOIN documents d ON d.id=c.document_id "
                "WHERE c.vector_json IS NOT NULL")]
        self.assertEqual(names, ["伤寒论.txt"])

    def test_registration_history_and_account_isolation(self):
        alice = self.request("/api/auth/register", "POST", {"username": "alice1", "password": "password123"})
        bob = self.request("/api/auth/register", "POST", {"username": "bobby1", "password": "password456"})
        self.assertEqual(self.request("/api/me", token=alice["token"])["user"]["username"], "alice1")
        with patch.object(api, "API_KEY", "test-key"), patch.object(api, "chat", return_value="甘草又称国老[1]。"):
            result = self.request("/api/chat", "POST", {"question": "甘草的别名是什么"}, alice["token"])
        self.assertEqual(result["message"]["sources"][0]["title"], "甘草")
        cid = result["conversation_id"]
        self.assertEqual(len(self.request("/api/conversations/{}/messages".format(cid), token=alice["token"])["messages"]), 2)
        with self.assertRaises(HTTPError) as error:
            self.request("/api/conversations/{}/messages".format(cid), token=bob["token"])
        self.assertEqual(error.exception.code, 404)
        self.assertEqual(self.request("/api/conversations", token=bob["token"])["conversations"], [])
        with self.assertRaises(HTTPError):
            self.request("/api/auth/login", "POST", {"username": "alice1", "password": "wrongpass"})


if __name__ == "__main__":
    unittest.main()
