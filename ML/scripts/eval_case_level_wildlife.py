"""
MegaDescriptor / PetFace / ARBase 용 케이스 단위 하드 eval — CLIP-ReID 의 eval_case_level.py 와 동일한 채점 방식.

- query  : 신고 사진 여러 장 -> 같은 pid(케이스)의 임베딩을 평균+재정규화해서 케이스 벡터 1개로 합침
- gallery: 개체(pid)당 정확히 --gallery_per_id 장만 사용. query에 안 나오는(=방해꾼) pid는 원래 장수 그대로 유지.
- 채점  : 케이스별 정답 개체의 랭크. 개체 유사도 = 그 개체가 가진 (최대 N장) 사진들과의 유사도 중 최댓값.

CLIP-ReID 버전과 다른 점: 백본이 timm(MegaDescriptor) / torchvision resnet50(PetFace) /
IBN-ResNet50+MGN(ARBase) 이고 전처리가 ImageNet 통계(mean/std)를 쓴다(입력 크기는 모델별로 다름).
나머지 채점 로직은 동일해서 숫자를 그대로 비교할 수 있다.
"""
import argparse
import re
from collections import defaultdict
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
import torchvision.transforms as T
from PIL import Image
from torch.utils.data import DataLoader, Dataset

FN_RE = re.compile(r"(\d+)_c(\d+)s(\d+)_(\d+)\.jpg$", re.I)
MEAN, STD = (0.485, 0.456, 0.406), (0.229, 0.224, 0.225)
MODEL_IMG_SIZE = {"megadescriptor": 224, "megadescriptor_l": 384,
                  "petface": 224, "arbase": 384, "petreco": 224}

PETRECO_REPO = "open-noodle/pet-recognition-large"   # DINOv2-large(frozen) + 512d projection, Apache-2.0
PETRECO_FILE = "recognition/model.onnx"


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


class OnnxEmbedder:
    """ONNX 모델을 torch 모듈처럼: __call__(tensor[N,3,H,W]) -> tensor[N,D]. embed() 에서 그대로 쓰임."""
    def __init__(self, onnx_path, device):
        import onnxruntime as ort
        avail = ort.get_available_providers()
        prov = (["CUDAExecutionProvider", "CPUExecutionProvider"]
                if device == "cuda" and "CUDAExecutionProvider" in avail else ["CPUExecutionProvider"])
        self.sess = ort.InferenceSession(str(onnx_path), providers=prov)
        self.iname = self.sess.get_inputs()[0].name
        self.oname = self.sess.get_outputs()[0].name

    def __call__(self, x):
        out = self.sess.run([self.oname],
                            {self.iname: x.detach().cpu().numpy().astype("float32")})[0]
        return torch.from_numpy(out)

    def to(self, *a, **k):
        return self

    def eval(self):
        return self


def build_model(model_name, ckpt_path, device, zeroshot=False):
    if model_name == "petreco":
        from huggingface_hub import hf_hub_download
        onnx_path = ckpt_path or hf_hub_download(PETRECO_REPO, PETRECO_FILE)
        return OnnxEmbedder(onnx_path, device)

    no_ckpt = zeroshot or model_name == "megadescriptor_l"   # 파인튜닝 ckpt 없이 사전학습 그대로
    ck = None if no_ckpt else torch.load(ckpt_path, map_location=device, weights_only=False)
    if model_name == "megadescriptor":
        import timm
        # zeroshot: 파인튜닝 없이 사전학습 가중치 그대로 (파인튜닝 이득 대조용)
        model = timm.create_model("hf-hub:BVRA/MegaDescriptor-B-224", num_classes=0,
                                  pretrained=zeroshot)
    elif model_name == "megadescriptor_l":
        import timm
        # 계열 최강 (Swin-L, 384). 가중치 CC-BY-NC-4.0. zeroshot 전용(파인튜닝 ckpt 없음)
        model = timm.create_model("hf-hub:BVRA/MegaDescriptor-L-384", num_classes=0,
                                  pretrained=True)
    elif model_name == "petface":
        from torchvision.models import resnet50
        import torch.nn as nn
        model = resnet50(weights=None)
        model.fc = nn.Sequential(nn.Linear(model.fc.in_features, 512), nn.BatchNorm1d(512))
    elif model_name == "arbase":
        from arbase_model import ARBase
        model = ARBase(num_classes=(ck["num_classes"] if ck else 1),
                       pretrained_backbone=zeroshot)
    else:
        raise ValueError(model_name)
    if ck is not None:
        model.load_state_dict(ck["model"])
    return model.to(device).eval()


@torch.no_grad()
def embed(model, paths, tf, device, batch=64):
    dl = DataLoader(ImgList(paths, tf), batch_size=batch, num_workers=0)
    feats, out_paths = [], []
    for imgs, ps in dl:
        f = F.normalize(model(imgs.to(device)), dim=1)
        feats.append(f.cpu())
        out_paths.extend(ps)
    return torch.cat(feats).numpy(), out_paths


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True,
                    choices=["megadescriptor", "megadescriptor_l", "petface", "arbase", "petreco"])
    ap.add_argument("--root", required=True, help="예: ML/dataset/derived/MPDD_hard_corrupt/MPDD/pytorch")
    ap.add_argument("--weight", default=None,
                    help="체크포인트 경로. petreco 는 생략하면 HF 에서 자동 다운로드")
    ap.add_argument("--gallery_per_id", type=int, default=2)
    ap.add_argument("--dump_errors", default=None, help="케이스별 랭크/오답을 csv로 저장 (오류 분석용)")
    ap.add_argument("--zeroshot", action="store_true",
                    help="파인튜닝 없이 사전학습 가중치 그대로 (megadescriptor/arbase). 파인튜닝 이득 대조용")
    args = ap.parse_args()
    if args.model not in ("petreco", "megadescriptor_l") and not args.weight and not args.zeroshot:
        ap.error("--weight 필요 (petreco 또는 --zeroshot 이면 생략 가능)")

    device = "cuda" if torch.cuda.is_available() else "cpu"
    img_size = MODEL_IMG_SIZE[args.model]
    tf = T.Compose([T.Resize((img_size, img_size)), T.ToTensor(), T.Normalize(MEAN, STD)])

    root = Path(args.root)
    q_paths_all = sorted((root / "query").glob("*.jpg"))
    g_paths_all = sorted((root / "gallery").glob("*.jpg"))

    by_pid = defaultdict(list)
    for p in g_paths_all:
        by_pid[parse_pid(p)].append(p)
    g_paths = [p for plist in by_pid.values() for p in plist[: args.gallery_per_id]]
    print(f"gallery 원본 {len(g_paths_all)}장 -> {args.gallery_per_id}장/개체 캡 적용 후 "
          f"{len(g_paths)}장 ({len(by_pid)}개체)")

    model = build_model(args.model, args.weight, device, zeroshot=args.zeroshot)
    if args.zeroshot:
        print(f"[zeroshot] {args.model} 사전학습 가중치 그대로 (파인튜닝 없음)")

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

    sim = case_emb @ g_emb.T
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
    print(f"\n[{args.model}] 케이스 {n}개 | gallery 개체 {len(gallery_ids)} = 진짜 동물 {n_real} + 방해꾼 {n_distractor}")
    for r in ranks_needed:
        print(f"Recall@{r}: {hits[r] / n:.1%}")


if __name__ == "__main__":
    main()
