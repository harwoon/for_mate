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
import random
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
if torch.cuda.is_available():
    DEV = "cuda"
elif torch.backends.mps.is_available():
    DEV = "mps"
elif torch.xpu.is_available():
    DEV = "xpu"
else:
    DEV = "cpu"
FN = re.compile(r"([-\d]+)_c(\d+)")
FN_EVAL = re.compile(r"(\d+)_c(\d+)s(\d+)_(\d+)\.jpg$", re.I)
MEAN, STD = (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)


# ---------------- 백본 ----------------

def load_backbone(backbone_id="facebook/dinov2-large", unfreeze_blocks=0):
    """unfreeze_blocks>0 이면 encoder.layer 마지막 N개 + 최종 layernorm 만 풀어서
    같이 파인튜닝 (나머지는 그대로 프리즈). 0이면 기존처럼 완전 프리즈."""
    from transformers import AutoModel
    m = AutoModel.from_pretrained(backbone_id).to(DEV)
    for p in m.parameters():
        p.requires_grad_(False)
    if unfreeze_blocks > 0:
        for layer in m.encoder.layer[-unfreeze_blocks:]:
            for p in layer.parameters():
                p.requires_grad_(True)
        for p in m.layernorm.parameters():
            p.requires_grad_(True)
        m.train()
    else:
        m.eval()
    return m


class _DS(Dataset):
    """스크랩 데이터셋(LCW 등)엔 깨진 파일이 섞여있음 -> 회색 이미지로 대체하고 계속."""
    n_bad = 0

    def __init__(self, paths, tf, labels=None, teacher=None):
        self.paths, self.tf, self.labels, self.teacher = paths, tf, labels, teacher

    def __len__(self):
        return len(self.paths)

    def __getitem__(self, i):
        try:
            img = Image.open(self.paths[i]).convert("RGB")
        except Exception as e:
            _DS.n_bad += 1
            if random.random() < 0.002:   # num_workers>0 면 프로세스별로 카운터가 따로라 정확한 누적수는
                print(f"[손상 이미지 회색 대체, 샘플] {self.paths[i]}  ({e})")  # 못 믿음 -- 확률로만 노출량 조절
            img = Image.new("RGB", (224, 224), (114, 114, 114))
        img = self.tf(img)
        if self.labels is None:
            return img
        if self.teacher is None:
            return img, int(self.labels[i])
        return img, int(self.labels[i]), self.teacher[i]


@torch.no_grad()
def backbone_feats(backbone, paths, tf, bs=64, num_workers=0):
    dl = DataLoader(_DS(paths, tf), batch_size=bs, num_workers=num_workers,
                     pin_memory=(DEV == "cuda"))
    n_batches = (len(paths) + bs - 1) // bs
    out = []
    for i, x in enumerate(dl):
        out.append(backbone(pixel_values=x.to(DEV)).pooler_output.cpu())
        if n_batches > 20 and (i + 1) % max(1, n_batches // 20) == 0:
            print(f"  [backbone_feats] {i + 1}/{n_batches} 배치", flush=True)
    return torch.cat(out)


# ---------------- distillation teacher ----------------

def load_teacher(ckpt_path):
    """distillation teacher 로드 -- 완전 프리즈. 체크포인트에 backbone_finetune(언프리즈 학습분)이
    있으면 그것도 그대로 적용해서, teacher가 학습 당시 냈던 임베딩을 그대로 재현."""
    from transformers import AutoModel
    ck = torch.load(ckpt_path, map_location=DEV, weights_only=False)
    backbone = AutoModel.from_pretrained(ck.get("backbone", "facebook/dinov2-large")).eval().to(DEV)
    for p in backbone.parameters():
        p.requires_grad_(False)
    bf = ck.get("backbone_finetune")
    if bf:
        n = bf["unfreeze_blocks"]
        for layer, state in zip(backbone.encoder.layer[-n:], bf["layer_state"]):
            layer.load_state_dict(state)
        backbone.layernorm.load_state_dict(bf["layernorm_state"])
        print(f"[teacher] 파인튜닝된 백본 마지막 {n}개 블록 가중치 적용됨")
    in_dim = ck["proj"]["weight"].shape[1]
    proj = nn.Linear(in_dim, ck["proj_dim"], bias=False).to(DEV)
    proj.load_state_dict(ck["proj"])
    proj.eval()
    print(f"[teacher] {ckpt_path}  (best epoch {ck.get('epoch')}, 학습 당시 R@1 {ck.get('r1', 0):.1%})")
    return backbone, proj


@torch.no_grad()
def teacher_embed(t_backbone, t_proj, paths, tf, cache_path=None, bs=64, num_workers=0):
    """paths와 1:1로 정렬된 teacher L2정규화 임베딩. 있으면 캐시 재사용(teacher는 고정이라 한 번만 계산하면 됨)."""
    if cache_path and Path(cache_path).exists():
        emb = torch.load(cache_path)["emb"]
        print(f"[teacher] 임베딩 캐시 로드 {tuple(emb.shape)}  {Path(cache_path).name}")
        return emb
    f = backbone_feats(t_backbone, paths, tf, bs=bs, num_workers=num_workers).to(DEV)
    emb = F.normalize(t_proj(f), dim=1).cpu()
    if cache_path:
        torch.save({"emb": emb}, cache_path)
        print(f"[teacher] 임베딩 저장 {tuple(emb.shape)}  {cache_path}")
    return emb


# ---------------- ArcFace ----------------

class ArcFace(nn.Module):
    """loss_type='arcface'(기본, 각도 margin) / 'cosface'(코사인에서 직접 margin을 빼는 AM-Softmax —
    arccos 왕복이 없어 수치적으로 더 안정적) / 'circle'(Circle Loss classification 버전 — positive/negative
    유사도가 각자 목표치에 가까울수록 자동으로 약하게 미는 self-paced 가중치, easy/hard 샘플을 다르게 취급).
    k=1이면 vanilla, k>1이면 Sub-center(클래스당 서브센터 k개, 최댓값 사용) — 노이즈/이상치 이미지가 메인
    서브센터를 오염시키지 않도록 해서 라벨 노이즈에 더 강함."""
    def __init__(self, dim, n_cls, s=32.0, m=0.3, k=1, loss_type="arcface"):
        super().__init__()
        self.W = nn.Parameter(torch.empty(n_cls * k, dim))
        nn.init.xavier_uniform_(self.W)
        self.s, self.m, self.k, self.n_cls, self.loss_type = s, m, k, n_cls, loss_type

    def forward(self, feat, label):          # feat: L2 정규화된 [B, dim]
        cos = feat @ F.normalize(self.W, dim=1).t()
        if self.k > 1:
            cos = cos.view(-1, self.n_cls, self.k).max(dim=2).values
        onehot = F.one_hot(label, self.n_cls).bool()

        if self.loss_type == "circle":
            Op, On = 1 + self.m, -self.m           # positive/negative 이상적 목표점
            Dp, Dn = 1 - self.m, self.m            # margin 적용된 결정 경계
            alpha_p = F.relu(Op - cos).detach()    # 목표에 가까울수록 자동으로 0에 수렴(self-paced)
            alpha_n = F.relu(cos - On).detach()
            logit_p = (-self.s * alpha_p * (cos - Dp)).masked_fill(~onehot, float("-inf"))
            logit_n = (self.s * alpha_n * (cos - Dn)).masked_fill(onehot, float("-inf"))
            loss = F.softplus(torch.logsumexp(logit_p, dim=1) + torch.logsumexp(logit_n, dim=1))
            return loss.mean()

        if self.loss_type == "cosface":
            target = cos - self.m
        else:
            theta = torch.acos(cos.clamp(-1 + 1e-7, 1 - 1e-7))
            target = torch.cos(theta + self.m)
        logits = self.s * (onehot.float() * target + (~onehot).float() * cos)
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


def _pdist(e, eps=1e-12):
    """배치 내 pairwise 유클리드 거리행렬 [B,B]. e: L2정규화된 [B,dim]."""
    e_sq = (e ** 2).sum(dim=1)
    prod = e @ e.t()
    return (e_sq.unsqueeze(1) + e_sq.unsqueeze(0) - 2 * prod).clamp(min=eps).sqrt()


def _rkd_distance(z, t):
    """RKD distance-wise: teacher/student 배치 내 샘플간 거리 '구조'(평균거리로 정규화)를 맞춤 --
    절대 위치가 아니라 상대적 거리 패턴만 전달."""
    with torch.no_grad():
        td = _pdist(t)
        td = td / (td[td > 0].mean() + 1e-8)
    sd = _pdist(z)
    sd = sd / (sd[sd > 0].mean() + 1e-8)
    return F.smooth_l1_loss(sd, td)


def _rkd_angle(z, t):
    """RKD angle-wise: 세 점(i,j,k)이 이루는 각도 구조를 맞춤 -- 거리보다 한 단계 더 상대적인(스케일에도
    안 흔들리는) 관계 정보."""
    with torch.no_grad():
        tvec = t.unsqueeze(0) - t.unsqueeze(1)          # [B,B,dim]
        tvec = F.normalize(tvec, p=2, dim=2)
        t_angle = torch.bmm(tvec, tvec.transpose(1, 2)).flatten()
    svec = z.unsqueeze(0) - z.unsqueeze(1)
    svec = F.normalize(svec, p=2, dim=2)
    s_angle = torch.bmm(svec, svec.transpose(1, 2)).flatten()
    return F.smooth_l1_loss(s_angle, t_angle)


def _distill_term(z, t, distill_loss):
    """z, t: L2정규화된 [B, dim].
    cosine/mse = 개별 샘플의 teacher 임베딩 '절대 위치'를 직접 맞춤 -- teacher가 학습된 도메인 특유의
        좌표에 끌려갈 위험 있음(held-out은 좋아져도 shelter/크로스도메인은 나빠지는 현상 확인됨).
    rkd = Relational KD -- 절대 위치 대신 배치 내 샘플간 거리(distance-wise) + 각도(angle-wise) '구조'만
        맞춤. teacher의 도메인 편향된 절대 좌표에 덜 종속적이라 일반화에 더 유리할 수 있음(원 논문 비율
        distance:angle = 1:2 사용)."""
    if distill_loss == "mse":
        return F.mse_loss(z, t)
    if distill_loss == "rkd":
        return _rkd_distance(z, t) + 2.0 * _rkd_angle(z, t)
    return (1 - (z * t).sum(dim=1)).mean()


def train_one_epoch(proj, arc, feats, labs, opt, batch_size, device,
                     teacher_feats=None, distill_weight=1.0, distill_loss="cosine", grad_clip=0.0):
    """캐시된 백본 특징 위에서 한 에폭 학습 -> 평균 loss.
    teacher_feats 를 주면 ArcFace 손실에 distillation 항(teacher 임베딩과의 거리)을 더함 -- feats/labs 와
    같은 순서(aug_views 만큼 타일된)로 정렬돼 있어야 함.
    이 파이프라인의 '평가'는 loss/accuracy가 아니라 case_recall(open-set 검색)이라
    수업 run_epoch()처럼 train/eval을 한 함수로 합치지는 않음 (합칠 공통 루프가 없음)."""
    proj.train()
    n = feats.size(0)
    perm = torch.randperm(n, device=device)
    total_loss = 0.0
    for i in range(0, n, batch_size):
        idx = perm[i:i + batch_size]
        z = F.normalize(proj(feats[idx]), dim=1)
        loss = arc(z, labs[idx])
        if teacher_feats is not None:
            loss = loss + distill_weight * _distill_term(z, teacher_feats[idx], distill_loss)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        if grad_clip > 0:
            for group in opt.param_groups:
                torch.nn.utils.clip_grad_norm_(group["params"], max_norm=grad_clip)
        opt.step()
        total_loss += loss.item() * len(idx)
    return total_loss / n


def train_one_epoch_finetune(backbone, proj, arc, paths, labels, tf, opt, batch_size, device, num_workers=4,
                              teacher_emb=None, distill_weight=1.0, distill_loss="cosine", grad_clip=0.0):
    """언프리즈 모드 -- 캐시 없이 매 배치 백본을 통과시켜 gradient 를 흘림 (훨씬 느림).
    teacher_emb 를 주면(paths 와 1:1 정렬) distillation 항도 같이 학습."""
    backbone.train(); proj.train()
    dl = DataLoader(_DS(paths, tf, labels, teacher_emb), batch_size=batch_size, shuffle=True,
                     num_workers=num_workers, persistent_workers=num_workers > 0)
    total_loss, n = 0.0, 0
    for batch in dl:
        if teacher_emb is not None:
            imgs, labs, tvec = batch
            tvec = tvec.to(device)
        else:
            imgs, labs = batch
        imgs, labs = imgs.to(device), labs.to(device)
        feat = backbone(pixel_values=imgs).pooler_output
        z = F.normalize(proj(feat), dim=1)
        loss = arc(z, labs)
        if teacher_emb is not None:
            loss = loss + distill_weight * _distill_term(z, tvec, distill_loss)
        opt.zero_grad(set_to_none=True)
        loss.backward()
        if grad_clip > 0:
            for group in opt.param_groups:
                torch.nn.utils.clip_grad_norm_(group["params"], max_norm=grad_clip)
        opt.step()
        total_loss += loss.item() * len(labs)
        n += len(labs)
    return total_loss / n


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
    ap.add_argument("--backbone_id", default="facebook/dinov2-large",
                    help="frozen 백본. 예: facebook/dinov2-small(21M/384d), facebook/dinov2-base(86M/768d), "
                         "facebook/dinov3-vits16-pretrain-lvd1689m(21M/384d). proj Linear 입력 차원은 자동으로 맞춰짐")
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
    ap.add_argument("--arcface_k", type=int, default=1,
                    help="Sub-center ArcFace 서브센터 개수 (기본 1=vanilla ArcFace, 3 권장 = 노이즈 라벨에 강함)")
    ap.add_argument("--loss_type", choices=["arcface", "cosface", "circle"], default="arcface",
                    help="arcface(각도 margin, 기본) / cosface(코사인 margin, AM-Softmax — 더 안정적) / "
                         "circle(Circle Loss — self-paced 가중치로 easy/hard 샘플 다르게 취급)")
    ap.add_argument("--optimizer", choices=["adamw", "sgd"], default="adamw",
                    help="MegaDescriptor 공식 노트북은 SGD를 씀 — 우리 DINOv2 학습만 여태 AdamW였음")
    ap.add_argument("--momentum", type=float, default=0.9, help="--optimizer sgd 일 때만 사용")
    ap.add_argument("--weight_decay", type=float, default=1e-4)
    ap.add_argument("--sched", choices=["cosine", "plateau", "none"], default="cosine",
                    help="plateau = ReduceLROnPlateau, eval_period마다의 R@1 기준")
    ap.add_argument("--eval_period", type=int, default=5)
    ap.add_argument("--early_stop_patience", type=int, default=0,
                    help="이 횟수(eval_period 단위)만큼 R@1 개선이 없으면 조기 종료. 0=비활성(기존 동작)")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--unfreeze_blocks", type=int, default=0,
                    help="백본 마지막 N개 encoder.layer(+최종 layernorm)를 풀어서 같이 파인튜닝. "
                         "0=기존처럼 완전 프리즈(특징 캐시 사용, 빠름). >0이면 캐시를 안 쓰고 매 에폭 백본을 다시 통과시킴(훨씬 느림) -- --epochs 를 작게(예: 10) 주는 걸 권장")
    ap.add_argument("--backbone_lr", type=float, default=None,
                    help="언프리즈된 백본 파라미터용 LR. 기본값: --lr 의 1/100 (사전학습 특징 붕괴 방지, 작게)")
    ap.add_argument("--finetune_batch", type=int, default=64,
                    help="--unfreeze_blocks>0 일 때 배치 크기 (캐시 학습용 --batch 와 별개 -- 백본까지 GPU에 올라가서 VRAM 더 씀)")
    ap.add_argument("--num_workers", type=int, default=4, help="--unfreeze_blocks>0 일 때 DataLoader 워커 수")
    ap.add_argument("--teacher_ckpt", default=None,
                    help="distillation teacher 체크포인트(train_dinov2_projection.py 로 만든 .pth). "
                         "지정하면 ArcFace 손실에 (teacher 임베딩과의 거리) 항을 더해서 같이 학습")
    ap.add_argument("--distill_weight", type=float, default=1.0, help="--teacher_ckpt 일 때 distillation 손실 가중치")
    ap.add_argument("--distill_loss", choices=["cosine", "mse", "rkd"], default="cosine",
                    help="cosine = 1-코사인유사도(절대 위치 맞춤), mse = 평균제곱오차(절대 위치), "
                         "rkd = Relational KD(배치 내 거리+각도 구조만 맞춤, teacher 도메인 편향에 덜 종속적)")
    ap.add_argument("--grad_clip", type=float, default=0.0,
                    help="그래디언트 norm clipping 최대값. 0=비활성. 언프리즈 학습에서 초반 붕괴(예: "
                         "몇 에폭 만에 R@1이 정상범위 밖으로 추락) 방지용 -- 1.0 정도가 일반적")
    ap.add_argument("--zeroshot", action="store_true",
                    help="projection 학습 없이 raw DINOv2-large(1024d, L2정규화)로 held-out/also_eval_root 평가만 하고 종료. "
                         "projection이 실제로 뭘 더하는지 보려면 이 값과 학습 후 R@1을 같은 held-out에서 비교")
    args = ap.parse_args()
    print(f"device={DEV}")

    aug_tf = T.Compose([
        T.RandomResizedCrop(224, scale=(0.7, 1.0)),
        T.RandomHorizontalFlip(),
        T.ColorJitter(0.2, 0.2, 0.2),
        T.RandomApply([T.GaussianBlur(5, sigma=(0.1, 2.0))], p=0.3),  # 실전 폰사진 저화질/흔들림 대응
        T.ToTensor(), T.Normalize(MEAN, STD),
        T.RandomErasing(p=0.5, scale=(0.02, 0.2), ratio=(0.3, 3.3)),  # 목줄/손/창살 등 부분 가림 대응
    ])
    eval_tf = T.Compose([T.Resize((224, 224)), T.ToTensor(), T.Normalize(MEAN, STD)])
    view_tf = eval_tf if args.aug_views == 1 else aug_tf

    backbone = load_backbone(args.backbone_id, unfreeze_blocks=args.unfreeze_blocks)
    if args.backbone_lr is None:
        args.backbone_lr = args.lr * 0.01
    if args.unfreeze_blocks > 0:
        print(f"[언프리즈] 백본 마지막 {args.unfreeze_blocks}개 블록 + layernorm 같이 학습 "
              f"(backbone_lr={args.backbone_lr:.2e}, finetune_batch={args.finetune_batch})")
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
        print(f"[zeroshot] projection 학습 없이 raw {args.backbone_id}(L2정규화)로 평가만 수행")
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

    if args.unfreeze_blocks > 0:
        # 캐시 못 씀 (백본이 매 에폭 바뀌니까) -- proj 입력 차원은 백본 config 에서 바로 읽음
        feats = labs = None
        proj_in_dim = backbone.config.hidden_size
    else:
        # 백본 특징: 디스크 캐시 (재실행 시 스킵). aug_views 번 뽑아 쌓음
        cache_dir = Path(args.feat_cache); cache_dir.mkdir(parents=True, exist_ok=True)
        backbone_tag = args.backbone_id.rsplit("/", 1)[-1]  # 백본마다 차원이 달라서 캐시 파일명에 꼭 넣어야 함
        tag = f"{backbone_tag}_{args.data_format}_{n_cls}id_{len(paths)}img_{args.aug_views}v_s{args.seed}"
        fpath = cache_dir / f"trainfeat_{tag}.pt"
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
        proj_in_dim = feats.size(1)

    teacher_feats = teacher_emb = None
    if args.teacher_ckpt:
        t_backbone, t_proj = load_teacher(args.teacher_ckpt)
        teacher_tag = Path(args.teacher_ckpt).stem
        teacher_cache_dir = Path(args.feat_cache)
        teacher_cache_dir.mkdir(parents=True, exist_ok=True)
        teacher_cache = teacher_cache_dir / f"teacheremb_{teacher_tag}_{args.data_format}_{n_cls}id_{len(paths)}img.pt"
        teacher_base = teacher_embed(t_backbone, t_proj, paths, eval_tf, cache_path=teacher_cache,
                                      num_workers=args.num_workers)
        del t_backbone, t_proj
        if DEV == "cuda":
            torch.cuda.empty_cache()
        if args.unfreeze_blocks > 0:
            teacher_emb = teacher_base  # paths 와 1:1 -- train_one_epoch_finetune 이 인덱스로 직접 참조
        else:
            teacher_feats = teacher_base.repeat(args.aug_views, 1).to(DEV)  # feats/labs 와 같은 타일 순서로 정렬
        print(f"[teacher] distillation 준비 완료 (weight={args.distill_weight}, loss={args.distill_loss})")

    proj = nn.Linear(proj_in_dim, args.proj_dim, bias=False).to(DEV)
    arc = ArcFace(args.proj_dim, n_cls, s=args.arcface_scale, m=args.arcface_margin, k=args.arcface_k,
                  loss_type=args.loss_type).to(DEV)
    head_params = [*proj.parameters(), *arc.parameters()]
    backbone_trainable = [p for p in backbone.parameters() if p.requires_grad]
    if backbone_trainable:
        param_groups = [{"params": head_params, "lr": args.lr},
                         {"params": backbone_trainable, "lr": args.backbone_lr}]
    else:
        param_groups = head_params
    if args.optimizer == "sgd":
        opt = torch.optim.SGD(param_groups, lr=args.lr, momentum=args.momentum, weight_decay=args.weight_decay)
    else:
        opt = torch.optim.AdamW(param_groups, lr=args.lr, weight_decay=args.weight_decay)
    if args.sched == "cosine":
        sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)
    elif args.sched == "plateau":
        sched = torch.optim.lr_scheduler.ReduceLROnPlateau(opt, mode="max", factor=0.5, patience=3)
    else:
        sched = torch.optim.lr_scheduler.ConstantLR(opt, factor=1.0)

    def run_eval(proj):
        backbone.eval()
        try:
            if is_id2p:
                r = case_recall_lists(backbone, proj, eval_q, eval_g, eval_tf)
                if args.also_eval_root:
                    r2 = case_recall(backbone, proj, args.also_eval_root, eval_tf)
                    return r, r2
                return r, None
            return case_recall(backbone, proj, args.eval_root, eval_tf), None
        finally:
            if args.unfreeze_blocks > 0:
                backbone.train()

    print("참고: raw DINOv2-large zero-shot(projection 없이) 대비 이 수치가 높아야 projection 이 의미"
          " — 개 기준 shelter_hard_dogs raw ~93.6%. 고양이는 also_eval_root 첫 평가에서 raw 대비 직접 비교 필요")

    best = {"r1": -1.0, "r5": -1.0, "r10": -1.0, "epoch": -1}
    best_shelter = {"r1": -1.0, "r5": -1.0, "r10": -1.0, "epoch": -1}
    history = []  # epoch별 {epoch, loss, lr, r1, r5, r10} 기록 -> 학습 후 JSON으로 저장
    no_improve = 0
    for ep in range(1, args.epochs + 1):
        if args.unfreeze_blocks > 0:
            avg_loss = train_one_epoch_finetune(backbone, proj, arc, paths, labels, view_tf,
                                                 opt, args.finetune_batch, DEV, args.num_workers,
                                                 teacher_emb=teacher_emb, distill_weight=args.distill_weight,
                                                 distill_loss=args.distill_loss, grad_clip=args.grad_clip)
        else:
            avg_loss = train_one_epoch(proj, arc, feats, labs, opt, args.batch, DEV,
                                        teacher_feats=teacher_feats, distill_weight=args.distill_weight,
                                        distill_loss=args.distill_loss, grad_clip=args.grad_clip)
        if args.sched != "plateau":  # plateau는 아래 R@1이 나온 시점에 step
            sched.step()
        if ep % args.eval_period == 0 or ep == args.epochs:
            proj.eval()
            r, r2 = run_eval(proj)
            if args.sched == "plateau":
                sched.step(r[1])
            hist_entry = {"epoch": ep, "loss": avg_loss, "lr": opt.param_groups[0]["lr"],
                          "r1": r[1], "r5": r[5], "r10": r[10]}
            line = (f"[epoch {ep:3d}] loss {avg_loss:.3f}  lr {opt.param_groups[0]['lr']:.2e}  "
                    f"| {ev_name}  R@1 {r[1]:.1%}  R@5 {r[5]:.1%}  R@10 {r[10]:.1%}")
            if r2:
                hist_entry.update(shelter_r1=r2[1], shelter_r5=r2[5], shelter_r10=r2[10])
                line += f"  || shelter  R@1 {r2[1]:.1%}  R@5 {r2[5]:.1%}  R@10 {r2[10]:.1%}"
            print(line)
            history.append(hist_entry)

            def snapshot():
                backbone_finetune = None
                if args.unfreeze_blocks > 0:
                    backbone_finetune = {
                        "unfreeze_blocks": args.unfreeze_blocks,
                        "layer_state": [l.state_dict() for l in backbone.encoder.layer[-args.unfreeze_blocks:]],
                        "layernorm_state": backbone.layernorm.state_dict(),
                    }
                return {"proj": proj.state_dict(), "backbone": args.backbone_id,
                        "proj_dim": args.proj_dim, "r1": r[1], "epoch": ep,
                        "backbone_finetune": backbone_finetune, "args": vars(args)}

            improved = r[1] > best["r1"]
            if improved:
                best.update(r1=r[1], r5=r[5], r10=r[10], epoch=ep)
                no_improve = 0
                torch.save(snapshot(), args.out)
                print(f"      -> best({ev_name}) 저장 (R@1 {r[1]:.1%})  {args.out}")
            else:
                no_improve += 1
            # shelter(교차 도메인, 실배포 기준)는 held-out과 최고 에폭이 다를 수 있어서 따로 추적/저장
            # -- 안 그러면 held-out만 보고 저장하다가 shelter가 더 좋았던 에폭을 놓침 (실제로 한 번 그랬음)
            if r2 and r2[1] > best_shelter["r1"]:
                best_shelter.update(r1=r2[1], r5=r2[5], r10=r2[10], epoch=ep)
                shelter_out = Path(str(args.out)).with_name(Path(args.out).stem + "_bestshelter" + Path(args.out).suffix)
                torch.save(snapshot(), shelter_out)
                print(f"      -> best(shelter) 저장 (R@1 {r2[1]:.1%})  {shelter_out}")
            if not improved and args.early_stop_patience and no_improve >= args.early_stop_patience:
                print(f"[early stopping] {args.early_stop_patience}회 연속 개선 없음 (epoch {ep}) -> 조기 종료")
                break

    hist_path = Path(str(args.out) + ".history.json")
    json.dump(history, open(hist_path, "w"), indent=2)
    print(f"\n최고 {ev_name} R@1 {best['r1']:.1%}  R@5 {best['r5']:.1%}  R@10 {best['r10']:.1%}"
          f"  @ epoch {best['epoch']}  (history: {hist_path})")
    if best_shelter["epoch"] >= 0:
        print(f"최고 shelter R@1 {best_shelter['r1']:.1%}  R@5 {best_shelter['r5']:.1%}  R@10 {best_shelter['r10']:.1%}"
              f"  @ epoch {best_shelter['epoch']}"
              f"  (held-out 최고와 다른 에폭일 수 있음 -- 별도 저장된 *_bestshelter.pth 확인)")
    print("참고(개 기준, shelter_hard_dogs 3000방해꾼): raw DINOv2-large ~93.6% / "
          "pet-recognition-large 61.9% / 자체 projection ~60~62%")


if __name__ == "__main__":
    main()
