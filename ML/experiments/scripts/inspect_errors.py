"""
eval_case_level.py 의 --dump_errors csv 를 읽어, 틀린 케이스 몇 개를 골라
[query 사진들 | 정답 gallery 사진 | 오답으로 찍힌 top-1 gallery 사진] 그리드로 그려서 PNG 저장.

모델 재실행 없이 파일 시스템 조회 + matplotlib 렌더링만 함.
"""
import argparse
import re
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
from PIL import Image

FN_RE = re.compile(r"(\d+)_c(\d+)s(\d+)_(\d+)\.jpg$", re.I)


def imgs_for_pid(root_sub, pid, limit=3):
    return sorted(p for p in root_sub.glob(f"{pid}_*.jpg"))[:limit]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True, help="예: ML/dataset/derived/MPDD_hard_corrupt/MPDD/pytorch")
    ap.add_argument("--errors_csv", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--case_pids", type=int, nargs="+", default=None,
                     help="보여줄 case_pid 지정. 생략하면 rank 기준 최악 케이스 자동 선택")
    ap.add_argument("--n", type=int, default=4, help="case_pids 생략 시 자동으로 고를 개수")
    args = ap.parse_args()

    root = Path(args.root)
    df = pd.read_csv(args.errors_csv)
    wrong = df[df["rank"] != 1].copy()

    if args.case_pids:
        rows = df[df["case_pid"].isin(args.case_pids)]
    else:
        rows = wrong.sort_values("rank", ascending=False).head(args.n)

    n = len(rows)
    max_cols = 1 + 3 + 2  # query 최대 3장 + 정답 최대 2장  (오답은 별도 열)
    fig, axes = plt.subplots(n, max_cols, figsize=(3 * max_cols, 3.2 * n))
    if n == 1:
        axes = axes[None, :]

    for r, (_, row) in enumerate(rows.iterrows()):
        pid = int(row["case_pid"])
        pred = int(row["top1_pred_pid"])
        rank = int(row["rank"])

        q_imgs = imgs_for_pid(root / "query", pid, limit=3)
        gt_imgs = imgs_for_pid(root / "gallery", pid, limit=2)
        pred_imgs = imgs_for_pid(root / "gallery", pred, limit=1)

        col = 0
        for qi in q_imgs:
            ax = axes[r, col]; ax.imshow(Image.open(qi).convert("RGB")); ax.axis("off")
            if col == 0:
                ax.set_title(f"case {pid}\nquery (corrupted)", fontsize=9)
            col += 1
        while col < 3:
            axes[r, col].axis("off"); col += 1

        for gi in gt_imgs:
            ax = axes[r, col]; ax.imshow(Image.open(gi).convert("RGB")); ax.axis("off")
            ax.set_title("correct gallery", fontsize=9, color="green")
            col += 1
        while col < 5:
            axes[r, col].axis("off"); col += 1

        src = "YT-BB distractor" if pred >= 900000 else f"other dog (pid {pred})"
        for pi in pred_imgs:
            ax = axes[r, col]; ax.imshow(Image.open(pi).convert("RGB")); ax.axis("off")
            ax.set_title(f"wrong top-1\n{src}\nrank={rank}", fontsize=9, color="red")
            col += 1
        while col < max_cols:
            axes[r, col].axis("off"); col += 1

    plt.tight_layout()
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(args.out, dpi=110)
    print("saved", args.out)


if __name__ == "__main__":
    main()
