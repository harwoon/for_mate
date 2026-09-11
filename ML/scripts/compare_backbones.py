"""
백본/모델 비교 — 우리 하드 eval 에서 케이스 단위 Recall (feature + 코사인, 대부분 zero-shot).

  petreco   : open-noodle/pet-recognition-large (frozen DINOv2-large + 학습된 512d projection, ONNX)
  dinov2    : facebook/dinov2-large 원본 (projection 없음, pooler_output 1024d) <- projection 이 얼마나 보태는지
  siglip2   : google/siglip2-* (foundation, get_image_features)
  ours      : 우리가 train_dinov2_projection.py 로 직접 학습한 체크포인트 (frozen dinov2-large + 학습된 Linear projection).
              petreco/raw dinov2 와 나란히 비교하려고 있음 -- --ours_ckpt 로 dog/cat 체크포인트 지정.

전처리는 각 모델 관례대로 (petreco/ours = 224 + ImageNet, dinov2/siglip2 = 각자 HF processor).
채점은 eval_case_level_wildlife.py 와 동일: query 여러 장 평균+정규화, 개체 유사도 = max.

  python scripts/compare_backbones.py                                   # dogs, cats
  python scripts/compare_backbones.py --sets dogs cats corrupt --models petreco dinov2 siglip2
  python scripts/compare_backbones.py --siglip_id google/siglip2-so400m-patch14-384
  python scripts/compare_backbones.py --sets cats --models ours petreco dinov2 --ours_ckpt ML/checkpoints/dinov2_proj_cat.pth
"""
import argparse
import re
from collections import defaultdict
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image

ML_DIR = Path(__file__).resolve().parent.parent
DEV = "cuda" if torch.cuda.is_available() else "cpu"
FN = re.compile(r"(\d+)_c(\d+)s(\d+)_(\d+)\.jpg$", re.I)
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], np.float32)

SETS = {
    "dogs":    ML_DIR / "dataset/derived/shelter_hard_dogs",
    "cats":    ML_DIR / "dataset/derived/shelter_hard_cats",
    "corrupt": ML_DIR / "dataset/derived/MPDD_hard_corrupt/MPDD/pytorch",
}


def pid_of(p):
    m = FN.search(Path(p).name)
    return int(m.group(1)) if m else None


# ---------------- 백본 로더: embed(list[Path]) -> np.ndarray [N, D] (L2 정규화) ----------------

def make_petreco():
    import onnxruntime as ort
    from huggingface_hub import hf_hub_download
    onnx = hf_hub_download("open-noodle/pet-recognition-large", "recognition/model.onnx")
    prov = (["CUDAExecutionProvider", "CPUExecutionProvider"]
            if "CUDAExecutionProvider" in ort.get_available_providers() else ["CPUExecutionProvider"])
    sess = ort.InferenceSession(onnx, providers=prov)
    iname, oname = sess.get_inputs()[0].name, sess.get_outputs()[0].name

    def embed(paths, bs=32):
        out = []
        for i in range(0, len(paths), bs):
            arr = []
            for p in paths[i:i + bs]:
                im = Image.open(p).convert("RGB").resize((224, 224), Image.BILINEAR)
                a = (np.asarray(im, np.float32) / 255.0 - IMAGENET_MEAN) / IMAGENET_STD
                arr.append(a.transpose(2, 0, 1))
            out.append(sess.run([oname], {iname: np.stack(arr).astype(np.float32)})[0])
        v = np.concatenate(out)
        return v / (np.linalg.norm(v, axis=1, keepdims=True) + 1e-12)
    return embed


def make_ours(ckpt_path):
    """train_dinov2_projection.py 가 저장한 체크포인트: frozen dinov2-large + 학습된 Linear projection."""
    import torch.nn as nn
    import torchvision.transforms as T
    from transformers import AutoModel

    ck = torch.load(ckpt_path, map_location=DEV, weights_only=False)
    backbone = AutoModel.from_pretrained(ck.get("backbone", "facebook/dinov2-large")).eval().to(DEV)
    for p in backbone.parameters():
        p.requires_grad_(False)
    proj = nn.Linear(1024, ck["proj_dim"], bias=False).to(DEV)
    proj.load_state_dict(ck["proj"])
    proj.eval()
    print(f"  [ours] {ckpt_path}  (best epoch {ck.get('epoch')}, 학습 당시 R@1 {ck.get('r1', 0):.1%})")
    tf = T.Compose([T.Resize((224, 224)), T.ToTensor(),
                    T.Normalize(IMAGENET_MEAN.tolist(), IMAGENET_STD.tolist())])

    @torch.no_grad()
    def embed(paths, bs=64):
        out = []
        for i in range(0, len(paths), bs):
            batch = torch.stack([tf(Image.open(p).convert("RGB")) for p in paths[i:i + bs]]).to(DEV)
            feat = backbone(pixel_values=batch).pooler_output
            out.append(F.normalize(proj(feat), dim=1).cpu().numpy())
        return np.concatenate(out)
    return embed


def _hf_image_embed(model_id, kind):
    from transformers import AutoImageProcessor, AutoModel, AutoProcessor
    proc = (AutoImageProcessor if kind == "dinov2" else AutoProcessor).from_pretrained(model_id)
    dtype = torch.float16 if (kind == "siglip2" and DEV == "cuda") else torch.float32
    model = AutoModel.from_pretrained(model_id, torch_dtype=dtype).eval().to(DEV)

    @torch.no_grad()
    def embed(paths, bs=16):
        out = []
        for i in range(0, len(paths), bs):
            ims = [Image.open(p).convert("RGB") for p in paths[i:i + bs]]
            inp = proc(images=ims, return_tensors="pt").to(DEV)
            if dtype == torch.float16:
                inp = {k: (v.half() if torch.is_floating_point(v) else v) for k, v in inp.items()}
            if kind == "dinov2":
                feat = model(**inp).pooler_output
            else:  # siglip2
                try:
                    feat = model.get_image_features(pixel_values=inp["pixel_values"])
                except Exception:
                    feat = None
                if not torch.is_tensor(feat):
                    vm = getattr(model, "vision_model", model)
                    o = vm(pixel_values=inp["pixel_values"])
                    feat = getattr(o, "pooler_output", None)
                    if feat is None:
                        feat = o.last_hidden_state.mean(1)
            out.append(F.normalize(feat.float(), dim=1).cpu().numpy())
        return np.concatenate(out)
    return embed


# ---------------- 케이스 단위 채점 ----------------

def evaluate(root, embed, gallery_per_id=2):
    root = Path(root)
    q_paths = sorted((root / "query").glob("*.jpg"))
    g_all = sorted((root / "gallery").glob("*.jpg"))
    by = defaultdict(list)
    for p in g_all:
        by[pid_of(p)].append(p)
    g_paths = [p for v in by.values() for p in v[:gallery_per_id]]

    ge = embed(g_paths)
    gp = np.array([pid_of(p) for p in g_paths])
    qe = embed(q_paths)
    qp = np.array([pid_of(p) for p in q_paths])

    cps = sorted(set(qp.tolist()))
    ce = np.stack([(lambda v: v / (np.linalg.norm(v) + 1e-12))(qe[qp == c].mean(0)) for c in cps])
    gids = sorted(set(gp.tolist()))
    gi = {p: i for i, p in enumerate(gids)}
    sim = ce @ ge.T
    M = np.full((len(cps), len(gids)), -1.0, np.float32)
    for j, p in enumerate(gp):
        M[:, gi[p]] = np.maximum(M[:, gi[p]], sim[:, j])
    out = {}
    for k in (1, 5, 10):
        h = sum(1 for i, c in enumerate(cps)
                if c in [gids[j] for j in np.argsort(-M[i])][:k])
        out[k] = h / len(cps)
    return out, len(cps), len(gids)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sets", nargs="+", default=["dogs", "cats"], choices=list(SETS))
    ap.add_argument("--models", nargs="+", default=["petreco", "dinov2", "siglip2"],
                    choices=["petreco", "dinov2", "siglip2", "ours"])
    ap.add_argument("--siglip_id", default="google/siglip2-giant-opt-patch16-384")
    ap.add_argument("--dinov2_id", default="facebook/dinov2-large")
    ap.add_argument("--ours_ckpt", default=None,
                    help="ours 모델용 train_dinov2_projection.py 체크포인트. "
                         "예: ML/checkpoints/dinov2_proj_cat.pth (--sets cats), dinov2_proj_dog.pth (--sets dogs)")
    args = ap.parse_args()
    if "ours" in args.models and not args.ours_ckpt:
        ap.error("--models ours 는 --ours_ckpt 필요 (예: ML/checkpoints/dinov2_proj_cat.pth)")
    print(f"device={DEV}")

    builders = {
        "petreco": make_petreco,
        "dinov2": lambda: _hf_image_embed(args.dinov2_id, "dinov2"),
        "siglip2": lambda: _hf_image_embed(args.siglip_id, "siglip2"),
        "ours": lambda: make_ours(args.ours_ckpt),
    }
    embedders = {}
    for m in args.models:
        print(f"[load] {m} ...", flush=True)
        embedders[m] = builders[m]()

    for s in args.sets:
        print(f"\n=== {s}  ({SETS[s]}) ===")
        for m in args.models:
            r, ncase, nid = evaluate(SETS[s], embedders[m])
            print(f"  {m:9s}  n={ncase} / gallery id {nid}   "
                  f"R@1 {r[1]:.1%}  R@5 {r[5]:.1%}  R@10 {r[10]:.1%}")


if __name__ == "__main__":
    main()
