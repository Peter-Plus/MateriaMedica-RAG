# 本草问答（BCRAG）

以《本草綱目》为初始语料、可扩展到多部古籍的课程项目：网页版 / Windows Electron 客户端 + Python 服务端 + SQLite 知识库。两端共用页面与后端，提供即时注册登录、历史对话、Markdown 问答和出处展示。服务端完成文本切分、检索、云端模型调用与数据保存。

> 古籍记载供资料检索和学习，不构成诊断、处方或用药建议。

## 在线使用

**网页地址：[https://brag.worldlinesite.com/](https://brag.worldlinesite.com/)**

**Windows 客户端：[下载最新版 ZIP](https://github.com/Peter-Plus/MateriaMedica-RAG/releases/latest/download/BCRAG-Windows-x64.zip)** · [版本与发布说明](https://github.com/Peter-Plus/MateriaMedica-RAG/releases)。解压后运行 `BCRAG.exe`；网页登录页与侧栏也提供下载入口。

使用电脑或手机浏览器直接打开，无需下载客户端；已有客户端账号可以直接登录，历史对话共用。手机端点击“对话”展开历史与退出登录入口。网页登录状态保存在当前标签页的会话存储中，刷新可恢复，关闭标签页后通常需重新登录（浏览器恢复标签页时可能恢复会话）。

网页更新：在 `client/` 运行 `npm ci`、`npm run build:web`，发布 `client/dist/web/` 中的静态文件。操作见[前端更新](docs/部署与更新/前端更新.md)。

## 项目结构

| 路径 | 用途 |
| --- | --- |
| `client/` | 网页与 Electron 共用前端、构建脚本 |
| `server/` | 后端、知识库导入与检索 |
| `文献/原文/` | 可分发的 UTF-8 古籍语料；初始文件为《本草綱目》 |
| `docs/部署与更新/` | 按后端、RAG、前端和文献分类的操作指南 |
| `docs/汇报/` | 提示词与决策记录、五人分工 |
| `docs/` | 策划案、技术报告及上述分类资料 |
| `.agents/skills/bcrag-work-log/` | Codex 协作记录 skill |
| `AGENTS.md` | 项目级 Codex 工作说明 |

## 本地运行

环境准备、模型 Key 配置、知识库导入、前后端启动及常见问题见 [本地运行与调试](docs/部署与更新/本地运行与调试.md)。

### Windows 分发

在 Windows 上的 `client/` 目录执行 `npm run make`。Electron Forge 会在 `client/out/<版本号>/make/zip/win32/x64/` 生成便携 ZIP；解压后运行其中的 `BCRAG.exe`，无需浏览器或安装向导。首次启动默认连接项目 HTTPS 服务端；真实 API Key 不包含在客户端中。

每次交付前端代码更新都要重新运行该命令并确认新 ZIP，具体步骤见[前端更新](docs/部署与更新/前端更新.md)。

便携包按版本放在上述输出目录。客户端默认使用线上服务；左下角“设置”内可开启本地调试，开启后才显示服务器地址和端口。关闭调试并保存即可恢复线上服务。“打开网页版”会使用系统浏览器访问网页端。若 Electron 下载源不可达，可临时设置 `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 后重新执行 `npm install` 和 `npm run make`。

## RAG 流程

`UTF-8 文本 → 章节/条目切分 → SQLite 索引 → 简繁归一化关键词检索 + 可选向量检索 → 相关原文 → 云端 LLM → 带原文出处的回答`

初始文档约 5.3 MB，导入后约 3,360 个片段。首次执行 `python -m server.ingest --embed` 会按批量为未向量化片段调用 embedding API，产生用量；可用 `--embed-document "文件名.txt"` 只处理一本文献。之后同一文档重复导入且内容未变时不会重建索引。问答时如有向量，会将向量检索和关键词检索结果融合。新增古籍和更换 embedding 模型时的操作见[部署与更新](docs/部署与更新/README.md)。

## 文档

- [策划案](docs/策划案.md)
- [技术报告](docs/技术报告.md)
- [部署与更新目录](docs/部署与更新/README.md)
- [文献更新与扩展](docs/部署与更新/文献更新与扩展.md)
- [提示词与决策记录](docs/汇报/提示词与决策记录.md)
- [五人分工计划](docs/汇报/五人分工.md)

模型接口使用阿里云百炼的 OpenAI 兼容协议，当前默认北京区 `qwen3.7-flash` 与 `text-embedding-v4`。地域、模型可用性和价格以[阿里云官方地域文档](https://help.aliyun.com/zh/model-studio/regions)及[模型价格页](https://help.aliyun.com/zh/model-studio/model-pricing)为准。
