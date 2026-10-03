import argparse

from .db import init_db
from .knowledge import search


def main():
    parser = argparse.ArgumentParser(description="检查知识库检索结果（无需模型 API Key）")
    parser.add_argument("question")
    args = parser.parse_args()
    init_db()
    for index, row in enumerate(search(args.question), 1):
        print("[{}] {} / {} / {} ({}–{})".format(
            index, row["name"], row["section"], row["title"],
            row["start_line"], row["end_line"]))
        print(row["content"][:200].replace("\n", " "))


if __name__ == "__main__":
    main()
