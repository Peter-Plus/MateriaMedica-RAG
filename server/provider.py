"""Small OpenAI-compatible HTTP adapter; API credentials stay on the server."""

import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from .config import API_BASE_URL, API_KEY, EMBED_DIMENSIONS


class ProviderError(RuntimeError):
    pass


def _post(endpoint, payload, timeout=60):
    if not API_KEY:
        raise ProviderError("尚未配置模型 API Key")
    request = Request(
        API_BASE_URL + endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": "Bearer " + API_KEY, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except HTTPError as error:
        detail = error.read(400).decode("utf-8", errors="replace")
        raise ProviderError("模型接口返回 HTTP {}：{}".format(error.code, detail)) from error
    except URLError as error:
        raise ProviderError("无法连接模型接口：{}".format(error.reason)) from error


def embeddings(texts, model):
    response = _post("/embeddings", {
        "model": model,
        "input": texts,
        "dimensions": EMBED_DIMENSIONS,
    })
    data = sorted(response.get("data", []), key=lambda item: item.get("index", 0))
    return [item["embedding"] for item in data]


def chat(messages, model):
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "max_tokens": 900,
    }
    if model.startswith("qwen"):
        payload["enable_thinking"] = False
    response = _post("/chat/completions", payload, timeout=90)
    try:
        return response["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError, AttributeError) as error:
        raise ProviderError("模型接口响应格式异常") from error
