"""
탐지기 ablation — GT(146장) 대비 IoU 로 아래를 한 번에 비교. compare_detectors.py 의 부속 실험.

  yolo   : yolo11 n / s / m / l  (nano 가 저해상도에서 왜 약한지 = 크기 문제 확인)
  tv     : torchvision 계열을 튜닝해도 안 오르는지
           frcnn v2 (임계값·박스선택 규칙) / RetinaNet v2 / FCOS / Mask R-CNN v2(마스크 박스)
  shrink : frcnn 박스를 고정 비율로 안쪽 축소하면 IoU 회복되나 (헐렁함이 일관된 편향인지)

  python scripts/detector_ablation.py               # 셋 다
  python scripts/detector_ablation.py --which yolo
  python scripts/detector_ablation.py --which tv shrink
"""
import argparse
import shutil
from pathlib import Path

import cv2
import numpy as np
import torch

from compare_detectors import (ANIMAL_CLASSES, DEVICE, GT_DEFAULT, IMG_DEFAULT,
                               iou, load_coco_gt)
from ultralytics import YOLO

ML_DIR = Path(__file__).resolve().parent.parent


def pick_box(boxes, names, scores, thresh, mode="largest"):
    """동물 클래스 & score>=thresh 중 mode('largest'=면적최대 / 'topscore'=신뢰도최대) 1개."""
    cand = [(b, s) for b, nm, s in zip(boxes, names, scores)
            if nm in ANIMAL_CLASSES and s >= thresh]
    if not cand:
        return None
    if mode == "largest":
        b = max(cand, key=lambda t: (t[0][2] - t[0][0]) * (t[0][3] - t[0][1]))[0]
    else:
        b = max(cand, key=lambda t: t[1])[0]
    return tuple(map(float, b))


def summarize(label, ious):
    """ious: np.array, IoU 0 = 미탐."""
    ious = np.asarray(ious, float)
    det = ious[ious > 0]
    miss = int((ious == 0).sum())
    m = f"mean {det.mean():.3f}  median {np.median(det):.3f}  min {det.min():.3f}" if len(det) else "-"
    ge = "  ".join(f">={t} {(ious >= t).mean():.0%}" for t in (0.5, 0.7, 0.9))
    print(f"  {label:34s}  미탐 {miss:2d}/{len(ious)}  {m}  |  {ge}")


# ────────────────────────────── 이미지/GT 로드 ──────────────────────────────

def load_gt_images(gt_path, img_dir):
    gt = load_coco_gt(gt_path)
    img_dir = Path(img_dir)
    files = [fn for fn in sorted(gt) if (img_dir / fn).exists()]
    imgs = [cv2.imread(str(img_dir / fn)) for fn in files]
    boxes = [gt[fn] for fn in files]
    print(f"GT {len(files)}장 로드  (device={DEVICE})")
    return imgs, boxes


# ────────────────────────────── YOLO 크기 스윕 ──────────────────────────────

def yolo_model(name):
    ckpt = ML_DIR / "checkpoints" / name
    if ckpt.exists():
        return YOLO(str(ckpt))
    m = YOLO(name)                       # ultralytics 가 cwd 로 다운로드
    if Path(name).exists():
        shutil.move(name, ckpt)         # 다음부터 checkpoints 에서
        return YOLO(str(ckpt))
    return m


def sweep_yolo(imgs, gts, thresh):
    print("\n[YOLO 크기 스윕]  (박스선택 = 면적최대, score>=%.2f)" % thresh)
    for name in ("yolo11n.pt", "yolo11s.pt", "yolo11m.pt", "yolo11l.pt"):
        m = yolo_model(name)
        ious = []
        for im, gt in zip(imgs, gts):
            r = m(im, verbose=False)[0]
            b = pick_box([list(map(float, x.xyxy[0])) for x in r.boxes],
                         [m.names[int(x.cls[0])] for x in r.boxes],
                         [float(x.conf[0]) for x in r.boxes], thresh, "largest")
            ious.append(iou(b, gt) if b else 0.0)
        summarize(name.replace(".pt", ""), ious)


# ─────────────────────── torchvision 계열 튜닝 스윕 ───────────────────────

def _tv_load(kind):
    from torchvision.models import detection as D
    if kind == "frcnn":
        w = D.FasterRCNN_ResNet50_FPN_V2_Weights.DEFAULT
        m = D.fasterrcnn_resnet50_fpn_v2(weights=w, box_score_thresh=0.05)
    elif kind == "retina":
        w = D.RetinaNet_ResNet50_FPN_V2_Weights.DEFAULT
        m = D.retinanet_resnet50_fpn_v2(weights=w, score_thresh=0.05)
    elif kind == "fcos":
        w = D.FCOS_ResNet50_FPN_Weights.DEFAULT
        m = D.fcos_resnet50_fpn(weights=w, score_thresh=0.05)
    elif kind == "maskrcnn":
        w = D.MaskRCNN_ResNet50_FPN_V2_Weights.DEFAULT
        m = D.maskrcnn_resnet50_fpn_v2(weights=w, box_score_thresh=0.05)
    else:
        raise ValueError(kind)
    return m.eval().to(DEVICE), w.transforms(), w.meta["categories"]


@torch.no_grad()
def _tv_raw(model, pre, cats, im, use_mask=False):
    rgb = cv2.cvtColor(im, cv2.COLOR_BGR2RGB)
    t = torch.from_numpy(rgb).permute(2, 0, 1).contiguous()
    o = model([pre(t).to(DEVICE)])[0]
    names = [cats[int(x)] for x in o["labels"].cpu()]
    scores = [float(x) for x in o["scores"].cpu()]
    if use_mask and "masks" in o:
        boxes = []
        for msk in o["masks"].cpu():
            ys, xs = np.where(msk[0].numpy() > 0.5)
            boxes.append([float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())]
                         if len(xs) else [0.0, 0.0, 0.0, 0.0])
    else:
        boxes = [list(map(float, x)) for x in o["boxes"].cpu()]
    return boxes, names, scores


def sweep_tv(imgs, gts):
    print("\n[torchvision 튜닝 스윕]")
    configs = [
        ("frcnn", 0.25, "largest", False),
        ("frcnn", 0.50, "largest", False),
        ("frcnn", 0.25, "topscore", False),
        ("frcnn", 0.50, "topscore", False),
        ("frcnn", 0.70, "topscore", False),
        ("retina", 0.50, "topscore", False),
        ("fcos", 0.50, "topscore", False),
        ("maskrcnn", 0.50, "topscore", True),
    ]
    cache, raw_cache = {}, {}
    for kind, thr, mode, um in configs:
        if kind not in cache:
            cache[kind] = _tv_load(kind)
        model, pre, cats = cache[kind]
        key = (kind, um)
        if key not in raw_cache:
            raw_cache[key] = [_tv_raw(model, pre, cats, im, um) for im in imgs]
        ious = [iou(pick_box(b, n, s, thr, mode), gt) if pick_box(b, n, s, thr, mode) else 0.0
                for (b, n, s), gt in zip(raw_cache[key], gts)]
        summarize(f"{kind}  thr={thr}  {mode}{' +mask' if um else ''}", ious)


# ─────────────────────── frcnn 박스 축소 스윕 ───────────────────────

def _shrink(box, f):
    if box is None:
        return None
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    w, h = (box[2] - box[0]) * (1 - f), (box[3] - box[1]) * (1 - f)
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


def sweep_shrink(imgs, gts):
    print("\n[frcnn 박스 축소 스윕]  (thr=0.5, 면적최대. 헐렁함이 일관된 편향이면 축소가 IoU 를 올려야 함)")
    model, pre, cats = _tv_load("frcnn")
    base = []
    for im in imgs:
        b, n, s = _tv_raw(model, pre, cats, im)
        base.append(pick_box(b, n, s, 0.5, "largest"))
    for fr in (0.0, 0.03, 0.05, 0.08, 0.10, 0.15):
        ious = [iou(_shrink(b, fr), gt) if b else 0.0 for b, gt in zip(base, gts)]
        summarize(f"shrink {fr:.2f}", ious)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--gt", default=str(GT_DEFAULT))
    ap.add_argument("--img_dir", default=str(IMG_DEFAULT))
    ap.add_argument("--which", nargs="+", default=["yolo", "tv", "shrink"],
                    choices=["yolo", "tv", "shrink"])
    ap.add_argument("--score_thresh", type=float, default=0.25, help="YOLO 스윕용")
    args = ap.parse_args()

    imgs, gts = load_gt_images(args.gt, args.img_dir)
    if "yolo" in args.which:
        sweep_yolo(imgs, gts, args.score_thresh)
    if "tv" in args.which:
        sweep_tv(imgs, gts)
    if "shrink" in args.which:
        sweep_shrink(imgs, gts)


if __name__ == "__main__":
    main()
