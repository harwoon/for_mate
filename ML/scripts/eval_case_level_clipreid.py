"""
케이스(query 여러 장) x 개체(gallery 최대 N장) 단위 평가.

실제 서비스 조건 반영:
- query  : 신고 사진 여러 장 -> 같은 pid(케이스)의 임베딩을 평균+재정규화해서 케이스 벡터 1개로 합침
- gallery: 보호소 DB, 개체(pid)당 정확히 --gallery_per_id 장만 사용 (그 이상은 버림).
           방해꾼(YT-BB, pid>=950000)은 원래 1장뿐이라 그대로 유지됨.
- 채점  : 케이스별로 정답 개체가 몇 번째 "개체"에 랭크되는지 (사진 단위가 아니라 개체 단위).
          개체 유사도 = 그 개체가 가진 (최대 N장) 사진들과의 유사도 중 최댓값
          ("등록된 2장 중 하나라도 잘 맞으면 그 개체를 찾은 것"으로 취급)

CLIP-ReID stage2 체크포인트를 그대로 재사용. 전처리는 기존 test 파이프라인의
val_transforms(Resize -> ToTensor -> Normalize)와 동일하게 맞춤.
"""
import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
import torchvision.transforms as T
from PIL import Image
from torch.utils.data import DataLoader, Dataset

CLIPREID_DIR = Path(__file__).resolve().parent.parent / "external" / "CLIP-ReID"
sys.path.insert(0, str(CLIPREID_DIR))  # config/, model/ 는 external/CLIP-ReID 안 패키지

from config import cfg
from model.make_model_clipreid import make_model

FN_RE = re.compile(r"(\d+)_c(\d+)s(\d+)_(\d+)\.jpg$", re.I)


class ImgList(Dataset):
    def __init__(self, paths, tf):
        self.paths, self.tf = paths, tf

    def __len__(self):
        return len(self.paths)

    def __getitem__(self, i):
        p = self.paths[i]
        return self.tf(Image.open(p).convert("RGB")), str(p)


def parse_pid(p):
    m = FN_RE.search(Path(p).name)
    return int(m.group(1)) if m else None


@torch.no_grad()
def embed(model, paths, tf, device, batch=64):
    dl = DataLoader(ImgList(paths, tf), batch_size=batch, num_workers=0)
    feats, out_paths = [], []
    for imgs, ps in dl:
        f = model(imgs.to(device), cam_label=None, view_label=None)
        f = F.normalize(f, dim=1)
        feats.append(f.cpu())
        out_paths.extend(ps)
    return torch.cat(feats).numpy(), out_paths


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config_file", required=True,
                     help="예: ML/external/CLIP-ReID/configs/person/vit_clipreid_mpdd_hard_corrupt.yml")
    ap.add_argument("--root", required=True, help="예: ML/dataset/derived/MPDD_hard_corrupt/MPDD/pytorch")
    ap.add_argument("--weight", required=True)
    ap.add_argument("--gallery_per_id", type=int, default=2)
    ap.add_argument("--dump_errors", default=None, help="케이스별 랭크/오답을 csv로 저장 (오류 분석용)")
    args = ap.parse_args()

    cfg.merge_from_file(args.config_file)
    cfg.freeze()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    tf = T.Compose([
        T.Resize(cfg.INPUT.SIZE_TEST),
        T.ToTensor(),
        T.Normalize(mean=cfg.INPUT.PIXEL_MEAN, std=cfg.INPUT.PIXEL_STD),
    ])

    root = Path(args.root)
    q_paths_all = sorted((root / "query").glob("*.jpg"))
    g_paths_all = sorted((root / "gallery").glob("*.jpg"))

    by_pid = defaultdict(list)
    for p in g_paths_all:
        by_pid[parse_pid(p)].append(p)
    g_paths = [p for plist in by_pid.values() for p in plist[: args.gallery_per_id]]
    print(f"gallery 원본 {len(g_paths_all)}장 -> {args.gallery_per_id}장/개체 캡 적용 후 "
          f"{len(g_paths)}장 ({len(by_pid)}개체)")

    model = make_model(cfg, num_class=95, camera_num=6, view_num=1)
    model.load_param(args.weight)
    model.to(device).eval()

    g_emb, g_used_paths = embed(model, g_paths, tf, device)
    g_pid = np.array([parse_pid(p) for p in g_used_paths])

    q_emb_raw, q_used_paths = embed(model, q_paths_all, tf, device)
    q_pid_raw = np.array([parse_pid(p) for p in q_used_paths])

    case_pids = sorted(set(q_pid_raw.tolist()))
    case_emb = []
    for pid in case_pids:
        v = q_emb_raw[q_pid_raw == pid].mean(axis=0)
        case_emb.append(v / (np.linalg.norm(v) + 1e-12))
    case_emb = np.stack(case_emb)
    print(f"query {len(q_used_paths)}장 -> {len(case_pids)}케이스로 평균")

    sim = case_emb @ g_emb.T  # [case, gallery_photo]
    gallery_ids = sorted(set(g_pid.tolist()))
    id_index = {pid: i for i, pid in enumerate(gallery_ids)}
    id_sim = np.full((len(case_pids), len(gallery_ids)), -1.0, dtype=np.float32)
    for j, pid in enumerate(g_pid):
        col = id_index[pid]
        id_sim[:, col] = np.maximum(id_sim[:, col], sim[:, j])

    ranks_needed = [1, 5, 10]
    hits = {r: 0 for r in ranks_needed}
    error_rows = []
    for i, pid in enumerate(case_pids):
        order = np.argsort(-id_sim[i])
        ranked_ids = [gallery_ids[j] for j in order]
        rank = ranked_ids.index(pid) + 1 if pid in ranked_ids else None
        for r in ranks_needed:
            if rank is not None and rank <= r:
                hits[r] += 1
        error_rows.append(dict(
            case_pid=pid, rank=rank if rank is not None else -1,
            top1_pred_pid=ranked_ids[0], top1_score=float(id_sim[i, order[0]]),
            true_score=float(id_sim[i, id_index[pid]]),
        ))

    if args.dump_errors:
        import csv as _csv
        with open(args.dump_errors, "w", newline="", encoding="utf-8-sig") as f:
            w = _csv.DictWriter(f, fieldnames=list(error_rows[0].keys()))
            w.writeheader()
            w.writerows(error_rows)
        print(f"케이스별 결과 -> {args.dump_errors}")

    # "진짜" = query(케이스)로 한 번이라도 등장하는 pid, "방해꾼" = gallery에만 있고 정답으로 안 쓰이는 pid
    # (pid 크기로 구분하던 예전 방식은 MPDD_hard처럼 방해꾼 pid를 900000+ 로 부여한 데이터에만 맞았음)
    n_real = len(set(case_pids) & set(gallery_ids))
    n_distractor = len(gallery_ids) - n_real
    n = len(case_pids)
    print(f"\n케이스 {n}개 | gallery 개체 {len(gallery_ids)} = 진짜 동물 {n_real} + 방해꾼 {n_distractor}")
    for r in ranks_needed:
        print(f"Recall@{r}: {hits[r] / n:.1%}")


if __name__ == "__main__":
    main()
