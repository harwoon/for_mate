"""
손으로 라벨한 정답 박스(COCO json) 대비 각 탐지기의 크롭 박스 IoU 평가.

탐지기: YOLO(yolo11m, AGPL) / torchvision Faster R-CNN v2(BSD-3) / RT-DETR(Apache-2.0).
- crop() 과 동일한 규칙(동물 클래스 중 score>=thresh, 면적 최대 박스 1개)으로 탐지기 박스 선택
- 그 박스 vs GT 박스 -> IoU
- 탐지기별: 미탐율, 탐지분 평균/중앙 IoU, IoU>=0.5/0.7/0.9 비율
- (옵션) 최악 IoU 케이스 시각화 그리드

  python scripts/compare_detectors.py
  python scripts/compare_detectors.py --out_grid dataset/derived/detector_gt_iou.png
  python scripts/compare_detectors.py --gt <other.json> --img_dir <dir> --score_thresh 0.4
  python scripts/compare_detectors.py --skip_rtdetr        # transformers 없이
"""
import argparse
import csv
import json
from pathlib import Path

import cv2
import numpy as np
import torch
from torchvision.models.detection import (
    FasterRCNN_ResNet50_FPN_V2_Weights,
    fasterrcnn_resnet50_fpn_v2,
)
from ultralytics import YOLO

try:
    from transformers import RTDetrForObjectDetection, RTDetrImageProcessor
except ImportError:
    RTDetrForObjectDetection = RTDetrImageProcessor = None

ML_DIR = Path(__file__).resolve().parent.parent  # ML/  (이 파일은 ML/scripts/ 안)
ANIMAL_CLASSES = {"bird", "cat", "dog", "horse", "sheep",
                  "cow", "elephant", "bear", "zebra", "giraffe"}
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

GT_DEFAULT = ML_DIR / "dataset" / "derived" / "detector_gt" / "detector_gt_shelter_dog.json"
IMG_DEFAULT = ML_DIR / "dataset" / "derived" / "detector_gt" / "dog"


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


class RtDetrDet:
    def __init__(self, name="PekingU/rtdetr_r50vd"):
        self.proc = RTDetrImageProcessor.from_pretrained(name)
        self.m = RTDetrForObjectDetection.from_pretrained(name).eval().to(DEVICE)
        self.cats = self.m.config.id2label

    @torch.no_grad()
    def __call__(self, img_bgr, thresh):
        rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
        inp = self.proc(images=rgb, return_tensors="pt").to(DEVICE)
        out = self.m(**inp)
        h, w = img_bgr.shape[:2]
        res = self.proc.post_process_object_detection(
            out, target_sizes=[(h, w)], threshold=0.05)[0]  # 비교는 largest_animal_box의 thresh로 통일
        boxes = [list(map(float, b)) for b in res["boxes"].cpu()]
        names = [self.cats[int(l)] for l in res["labels"].cpu()]
        scores = [float(s) for s in res["scores"].cpu()]
        return largest_animal_box(boxes, names, scores, thresh)


def load_coco_gt(json_path):
    """COCO json -> {file_name: (x1,y1,x2,y2)}. 이미지당 박스 여러 개면 면적 최대 1개."""
    d = json.load(open(json_path, encoding="utf-8"))
    id2name = {im["id"]: im["file_name"] for im in d["images"]}
    best = {}  # file_name -> (box, area)
    for a in d["annotations"]:
        x, y, w, h = a["bbox"]
        fn, area = id2name[a["image_id"]], w * h
        if fn not in best or area > best[fn][1]:
            best[fn] = ((x, y, x + w, y + h), area)
    return {fn: box for fn, (box, _) in best.items()}


# rows 의 iou_* / *_missed / _b_* 키 접미사와 표시색
DETS = [("YOLO", "yolo", "lime"),
        ("torchvision", "tv", "red"),
        ("RT-DETR", "rtdetr", "gold")]


def make_grid(rows, out_path, k):
    """탐지기별 최악 IoU k개: GT(파랑) + 탐지기별 박스."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.patches as patches
    import matplotlib.pyplot as plt

    keys = [k_ for _, k_, _ in DETS if f"iou_{k_}" in rows[0]]
    picks = sorted(rows, key=lambda r: min(r[f"iou_{k_}"] for k_ in keys))[:k]
    if not picks:
        return
    cols = 4
    n_rows = (len(picks) + cols - 1) // cols
    fig, axes = plt.subplots(n_rows, cols, figsize=(cols * 3.2, n_rows * 3.2))
    axes = np.atleast_1d(axes).ravel()
    for ax in axes:
        ax.axis("off")
    for ax, r in zip(axes, picks):
        ax.imshow(cv2.cvtColor(cv2.imread(r["path"]), cv2.COLOR_BGR2RGB))
        ax.add_patch(_rect(r["_gt"], "deepskyblue", 3))
        for _, k_, color in DETS:
            if f"_b_{k_}" in r:
                ax.add_patch(_rect(r[f"_b_{k_}"], color, 2))
        ax.set_title("  ".join(f"{k_} {r[f'iou_{k_}']:.2f}" for k_ in keys), fontsize=8)
    legend = "blue = GT   " + "   ".join(f"{c} = {n}" for n, k_, c in DETS if k_ in keys)
    fig.suptitle(legend, fontsize=11)
    fig.tight_layout()
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out_path, dpi=110)
    print(f"그리드 -> {out_path}")


def _rect(box, color, lw):
    import matplotlib.patches as patches
    if not box:
        return patches.Rectangle((0, 0), 0, 0, fill=False)
    x1, y1, x2, y2 = box
    return patches.Rectangle((x1, y1), x2 - x1, y2 - y1,
                             fill=False, edgecolor=color, linewidth=lw)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gt", default=str(GT_DEFAULT), help="COCO json 정답")
    ap.add_argument("--img_dir", default=str(IMG_DEFAULT), help="이미지 폴더")
    ap.add_argument("--yolo", default=None, help="YOLO 가중치 (기본: checkpoints/yolo11m.pt)")
    ap.add_argument("--rtdetr", default="PekingU/rtdetr_r50vd", help="RT-DETR HF 모델명")
    ap.add_argument("--skip_rtdetr", action="store_true")
    ap.add_argument("--score_thresh", type=float, default=0.25,
                    help="탐지기 공통 score 하한")
    ap.add_argument("--out_csv", default=str(ML_DIR / "dataset" / "derived" / "detector_gt_iou.csv"))
    ap.add_argument("--out_grid", default=None, help="최악 IoU 시각화 png")
    ap.add_argument("--grid_n", type=int, default=12)
    args = ap.parse_args()

    gt = load_coco_gt(args.gt)
    img_dir = Path(args.img_dir)
    files = [fn for fn in sorted(gt) if (img_dir / fn).exists()]
    missing = len(gt) - len(files)
    print(f"GT {len(gt)}개 중 {len(files)}개 평가"
          + (f" (이미지 없음 {missing}개 건너뜀)" if missing else "")
          + f"  (device={DEVICE})")

    dets = {"yolo": YoloDet(args.yolo), "tv": TvDet()}
    use_rtdetr = not args.skip_rtdetr and RTDetrForObjectDetection is not None
    if args.skip_rtdetr:
        print("RT-DETR 건너뜀 (--skip_rtdetr)")
    elif RTDetrForObjectDetection is None:
        print("RT-DETR 건너뜀 (transformers 미설치)")
    else:
        dets["rtdetr"] = RtDetrDet(args.rtdetr)

    rows = []
    for i, fn in enumerate(files, 1):
        im = cv2.imread(str(img_dir / fn))
        if im is None:
            continue
        gtb = gt[fn]
        row = dict(file=fn, path=str(img_dir / fn), _gt=gtb)
        for key, det in dets.items():
            b = det(im, args.score_thresh)
            row[f"iou_{key}"] = round(iou(b, gtb), 4)
            row[f"{key}_missed"] = int(b is None)
            row[f"_b_{key}"] = b
        rows.append(row)
        if i % 50 == 0:
            print(f"  {i}/{len(files)}")

    fields = ["file", "path"] + [f"iou_{k}" for k in dets] + [f"{k}_missed" for k in dets]
    Path(args.out_csv).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out_csv, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

    n = len(rows)
    print(f"\n=== GT 대비 IoU | {n}장 | score_thresh={args.score_thresh} ===")
    for label, key, _ in DETS:
        if key not in dets:
            continue
        miss = sum(r[f"{key}_missed"] for r in rows)
        det_iou = np.array([r[f"iou_{key}"] for r in rows if not r[f"{key}_missed"]])
        allv = np.array([r[f"iou_{key}"] for r in rows])
        print(f"\n[{label}]  미탐 {miss}/{n} ({miss / n:.1%})")
        if len(det_iou):
            print(f"  탐지분 IoU: mean {det_iou.mean():.3f}  median {np.median(det_iou):.3f}  "
                  f"min {det_iou.min():.3f}")
            for thr in (0.5, 0.7, 0.9):
                print(f"  IoU>={thr}: 탐지분 {(det_iou >= thr).mean():.1%}  |  전체 {(allv >= thr).mean():.1%}")
    print(f"\nCSV -> {args.out_csv}")
    if args.out_grid:
        make_grid(rows, args.out_grid, args.grid_n)


if __name__ == "__main__":
    main()
