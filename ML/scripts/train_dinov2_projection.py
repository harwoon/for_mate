"""
pet-recognition-large 레시피 복제 — facebook/dinov2-large(frozen) 위에 Linear projection 만 ArcFace 로 학습.

- 백본은 안 건드림 (소규모 데이터 full 파인튜닝은 특징 망가짐). projection(1024->proj_dim)만 학습.
- 백본 특징은 학습 이미지마다 --aug_views 개 view 를 미리 뽑아 디스크 캐시 -> 이후 head 학습은 초고속.
- 매 --eval_period 에폭마다 open-set eval 케이스단위 R@1 로 best 저장.

  # MPDD (기존)
  python scripts/train_dinov2_projection.py

  # Dogs of the World archive (로컬, CC0) — 메타데이터에서 개체별 이미지 직접 읽음
  python scripts/train_dinov2_projection.py --data_format archive \
      --data C:/datasets/dogsworld/archive --max_identities 16000 --aug_views 1 \
      --also_eval_root ML/dataset/derived/shelter_hard_dogs

  # LCW = Labeled Cats In The Wild (로컬, Apache-2.0) — <id>/<이미지...> 폴더가 곧 개체
  python scripts/train_dinov2_projection.py --data_format lcw \
      --data C:/datasets/lcw --max_identities 16000 --aug_views 1 \
      --out ML/checkpoints/dinov2_proj_cat.pth --also_eval_root ML/dataset/derived/shelter_hard_cats
"""
import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.transforms as T
from PIL import Image
from torch.utils.data import DataLoader, Dataset

ML_DIR = Path(__file__).resolve().parent.parent
DEV = "cuda" if torch.cuda.is_available() else "cpu"
FN = re.compile(r"([-\d]+)_c(\d+)")
FN_EVAL = re.compile(r"(\d+)_c(\d+)s(\d+)_(\d+)\.jpg$", re.I)
MEAN, STD = (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)


# ---------------- 백본 ----------------

def load_backbone():
    from transformers import AutoModel
    m = AutoModel.from_pretrained("facebook/dinov2-large").eval().to(DEV)
    for p in m.parameters():
        p.requires_grad_(False)
    return m


class _DS(Dataset):
    """스크랩 데이터셋(LCW 등)엔 깨진 파일이 섞여있음 -> 회색 이미지로 대체하고 계속."""
    n_bad = 0

    def __init__(self, paths, tf):
        self.paths, self.tf = paths, tf

    def __len__(self):
        return len(self.paths)

    def __getitem__(self, i):
        try:
            img = Image.open(self.paths[i]).convert("RGB")
        except Exception as e:
            _DS.n_bad += 1
            print(f"[손상 이미지 #{_DS.n_bad}, 회색으로 대체] {self.paths[i]}  ({e})")
            img = Image.new("RGB", (224, 224), (114, 114, 114))
        return self.tf(img)


@torch.no_grad()
def backbone_feats(backbone, paths, tf, bs=64):
    dl = DataLoader(_DS(paths, tf), batch_size=bs, num_workers=0)
    out = [backbone(pixel_values=x.to(DEV)).pooler_output.cpu() for x in dl]
    return torch.cat(out)


# ---------------- ArcFace ----------------

class ArcFace(nn.Module):
    def __init__(self, dim, n_cls, s=32.0, m=0.3):
        super().__init__()
        self.W = nn.Parameter(torch.empty(n_cls, dim))
        nn.init.xavier_uniform_(self.W)
        self.s, self.m = s, m

    def forward(self, feat, label):          # feat: L2 정규화된 [B, dim]
        cos = feat @ F.normalize(self.W, dim=1).t()
        theta = torch.acos(cos.clamp(-1 + 1e-7, 1 - 1e-7))
        target = torch.cos(theta + self.m)
        onehot = F.one_hot(label, cos.size(1)).float()
        logits = self.s * (onehot * target + (1 - onehot) * cos)
        return F.cross_entropy(logits, label)


# ---------------- eval (open-set, 케이스 단위) ----------------

def eval_pid(p):
    m = FN_EVAL.search(Path(p).name)
    return int(m.group(1)) if m else None


@torch.no_grad()
def case_recall_lists(backbone, proj, q_items, g_items, tf):
    """q_items/g_items: [(path, id), ...]. id 는 문자열/정수 아무거나."""
    def emb(items):
        f = backbone_feats(backbone, [p for p, _ in items], tf).to(DEV)
        return F.normalize(proj(f), dim=1).cpu().numpy()

    qe = emb(q_items); qp = [i for _, i in q_items]
    ge = emb(g_items); gp = [i for _, i in g_items]
    cps = sorted(set(qp))
    qp_a = np.array(qp, dtype=object)
    ce = np.stack([(lambda v: v / (np.linalg.norm(v) + 1e-12))(qe[qp_a == c].mean(0)) for c in cps])
    gids = sorted(set(gp))
    gi = {p: i for i, p in enumerate(gids)}
    sim = ce @ ge.T
    M = np.full((len(cps), len(gids)), -1.0, np.float32)
    for j, p in enumerate(gp):
        M[:, gi[p]] = np.maximum(M[:, gi[p]], sim[:, j])
    r = {}
    for k in (1, 5, 10):
        r[k] = sum(1 for i, c in enumerate(cps)
                   if c in [gids[j] for j in np.argsort(-M[i])][:k]) / len(cps)
    return r


def case_recall(backbone, proj, eval_root, tf, gallery_per_id=2):
    root = Path(eval_root)
    q = sorted((root / "query").glob("*.jpg"))
    g_all = sorted((root / "gallery").glob("*.jpg"))
    by = defaultdict(list)
    for p in g_all:
        by[eval_pid(p)].append(p)
    g = [p for v in by.values() for p in v[:gallery_per_id]]
    return case_recall_lists(backbone, proj,
                             [(p, eval_pid(p)) for p in q],
                             [(p, eval_pid(p)) for p in g], tf)


# ---------------- 학습 ----------------

def build_train(train_dir):
    paths = sorted(str(p) for p in Path(train_dir).glob("*.jpg"))
    raw = [int(FN.search(Path(p).name).group(1)) for p in paths]
    ids = sorted(set(x for x in raw if x != -1))
    relabel = {x: i for i, x in enumerate(ids)}
    keep = [(p, relabel[x]) for p, x in zip(paths, raw) if x != -1]
    return [p for p, _ in keep], np.array([y for _, y in keep]), len(ids), [], []


def read_archive(archive_dir):
    """Dogs of the World: metadata/*.json 에서 {identity: [image path...]}. json 캐시."""
    root = Path(archive_dir)
    # --data 가 상위/하위 한 칸 어긋나도 metadata/ 있는 폴더 자동 탐색
    if not (root / "metadata").is_dir():
        for cand in [root / "archive", *(p for p in root.iterdir() if p.is_dir())] if root.is_dir() else []:
            if (cand / "metadata").is_dir():
                root = cand
                print(f"[자동보정] archive 경로 -> {root}")
                break
    md_dir = root / "metadata"
    if not md_dir.is_dir() or not any(md_dir.glob("*.json")):
        raise SystemExit(f"[오류] metadata/*.json 없음: {md_dir}\n  --data 를 images/ metadata/ 가 들어있는 폴더로 지정하세요.")
    cache = root / "_id2paths.json"
    if cache.exists():
        return {k: v for k, v in json.load(open(cache, encoding="utf-8")).items()}
    id2p = defaultdict(list)
    md = list(md_dir.glob("*.json"))
    print(f"메타데이터 {len(md)}개 파싱 중...")
    for i, f in enumerate(md):
        d = json.load(open(f, encoding="utf-8"))
        img = root / d["path"]
        if not img.exists():
            b = img.with_suffix("")
            for e in (".png", ".jpg", ".jpeg", ".webp"):
                if b.with_suffix(e).exists():
                    img = b.with_suffix(e); break
        for ent in d.get("identities", []):
            id2p[ent["identity"]].append(str(img))
        if i % 60000 == 0:
            print(f"  {i}")
    id2p = dict(id2p)
    json.dump(id2p, open(cache, "w"))
    return id2p


def read_lcw(lcw_dir):
    """LCW(Labeled Cats In The Wild): <root>/<cat_id>/<이미지...>. 폴더명 = identity. json 캐시."""
    IMG_EXT = {".jpg", ".jpeg", ".png", ".webp"}

    def looks_like_id_root(p):
        if not p.is_dir():
            return False
        subs = list(p.iterdir())[:200]
        dirs = [d for d in subs if d.is_dir()]
        return len(dirs) > 50 and sum(d.name.isdigit() for d in dirs) / max(1, len(dirs)) > 0.5

    root = Path(lcw_dir)
    if not looks_like_id_root(root):
        cands = [root / "CatFullDataset", *(p for p in root.iterdir() if p.is_dir())] if root.is_dir() else []
        for cand in cands:
            if looks_like_id_root(cand):
                root = cand
                print(f"[자동보정] LCW 경로 -> {root}")
                break
    if not looks_like_id_root(root):
        raise SystemExit(f"[오류] <id>/<이미지...> 폴더 구조를 못 찾음: {root}\n"
                          "  --data 를 CatFullDataset(또는 그 상위)이 들어있는 폴더로 지정하세요.")

    cache = root / "_id2paths.json"
    if cache.exists():
        return json.load(open(cache, encoding="utf-8"))
    id_dirs = [d for d in root.iterdir() if d.is_dir()]
    print(f"개체 폴더 {len(id_dirs)}개 스캔 중...")
    id2p = {}
    for i, d in enumerate(id_dirs):
        imgs = [str(f) for f in d.iterdir() if f.suffix.lower() in IMG_EXT]
        if imgs:
            id2p[d.name] = imgs
        if i % 20000 == 0:
            print(f"  {i}")
    json.dump(id2p, open(cache, "w"))
    return id2p


def build_train_from_id2p(id2p, min_photos, max_identities, n_eval, seed):
    dist = defaultdict(int)
    for v in id2p.values():
        dist[len(v)] += 1
    print("고유 개체:", len(id2p), "| 사진수 분포(<=6):",
          {k: dist[k] for k in sorted(dist) if k <= 6},
          "| >=%d장: %d" % (min_photos, sum(v for k, v in dist.items() if k >= min_photos)))

    ge2 = sorted(k for k, v in id2p.items() if len(v) >= 2)
    rng = __import__("random").Random(seed)
    rng.shuffle(ge2)
    eval_ids, eval_set = ge2[:n_eval], set(ge2[:n_eval])
    pool = [k for k in id2p if len(id2p[k]) >= min_photos and k not in eval_set]
    rng.shuffle(pool)
    train_ids = pool[:max_identities]
    pid_of = {k: i for i, k in enumerate(train_ids)}
    train_items = [(p, pid_of[k]) for k in train_ids for p in id2p[k]]

    eval_q, eval_g = [], []
    for k in eval_ids:
        ps = id2p[k]
        nq = max(1, len(ps) // 2)
        eval_g += [(p, k) for p in ps[:-nq]]
        eval_q += [(p, k) for p in ps[-nq:]]
    return ([p for p, _ in train_items], np.array([y for _, y in train_items]),
            len(train_ids), eval_q, eval_g)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(ML_DIR / "dataset/raw/mpdd_release/MPDD/pytorch/train"))
    ap.add_argument("--data_format", choices=["mpdd", "archive", "lcw"], default="mpdd",
                    help="archive = Dogs of the World (metadata/*.json), lcw = Labeled Cats In The Wild (<id>/이미지 폴더)")
    ap.add_argument("--max_identities", type=int, default=16000, help="archive/lcw: 학습 개체 수 상한")
    ap.add_argument("--eval_identities", type=int, default=500, help="archive/lcw: held-out 평가 개체 수")
    ap.add_argument("--min_photos", type=int, default=3, help="archive/lcw: 학습 개체 최소 사진 수")
    ap.add_argument("--eval_root", default=str(ML_DIR / "dataset/derived/shelter_hard_dogs"),
                    help="mpdd: 평가 폴더. archive/lcw 에선 held-out 개체로 평가하고 이건 무시")
    ap.add_argument("--also_eval_root", default=None,
                    help="archive/lcw: held-out 외에 이 shelter 폴더로도 추가 평가 (교차 도메인 확인)")
    ap.add_argument("--out", default=str(ML_DIR / "checkpoints/dinov2_proj_dog.pth"))
    ap.add_argument("--feat_cache", default=str(ML_DIR / "embeddings"), help="특징 .pt 캐시 폴더")
    ap.add_argument("--proj_dim", type=int, default=512)
    ap.add_argument("--aug_views", type=int, default=4,
                    help="학습 이미지당 캐시할 view 수. archive(6만장)면 1 권장")
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--arcface_margin", type=float, default=0.3)
    ap.add_argument("--arcface_scale", type=float, default=32.0)
    ap.add_argument("--eval_period", type=int, default=5)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--zeroshot", action="store_true",
                    help="projection 학습 없이 raw DINOv2-large(1024d, L2정규화)로 held-out/also_eval_root 평가만 하고 종료. "
                         "projection이 실제로 뭘 더하는지 보려면 이 값과 학습 후 R@1을 같은 held-out에서 비교")
    args = ap.parse_args()
    print(f"device={DEV}")

    aug_tf = T.Compose([
        T.RandomResizedCrop(224, scale=(0.7, 1.0)),
        T.RandomHorizontalFlip(),
        T.ColorJitter(0.2, 0.2, 0.2),
        T.ToTensor(), T.Normalize(MEAN, STD),
    ])
    eval_tf = T.Compose([T.Resize((224, 224)), T.ToTensor(), T.Normalize(MEAN, STD)])
    view_tf = eval_tf if args.aug_views == 1 else aug_tf

    backbone = load_backbone()
    if args.data_format in ("archive", "lcw"):
        id2p = read_archive(args.data) if args.data_format == "archive" else read_lcw(args.data)
        paths, labels, n_cls, eval_q, eval_g = build_train_from_id2p(
            id2p, args.min_photos, args.max_identities, args.eval_identities, args.seed)
    else:
        paths, labels, n_cls, eval_q, eval_g = build_train(args.data)
    print(f"train {len(paths)}장 / {n_cls}개체  |  view {args.aug_views}"
          + (f" | held-out 평가 개체 {len(set(i for _, i in eval_q))}" if eval_q else ""))

    is_id2p = args.data_format in ("archive", "lcw")
    ev_name = "held-out" if is_id2p else "shelter_hard_dogs"

    if args.zeroshot:
        print("[zeroshot] projection 학습 없이 raw DINOv2-large(1024d, L2정규화)로 평가만 수행")
        identity = lambda x: x  # noqa: E731 — case_recall*은 proj(f)를 그냥 함수로 호출
        if is_id2p:
            r = case_recall_lists(backbone, identity, eval_q, eval_g, eval_tf)
            print(f"[zeroshot] {ev_name}  R@1 {r[1]:.1%}  R@5 {r[5]:.1%}  R@10 {r[10]:.1%}")
            if args.also_eval_root:
                r2 = case_recall(backbone, identity, args.also_eval_root, eval_tf)
                print(f"[zeroshot] also_eval_root  R@1 {r2[1]:.1%}  R@5 {r2[5]:.1%}  R@10 {r2[10]:.1%}")
        else:
            r = case_recall(backbone, identity, args.eval_root, eval_tf)
            print(f"[zeroshot] {ev_name}  R@1 {r[1]:.1%}  R@5 {r[5]:.1%}  R@10 {r[10]:.1%}")
        return

    # 백본 특징: 디스크 캐시 (재실행 시 스킵). aug_views 번 뽑아 쌓음
    cache_dir = Path(args.feat_cache); cache_dir.mkdir(parents=True, exist_ok=True)
    tag = f"{args.data_format}_{n_cls}id_{len(paths)}img_{args.aug_views}v_s{args.seed}"
    fpath = cache_dir / f"dinov2_trainfeat_{tag}.pt"
    if fpath.exists():
        blob = torch.load(fpath)
        feats, labs = blob["feat"].to(DEV), blob["label"].to(DEV)
        print(f"특징 캐시 로드 {tuple(feats.shape)}  {fpath.name}")
    else:
        feat_bank, lab_bank = [], []
        for v in range(args.aug_views):
            feat_bank.append(backbone_feats(backbone, paths, view_tf))
            lab_bank.append(torch.from_numpy(labels))
            print(f"  특징 추출 {v + 1}/{args.aug_views}")
        feats_cpu = torch.cat(feat_bank); labs_cpu = torch.cat(lab_bank)
        torch.save({"feat": feats_cpu.half(), "label": labs_cpu}, fpath)
        feats, labs = feats_cpu.to(DEV), labs_cpu.to(DEV)
        print(f"특징 저장 {tuple(feats.shape)}  {fpath}")
    feats = feats.float()

    proj = nn.Linear(feats.size(1), args.proj_dim, bias=False).to(DEV)
    arc = ArcFace(args.proj_dim, n_cls, s=args.arcface_scale, m=args.arcface_margin).to(DEV)
    opt = torch.optim.AdamW([*proj.parameters(), *arc.parameters()], lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)

    def run_eval(proj):
        if is_id2p:
            r = case_recall_lists(backbone, proj, eval_q, eval_g, eval_tf)
            if args.also_eval_root:
                r2 = case_recall(backbone, proj, args.also_eval_root, eval_tf)
                return r, r2
            return r, None
        return case_recall(backbone, proj, args.eval_root, eval_tf), None

    print("참고: raw DINOv2-large zero-shot(projection 없이) 대비 이 수치가 높아야 projection 이 의미"
          " — 개 기준 shelter_hard_dogs raw ~93.6%. 고양이는 also_eval_root 첫 평가에서 raw 대비 직접 비교 필요")

    best = {"r1": -1.0, "epoch": -1}
    n = feats.size(0)
    for ep in range(1, args.epochs + 1):
        proj.train()
        perm = torch.randperm(n, device=DEV)
        tot = 0.0
        for i in range(0, n, args.batch):
            idx = perm[i:i + args.batch]
            z = F.normalize(proj(feats[idx]), dim=1)
            loss = arc(z, labs[idx])
            opt.zero_grad()
            loss.backward()
            opt.step()
            tot += loss.item() * len(idx)
        sched.step()
        if ep % args.eval_period == 0 or ep == args.epochs:
            proj.eval()
            r, r2 = run_eval(proj)
            line = (f"[epoch {ep:3d}] loss {tot / n:.3f}  lr {opt.param_groups[0]['lr']:.2e}  "
                    f"| {ev_name}  R@1 {r[1]:.1%}  R@5 {r[5]:.1%}  R@10 {r[10]:.1%}")
            if r2:
                line += f"  || shelter  R@1 {r2[1]:.1%}  R@5 {r2[5]:.1%}"
            print(line)
            if r[1] > best["r1"]:
                best.update(r1=r[1], epoch=ep)
                torch.save({"proj": proj.state_dict(), "backbone": "facebook/dinov2-large",
                            "proj_dim": args.proj_dim, "r1": r[1], "epoch": ep,
                            "args": vars(args)}, args.out)
                print(f"      -> best 저장 (R@1 {r[1]:.1%})  {args.out}")

    print(f"\n최고 {ev_name} R@1 {best['r1']:.1%} @ epoch {best['epoch']}")
    print("참고(개 기준, shelter_hard_dogs 3000방해꾼): raw DINOv2-large ~93.6% / "
          "pet-recognition-large 61.9% / 자체 projection ~60~62%")


if __name__ == "__main__":
    main()
