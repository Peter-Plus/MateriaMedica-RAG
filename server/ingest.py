import argparse

from .db import init_db
from .knowledge import embed_pending, ingest_file


def main():
    parser = argparse.ArgumentParser(description="导入 UTF-8 文本，按需构建向量索引")
    parser.add_argument("files", nargs="*", help=".txt 文件，可一次导入多个")
    parser.add_argument("--embed", action="store_true", help="调用配置的模型 API 补齐向量")
    parser.add_argument("--max-embed", type=int, default=None, help="仅用于试运行的向量数量上限")
    parser.add_argument("--embed-document", help="仅为指定文献补向量，使用导入时的文件名")
    args = parser.parse_args()
    if not args.files and not args.embed:
        parser.error("请给出文本文件或 --embed")
    if args.embed_document and not args.embed:
        parser.error("--embed-document 需要与 --embed 一起使用")
    init_db()
    for path in args.files:
        print(ingest_file(path))
    if args.embed:
        print("新增向量：{}".format(embed_pending(max_chunks=args.max_embed,
                                             document_name=args.embed_document)))


if __name__ == "__main__":
    main()
