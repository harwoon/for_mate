"""
YOLO(yolo11m) vs torchvision Faster R-CNN v2 크롭 박스 IoU 비교.

collect_dataset.py 의 탐지기를 ultralytics YOLO(AGPL-3.0) -> torchvision(BSD-3) 로
바꿨는데, 두 탐지기가 실제로 "같은 동물 박스"를 잡는지 확인하는 스크립트.

- 두 탐지기 각각에서 crop() 과 동일한 규칙(동물 클래스 중 면적 최대 박스 1개)으로 박스 선택
- 두 박스의 IoU 계산, 케이스 분류(both / yolo_only / tv_only / neither)
- 요약 통계 + CSV, (옵션) 최악 IoU 케이스 시각화 그리드

기본 입력: dataset/raw/YT-BB-Dog (실제 영상 프레임, 구도 다양). processed_animals 는
이미 224 크롭이라 비교 의미가 적다.

  python scripts/compare_detectors.py --n 300
  python scripts/compare_detectors.py --n 300 --out_grid dataset/derived/detector_iou_worst.png
"""
import argparse
import csv
import random
from collections import Counter
from pathlib import Path

import cv2
import numpy as np
import torch
from torchvision.models.detection import (
    FasterRCNN_ResNet50_FPN_V2_Weights,
    fasterrcnn_resnet50_fpn_v2,
)
from ultralytics import YOLO

ML_DIR = Path(__file__).resolve().parent.parent  # ML/  (이 파일은 ML/scripts/ 안)
ANIMAL_CLASSES = {"bird", "cat", "dog", "horse", "sheep",
                  "cow", "elephant", "bear", "zebra", "giraffe"}
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def iou(a, b):
    """a, b: (x1, y1, x2, y2) 또는 None."""
    if a is None or b is None:
        return 0.0
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0.0, ix2 - ix1) * max(0.0, iy2 - iy1)
    union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / union if union > 0 else 0.0


def largest_animal_box(boxes, names, scores, thresh):
    """collect_dataset.crop() 과 동일: 동물 클래스 & score>=thresh 중 면적 최대 1개."""
    best, area = None, 0.0
    for (x1, y1, x2, y2), nm, sc in zip(boxes, names, scores):
        if nm not in ANIMAL_CLASSES or sc < thresh:
            continue
        a = (x2 - x1) * (y2 - y1)
        if a > area:
            area, best = a, (float(x1), float(y1), float(x2), float(y2))
    return best


class YoloDet:
    def __init__(self, weight=None):
        # yolo11n(nano)은 저해상도에서 탐지율이 크게 떨어져 yolo11m을 기본값으로 둠.
        # 파일이 없으면 ultralytics 가 이름으로 자동 다운로드.
        self.m = YOLO(weight or str(ML_DIR / "checkpoints" / "yolo11m.pt"))

    def __call__(self, img_bgr, thresh):
        boxes, names, scores = [], [], []
        for res in self.m(img_bgr, verbose=False):
            for b in res.boxes:
                boxes.append(list(map(float, b.xyxy[0])))
                names.append(self.m.names[int(b.cls[0])])
                scores.append(float(b.conf[0]))
        return largest_animal_box(boxes, names, scores, thresh)


class TvDet:
    def __init__(self):
        w = FasterRCNN_ResNet50_FPN_V2_Weights.DEFAULT
        # 내부 임계값은 낮게 두고, 비교는 largest_animal_box 의 thresh 로 통일
        self.m = fasterrcnn_resnet50_fpn_v2(weights=w, box_score_thresh=0.05).eval().to(DEVICE)
        self.pre = w.transforms()
        self.cats = w.meta["categories"]

    @torch.no_grad()
    def __call__(self, img_bgr, thresh):
        rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        t = torch.from_numpy(rgb).permute(2, 0, 1).contiguous()
        out = self.m([self.pre(t).to(DEVICE)])[0]
        boxes = [list(map(float, b)) for b in out["boxes"].cpu()]
        names = [self.cats[int(l)] for l in out["labels"].cpu()]
        scores = [float(s) for s in out["scores"].cpu()]
        return largest_animal_box(boxes, names, scores, thresh)


def make_grid(rows, out_path, k):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.patches as patches
    import matplotlib.pyplot as plt

    both = sorted((r for r in rows if r["category"] == "both"), key=lambda r: r["_iou"])
    disagree = [r for r in rows if r["category"] in ("yolo_only", "tv_only")]
    picks = both[:k] + disagree[:max(0, k - len(both[:k]))]
    if not picks:
        print("그리드에 그릴 케이스 없음")
        return

    cols = 4
    n_rows = (len(picks) + cols - 1) // cols
    fig, axes = plt.subplots(n_rows, cols, figsize=(cols * 3.2, n_rows * 3.2))
    axes = np.atleast_1d(axes).ravel()
    for ax in axes:
        ax.axis("off")
    for ax, r in zip(axes, picks):
        im = cv2.cvtColor(cv2.imread(r["path"]), cv2.COLOR_BGR2RGB)
        ax.imshow(im)
        for box, color in ((r["_yb"], "lime"), (r["_tb"], "red")):
            if box:
                x1, y1, x2, y2 = box
                ax.add_patch(patches.Rectangle((x1, y1), x2 - x1, y2 - y1,
                             fill=False, edgecolor=color, linewidth=2))
        ax.set_title(f"{r['category']}  IoU={r['_iou']:.2f}", fontsize=9)
    fig.suptitle("green = YOLO   red = torchvision", fontsize=11)
    fig.tight_layout()
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=110)
    print(f"그리드 -> {out_path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(ML_DIR / "dataset" / "raw" / "YT-BB-Dog"))
    ap.add_argument("--n", type=int, default=300)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--yolo", default=None,
                    help="YOLO 가중치 경로/이름 (기본: checkpoints/yolo11m.pt)")
    ap.add_argument("--score_thresh", type=float, default=0.25,
                    help="두 탐지기에 공통 적용할 score 하한 (YOLO 기본 conf=0.25)")
    ap.add_argument("--out_csv", default=str(ML_DIR / "dataset" / "derived" / "detector_iou.csv"))
    ap.add_argument("--out_grid", default=None, help="최악 IoU N개 시각화 png 경로")
    ap.add_argument("--grid_n", type=int, default=12)
    args = ap.parse_args()

    paths = sorted(Path(args.src).rglob("*.jpg"))
    random.Random(args.seed).shuffle(paths)
    paths = paths[: args.n]
    print(f"{len(paths)} images  <-  {args.src}  (device={DEVICE})")

    yolo, tv = YoloDet(args.yolo), TvDet()
    rows = []
    for i, p in enumerate(paths, 1):
        im = cv2.imread(str(p))
        if im is None:
            continue
        yb = yolo(im, args.score_thresh)
        tb = tv(im, args.score_thresh)
        cat = ("both" if yb and tb else
               "yolo_only" if yb else
               "tv_only" if tb else "neither")
        rows.append(dict(
            path=str(p), category=cat, iou=round(iou(yb, tb), 4),
            yolo_box="" if yb is None else " ".join(f"{v:.0f}" for v in yb),
            tv_box="" if tb is None else " ".join(f"{v:.0f}" for v in tb),
            _iou=iou(yb, tb), _yb=yb, _tb=tb,
        ))
        if i % 50 == 0:
            print(f"  {i}/{len(paths)}")

    Path(args.out_csv).parent.mkdir(parents=True, exist_ok=True)
    fields = ["path", "category", "iou", "yolo_box", "tv_box"]
    with open(args.out_csv, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    n = len(rows)
    cc = Counter(r["category"] for r in rows)
    both = np.array([r["_iou"] for r in rows if r["category"] == "both"])
    print(f"\n=== {n} images | score_thresh={args.score_thresh} ===")
    for k in ("both", "yolo_only", "tv_only", "neither"):
        print(f"  {k:10s} {cc[k]:4d}  ({cc[k] / n:.1%})")
    if len(both):
        print(f"\n둘 다 탐지 {len(both)}장  IoU:  mean {both.mean():.3f}  "
              f"median {np.median(both):.3f}  min {both.min():.3f}")
        for thr in (0.5, 0.7, 0.9):
            print(f"  IoU >= {thr}:  {(both >= thr).mean():.1%}")
    agree = cc["both"] + cc["neither"]
    print(f"\n탐지 유무 일치율(both+neither): {agree / n:.1%}")
    print(f"CSV -> {args.out_csv}")

    if args.out_grid:
        make_grid(rows, args.out_grid, args.grid_n)


if __name__ == "__main__":
    main()
