"""
ARBase(IBN-ResNet50 + MGN 3-브랜치 + BoT) 를 MPDD 로 학습.

- 입력 384x384, 증강은 좌우 flip 만, cosine LR (논문 6.2절 설명 그대로)
- P x K 샘플러(RandomIdentitySampler), triplet(전역급 3개) + label-smoothing CE(전체 8개)
- MegaDescriptor/PetFace 노트북과 같은 방식으로 매 EVAL_PERIOD 마다 원본 MPDD query/gallery로
  mAP 평가 + best 저장 + patience 조기종료

어디서 실행해도 무관 (datasets/, loss/ 는 external/CLIP-ReID 에서 sys.path 로 가져옴,
ARBase 모델은 같은 폴더의 arbase_model.py 에서 가져옴).
"""
import argparse
import os
import re
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
import torchvision.transforms as T
from PIL import Image
from torch.utils.data import DataLoader, Dataset

CLIPREID_DIR = Path(__file__).resolve().parent.parent / "external" / "CLIP-ReID"
sys.path.insert(0, str(CLIPREID_DIR))  # datasets/, loss/ 는 external/CLIP-ReID 안 패키지

from datasets.bases import ImageDataset
from datasets.sampler import RandomIdentitySampler
from loss.triplet_loss import TripletLoss
from loss.softmax_loss import CrossEntropyLabelSmooth
from arbase_model import ARBase

MEAN, STD = (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)
_ID_RE = re.compile(r"^(\d+)_c(\d+)s\d+")


class ImgList(Dataset):
    def __init__(self, paths, tf):
        self.paths, self.tf = paths, tf

    def __len__(self):
        return len(self.paths)

    def __getitem__(self, i):
        p = self.paths[i]
        return self.tf(Image.open(p).convert("RGB")), p


def build_train_list(train_dir):
    """MPDD train/ 을 (path, relabel_pid, camid, trackid=1) 튜플 리스트로. datasets/mpdd.py 의
    _process_dir(relabel=True) 와 동일 로직 — MPDD 클래스의 root 조인 관례에 안 얽히려고 인라인."""
    pattern = re.compile(r"([-\d]+)_c(\d+)")
    paths = sorted(
        os.path.join(train_dir, f) for f in os.listdir(train_dir) if f.lower().endswith(".jpg")
    )
    pids = set()
    for p in paths:
        m = pattern.search(os.path.basename(p))
        if m and int(m.group(1)) != -1:
            pids.add(int(m.group(1)))
    pid2label = {pid: i for i, pid in enumerate(sorted(pids))}

    dataset = []
    for p in paths:
        m = pattern.search(os.path.basename(p))
        if not m:
            continue
        pid, camid = int(m.group(1)), int(m.group(2))
        if pid == -1:
            continue
        dataset.append((p, pid2label[pid], camid - 1, 1))
    return dataset, len(pid2label)


def market_meta(split_dir):
    rows = []
    for f in sorted(os.listdir(split_dir)):
        m = _ID_RE.match(f)
        if m and f.lower().endswith((".jpg", ".jpeg", ".png")):
            rows.append((os.path.join(split_dir, f), int(m.group(1)), int(m.group(2))))
    return rows


@torch.no_grad()
def embed(model, paths, tf, device, batch=64):
    dl = DataLoader(ImgList(paths, tf), batch_size=batch, num_workers=0)
    feats = []
    for imgs, _ in dl:
        feats.append(F.normalize(model(imgs.to(device)), dim=1).cpu())
    return torch.cat(feats).numpy()


def _ap_cmc(rel):
    if not rel.any():
        return 0.0, 0, 0
    hits = np.cumsum(rel)
    ranks = np.arange(1, len(rel) + 1)
    return float((hits / ranks * rel).sum() / rel.sum()), int(rel[0]), int(rel[:5].any())


def mpdd_score(model, eval_tf, device, gal_rows, qry_rows):
    g_paths, g_id, g_cam = zip(*gal_rows)
    q_paths, q_id, q_cam = zip(*qry_rows)
    g_emb = embed(model, list(g_paths), eval_tf, device)
    q_emb = embed(model, list(q_paths), eval_tf, device)
    g_id, g_cam = np.array(g_id), np.array(g_cam)
    q_id, q_cam = np.array(q_id), np.array(q_cam)
    sim = q_emb @ g_emb.T
    aps = c1 = c5 = 0.0
    for i in range(len(q_id)):
        order = np.argsort(sim[i])[::-1]
        junk = (g_id == q_id[i]) & (g_cam == q_cam[i])
        order = order[~junk[order]]
        ap, h1, h5 = _ap_cmc(g_id[order] == q_id[i])
        aps += ap; c1 += h1; c5 += h5
    n = len(q_id)
    return aps / n, c1 / n, c5 / n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True, help="예: ML/dataset/raw/mpdd_release/MPDD/pytorch")
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--batch_size", type=int, default=64)
    ap.add_argument("--num_instances", type=int, default=4)
    ap.add_argument("--lr", type=float, default=3.5e-4)
    ap.add_argument("--img_size", type=int, default=384)
    ap.add_argument("--eval_period", type=int, default=5)
    ap.add_argument("--patience", type=int, default=5)
    ap.add_argument("--num_workers", type=int, default=0,
                     help="윈도우는 spawn 방식이라 이 파일처럼 if __name__=='__main__' 가드가 있어야 안전")
    ap.add_argument("--out", required=True)
    ap.add_argument("--log_file", default=None,
                     help="생략하면 --out 과 같은 이름에 .log 확장자로 자동 생성. 매 줄마다 즉시 flush되어 "
                          "학습 도중에도 tail 로 실시간 확인 가능")
    args = ap.parse_args()

    log_path = args.log_file or str(Path(args.out).with_suffix(".log"))
    Path(log_path).parent.mkdir(parents=True, exist_ok=True)
    log_f = open(log_path, "a", encoding="utf-8")

    def log(msg=""):
        print(msg)
        log_f.write(msg + "\n")
        log_f.flush()

    log(f"\n===== 새 실행 {__import__('datetime').datetime.now().isoformat(timespec='seconds')} =====")
    log(f"args: {vars(args)}")

    device = "cuda" if torch.cuda.is_available() else "cpu"

    train_list, num_classes = build_train_list(os.path.join(args.root, "train"))

    train_tf = T.Compose([
        T.Resize((args.img_size, args.img_size)),
        T.RandomHorizontalFlip(p=0.5),
        T.ToTensor(),
        T.Normalize(mean=MEAN, std=STD),
    ])
    eval_tf = T.Compose([
        T.Resize((args.img_size, args.img_size)),
        T.ToTensor(),
        T.Normalize(mean=MEAN, std=STD),
    ])

    train_set = ImageDataset(train_list, train_tf)
    sampler = RandomIdentitySampler(train_list, args.batch_size, args.num_instances)
    loader = DataLoader(train_set, batch_size=args.batch_size, sampler=sampler,
                         num_workers=args.num_workers, drop_last=True,
                         pin_memory=(device == "cuda"),
                         persistent_workers=(args.num_workers > 0))

    gal_rows = market_meta(os.path.join(args.root, "gallery"))
    qry_rows = market_meta(os.path.join(args.root, "query"))
    log(f"train {len(train_list)}장/{num_classes}개체 | gallery {len(gal_rows)}장 | query {len(qry_rows)}장")

    model = ARBase(num_classes=num_classes).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr, weight_decay=5e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)

    triplet = TripletLoss(margin=0.3)
    ce = CrossEntropyLabelSmooth(num_classes=num_classes)

    best = {"mAP": -1.0, "epoch": -1}
    bad = 0

    for epoch in range(1, args.epochs + 1):
        model.train()
        total_loss, n_batches = 0.0, 0
        for imgs, pids, _camids, _trackids, _ in loader:
            imgs, pids = imgs.to(device), pids.to(device)
            cls_scores, pre_bn_feats, kinds = model(imgs)

            loss = 0.0
            for score, feat, kind in zip(cls_scores, pre_bn_feats, kinds):
                loss = loss + ce(score, pids)
                if kind == "global":
                    t_loss, _, _ = triplet(feat, pids)
                    loss = loss + t_loss

            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            n_batches += 1

        scheduler.step()
        lr_now = optimizer.param_groups[0]["lr"]
        log(f"epoch {epoch}/{args.epochs}  loss {total_loss / n_batches:.3f}  lr {lr_now:.2e}")

        if epoch % args.eval_period == 0 or epoch == args.epochs:
            model.eval()
            mAP, t1, t5 = mpdd_score(model, eval_tf, device, gal_rows, qry_rows)
            log(f"  [eval] MPDD mAP {mAP:.4f}  Top-1 {t1:.4f}  Top-5 {t5:.4f}")
            if mAP > best["mAP"] + 1e-4:
                best.update(mAP=mAP, epoch=epoch)
                bad = 0
                torch.save({
                    "model": model.state_dict(),
                    "num_classes": num_classes,
                    "best_mAP": mAP,
                    "best_epoch": epoch,
                    "args": vars(args),
                }, args.out)
                log(f"      -> best 저장 (mAP {mAP:.4f})  {args.out}")
            else:
                bad += 1
                log(f"      개선 없음 {bad}/{args.patience}")
                if bad >= args.patience:
                    log(f"  early stop @ epoch {epoch} — best epoch {best['epoch']} (mAP {best['mAP']:.4f})")
                    break

    log(f"\n최고 MPDD mAP: {best['mAP']:.4f} @ epoch {best['epoch']}  (저장: {args.out})")
    log_f.close()


if __name__ == "__main__":
    main()
