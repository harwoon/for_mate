"""
크롭 방식이 Re-ID 검색 성능에 영향을 주는지 확인.

같은 원본 이미지(dataset/raw/shelter_raw/<species>)를 3가지로 전처리해 동일한 케이스단위 평가:
  - none    : 크롭 없이 원본 그대로 (aspect 유지 224 패딩)
  - rtdetr  : RT-DETR 로 동물 박스 크롭 (실패 시 원본 폴백)
  - tv      : torchvision Faster R-CNN v2 로 크롭 (실패 시 원본 폴백)

평가셋 구성:
  - 사진 2장 개체 -> _1 = gallery(등록), _2 = query(신고)   (케이스당 query 1장)
  - 사진 1장 개체 -> gallery 방해꾼 (query 없음)
  - 채점: 케이스별 정답 개체의 랭크. 개체 유사도 = 그 개체 사진들과의 유사도 max.

모델: megadescriptor / petface / arbase / clipreid (MODEL_REGISTRY + clipreid 특례).
새 모델 추가는 MODEL_REGISTRY 에 (입력크기, 체크포인트파일명, 빌더) 한 줄.

────────────────────────────────────────────────────────────────────────
실행 명령어 (ML/ 에서. 한 줄씩 따로 실행, 각 1~2분. --model 로 모델 교체)
────────────────────────────────────────────────────────────────────────
# 0) 4개 모델 한 번에 (--model all). 크롭 감지는 1회만 하고 모델별로 재사용
python -u scripts/eval_crop_impact.py --model all --complement rtdetr none

# 1) 기본: none/rtdetr/tv 각각 Recall@1/5/10  (옵션 없으면 이것만 나옴)
python -u scripts/eval_crop_impact.py --model megadescriptor

# 2) 상보성: 크롭만 맞힌 케이스 / 원본만 맞힌 케이스 / OR상한 / score합산
python -u scripts/eval_crop_impact.py --model megadescriptor petface --complement rtdetr none

# 3) 상보성 + 케이스별 CSV + 불일치 그리드 저장
python -u scripts/eval_crop_impact.py --model petface --complement rtdetr none \
        --dump_dir dataset/derived/crop_complement

# 4) gallery×query 전처리 불일치 매트릭스 (DB만 크롭하고 query 원본 쓰면 얼마나 손해?)
python -u scripts/eval_crop_impact.py --model megadescriptor --matrix

# 5) 고양이 / 특정 전처리만
python -u scripts/eval_crop_impact.py --model clipreid --src dataset/raw/shelter_raw/cat --modes none rtdetr
"""
import argparse
import sys
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np
import torch
import torch.nn.functional as F

ML_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ML_DIR / "scripts"))
from compare_detectors import RtDetrDet, TvDet, DEVICE, ANIMAL_CLASSES  # noqa: E402

MEAN = np.array([0.485, 0.456, 0.406], np.float32)   # ImageNet (아래 3모델 공통)
STD = np.array([0.229, 0.224, 0.225], np.float32)

# 모델 추가 시 여기만 손보면 됨: 이름 -> (입력 크기, 체크포인트 파일명, 빌더).
# 빌더는 nn.Module 반환. forward(x)->임베딩 이어야 함 (CLIP-ReID 는 forward 시그니처가 달라 별도 처리 필요).
def _build_megadescriptor(ck):
    import timm
    return timm.create_model("hf-hub:BVRA/MegaDescriptor-B-224", num_classes=0, pretrained=False)


def _build_petface(ck):
    import torch.nn as nn
    from torchvision.models import resnet50
    m = resnet50(weights=None)
    m.fc = nn.Sequential(nn.Linear(m.fc.in_features, 512), nn.BatchNorm1d(512))
    return m


def _build_arbase(ck):
    from arbase_model import ARBase
    return ARBase(num_classes=ck["num_classes"], pretrained_backbone=False)


MODEL_REGISTRY = {
    "megadescriptor": (224, "megadescriptor_mpdd_best.pth", _build_megadescriptor),
    "petface":        (224, "petface_mpdd_best.pth",        _build_petface),
    "arbase":         (384, "arbase_mpdd_best.pth",          _build_arbase),
}


def resize_pad(img, size):
    """aspect 유지 + 회색 패딩으로 정사각. collect_dataset.resize_with_padding 과 동일 취지."""
    h, w = img.shape[:2]
    s = size / max(h, w)
    nh, nw = max(1, int(h * s)), max(1, int(w * s))
    r = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
    canvas = np.full((size, size, 3), 114, np.uint8)
    y0, x0 = (size - nh) // 2, (size - nw) // 2
    canvas[y0:y0 + nh, x0:x0 + nw] = r
    return canvas


@torch.no_grad()
def rtdetr_pick_detail(det, img_bgr, thresh=0.25):
    """면적 최대 동물 박스 기준 라우팅 피처 dict.
    conf, area(박스/이미지 면적비), n_animals, person_area(가장 큰 사람 박스 면적비),
    aspect(긴변/짧은변, >=1). 동물 미탐 시 conf=area=n_animals=0, aspect=1."""
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    inp = det.proc(images=rgb, return_tensors="pt").to(DEVICE)
    out = det.m(**inp)
    h, w = img_bgr.shape[:2]
    res = det.proc.post_process_object_detection(out, target_sizes=[(h, w)], threshold=0.05)[0]
    animals, persons = [], []
    for b, l, s in zip(res["boxes"].cpu(), res["labels"].cpu(), res["scores"].cpu()):
        name, sc = det.cats[int(l)], float(s)
        if sc < thresh:
            continue
        x1, y1, x2, y2 = [float(v) for v in b]
        if name in ANIMAL_CLASSES:
            animals.append((sc, x2 - x1, y2 - y1))
        elif name == "person":
            persons.append((x2 - x1) * (y2 - y1))
    person_area = (max(persons) / (h * w)) if persons else 0.0
    if not animals:
        return dict(conf=0.0, area=0.0, n_animals=0, person_area=person_area, aspect=1.0)
    sc, bw, bh = max(animals, key=lambda t: t[1] * t[2])
    return dict(conf=sc, area=(bw * bh) / (h * w), n_animals=len(animals),
                person_area=person_area, aspect=max(bw, bh) / max(1.0, min(bw, bh)))


def make_cropper(mode):
    if mode == "none":
        return lambda im: im
    det = RtDetrDet() if mode == "rtdetr" else TvDet()

    def crop(im):
        box = det(im, 0.25)
        if box is None:
            return im  # 폴백: 원본
        h, w = im.shape[:2]
        x1, y1, x2, y2 = (max(0, int(box[0])), max(0, int(box[1])),
                          min(w, int(box[2])), min(h, int(box[3])))
        c = im[y1:y2, x1:x2]
        return c if c.size else im
    return crop


MODELS = list(MODEL_REGISTRY) + ["clipreid", "petreco", "dinov2"]


def load_model(name, clipreid_config=None, clipreid_weight=None):
    """-> (callable(tensor)->임베딩, 입력크기, mean(3,), std(3,))."""
    if name == "petreco":   # open-noodle/pet-recognition-large (ONNX, DINOv2-L + 512d projection)
        import onnxruntime as ort
        from huggingface_hub import hf_hub_download
        onnx = hf_hub_download("open-noodle/pet-recognition-large", "recognition/model.onnx")
        prov = (["CUDAExecutionProvider", "CPUExecutionProvider"]
                if "CUDAExecutionProvider" in ort.get_available_providers() else ["CPUExecutionProvider"])
        sess = ort.InferenceSession(onnx, providers=prov)
        iname, oname = sess.get_inputs()[0].name, sess.get_outputs()[0].name

        def fn(t):
            e = sess.run([oname], {iname: t.detach().cpu().numpy().astype("float32")})[0]
            return torch.from_numpy(e)
        return fn, 224, MEAN, STD

    if name == "dinov2":    # facebook/dinov2-large 원본 (projection 없이 pooler_output 1024d)
        from transformers import AutoModel
        m = AutoModel.from_pretrained("facebook/dinov2-large").eval().to(DEVICE)
        return (lambda t: m(pixel_values=t).pooler_output), 224, MEAN, STD

    if name == "clipreid":
        cfg_path = clipreid_config or str(ML_DIR / "external" / "CLIP-ReID" / "configs" /
                                         "person" / "vit_clipreid_mpdd_hard_corrupt.yml")
        wt = clipreid_weight or str(ML_DIR / "external" / "CLIP-ReID" / "logs" /
                                    "mpdd_clipreid" / "ViT-B-16_60.pth")
        sys.path.insert(0, str(ML_DIR / "external" / "CLIP-ReID"))
        from config import cfg
        from model.make_model_clipreid import make_model
        cfg.merge_from_file(cfg_path)
        cfg.freeze()
        base = make_model(cfg, num_class=95, camera_num=6, view_num=1)
        base.load_param(wt)
        base.to(DEVICE).eval()
        return ((lambda x: base(x, cam_label=None, view_label=None)),
                cfg.INPUT.SIZE_TEST[0],
                np.array(cfg.INPUT.PIXEL_MEAN, np.float32),
                np.array(cfg.INPUT.PIXEL_STD, np.float32))

    size, ckpt_name, builder = MODEL_REGISTRY[name]
    ck = torch.load(ML_DIR / "checkpoints" / ckpt_name, map_location=DEVICE, weights_only=False)
    m = builder(ck)
    m.load_state_dict(ck["model"])
    return m.to(DEVICE).eval(), size, MEAN, STD


@torch.no_grad()
def embed(model, imgs, mean, std):
    """imgs: list of HxWx3 uint8 (정사각) -> L2정규화 임베딩 (N,D)."""
    out = []
    for i in range(0, len(imgs), 64):
        batch = np.stack(imgs[i:i + 64]).astype(np.float32) / 255.0
        batch = (batch - mean) / std
        t = torch.from_numpy(batch).permute(0, 3, 1, 2).contiguous().to(DEVICE)
        f = F.normalize(model(t), dim=1)
        out.append(f.cpu().numpy())
    return np.concatenate(out)


def build_split(src_dir):
    """-> (query [(pid, path)], gallery [(pid, path)])."""
    per_id = defaultdict(list)
    for f in sorted(Path(src_dir).glob("*.jpg")):
        per_id[f.stem.rsplit("_", 1)[0]].append(f)
    query, gallery = [], []
    for pid, files in per_id.items():
        files = sorted(files, key=lambda p: int(p.stem.rsplit("_", 1)[1]))
        if len(files) >= 2:
            gallery.append((pid, files[0]))
            query.append((pid, files[-1]))
        else:
            gallery.append((pid, files[0]))  # 방해꾼
    return query, gallery


def id_sim_matrix(query, gallery, q_emb, g_emb):
    """-> (q_pids, gids, id_sim[Q,G])  개체 유사도 = 그 개체 사진들과의 유사도 max."""
    q_pids = [p for p, _ in query]
    g_pids = np.array([p for p, _ in gallery])
    gids = sorted(set(g_pids))
    gi = {p: i for i, p in enumerate(gids)}
    sim = q_emb @ g_emb.T
    M = np.full((len(q_pids), len(gids)), -1.0, np.float32)
    for j, p in enumerate(g_pids):
        M[:, gi[p]] = np.maximum(M[:, gi[p]], sim[:, j])
    return q_pids, gids, M


def ranks_of(q_pids, gids, id_sim):
    """케이스별 정답 개체 랭크 (1-base)."""
    out = []
    for i, pid in enumerate(q_pids):
        order = np.argsort(-id_sim[i])
        out.append([gids[j] for j in order].index(pid) + 1)
    return np.array(out)


def recall_at(query, gallery, q_emb, g_emb, ks=(1, 5, 10)):
    q_pids, gids, M = id_sim_matrix(query, gallery, q_emb, g_emb)
    rk = ranks_of(q_pids, gids, M)
    return {k: float((rk <= k).mean()) for k in ks}


def dump_complement(out_dir, model_name, a, b, query, cropped, qp, ra, rb, rf, img_size):
    """케이스별 랭크 CSV + 불일치 케이스 그리드(전처리 A|B 나란히) 저장. cropped: mode -> {path: bgr}."""
    import csv as _csv
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    qpath = {p: pth for p, pth in query}

    def cat(x, y):
        return ("both_ok" if x == 1 and y == 1 else f"{a}_only" if x == 1
                else f"{b}_only" if y == 1 else "both_no")

    csv_path = out / f"complement_{model_name}_{a}_vs_{b}.csv"
    with open(csv_path, "w", newline="", encoding="utf-8-sig") as f:
        w = _csv.writer(f)
        w.writerow(["pid", "query_file", f"rank_{a}", f"rank_{b}", "rank_fused", "category"])
        for pid, x, y, z in zip(qp, ra, rb, rf):
            w.writerow([pid, qpath[pid].name, x, y, z, cat(x, y)])
    print(f"  CSV -> {csv_path}")

    disagree = [(pid, x, y) for pid, x, y in zip(qp, ra, rb) if (x == 1) != (y == 1)]
    if not disagree:
        return
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    k = min(len(disagree), 16)
    fig, axes = plt.subplots(k, 2, figsize=(5, 2.4 * k))
    axes = np.atleast_2d(axes)
    for row, (pid, x, y) in zip(axes, disagree[:k]):
        for ax, mode, rk in ((row[0], b, y), (row[1], a, x)):
            ax.imshow(cv2.cvtColor(resize_pad(cropped[mode][qpath[pid]], img_size), cv2.COLOR_BGR2RGB))
            ax.set_title(f"{mode}  rank={rk}", fontsize=9,
                         color="green" if rk == 1 else "red")
            ax.axis("off")
        row[0].set_ylabel(pid, fontsize=7)
    fig.suptitle(f"{model_name}: {a} vs {b} disagreements  (green = rank-1)", fontsize=11)
    fig.tight_layout()
    png = out / f"complement_{model_name}_{a}_vs_{b}.png"
    fig.savefig(png, dpi=110)
    print(f"  그리드 -> {png}")


def run_model(model_name, args, query, gallery, cropped, modes, q_detail=None):
    """한 모델에 대해 임베딩 -> (route | complement | matrix | 기본) 리포트."""
    model, img_size, mean, std = load_model(model_name, args.clipreid_config, args.clipreid_weight)
    print(f"\n{'=' * 64}\nmodel={model_name}  입력 {img_size}px")
    g_emb, q_emb = {}, {}
    for m in modes:
        g_emb[m] = embed(model, [resize_pad(cropped[m][p], img_size) for _, p in gallery], mean, std)
        q_emb[m] = embed(model, [resize_pad(cropped[m][p], img_size) for _, p in query], mean, std)

    if args.route:
        qp, gid, Ma = id_sim_matrix(query, gallery, q_emb["rtdetr"], g_emb["rtdetr"])
        _, _, Mb = id_sim_matrix(query, gallery, q_emb["none"], g_emb["none"])
        ra, rb = ranks_of(qp, gid, Ma), ranks_of(qp, gid, Mb)
        qpath = dict(query)
        feat = {k: np.array([q_detail[qpath[p]][k] for p in qp], float)
                for k in ("conf", "area", "n_animals", "person_area", "aspect")}
        n = len(qp)
        crop_win, orig_win = ra < rb, rb < ra
        y = crop_win.astype(float) - orig_win.astype(float)  # +1 크롭우세, -1 원본우세, 0 무승부

        print(f"[라우팅]  n={n}   ('우세' = 그쪽 랭크가 더 앞섬)")
        for lbl, mask in (("크롭 우세", crop_win), ("원본 우세", orig_win),
                          ("무승부", ~(crop_win | orig_win))):
            if mask.sum():
                print(f"  {lbl:9s} {int(mask.sum()):3d}   conf {feat['conf'][mask].mean():.3f}  "
                      f"면적비 {feat['area'][mask].mean():.3f}  동물수 {feat['n_animals'][mask].mean():.2f}  "
                      f"사람면적 {feat['person_area'][mask].mean():.3f}  종횡비 {feat['aspect'][mask].mean():.2f}")
        print("  corr(피처, 크롭우세):  " + "  ".join(
            f"{k} {np.corrcoef(v, y)[0, 1]:+.3f}" for k, v in feat.items() if v.std() > 0))

        def routed_r1(pick_crop):
            return float((np.where(pick_crop, ra, rb) == 1).mean())

        rf = ranks_of(qp, gid, (Ma + Mb) / 2)
        print(f"  기준선 R@1:  always-crop {float((ra == 1).mean()):.1%} | "
              f"always-orig {float((rb == 1).mean()):.1%} | "
              f"score합산 {float((rf == 1).mean()):.1%} | "
              f"OR상한 {float(((ra == 1) | (rb == 1)).mean()):.1%}")
        best = (None, -1.0)
        for T in np.round(np.arange(0.30, 0.96, 0.05), 2):
            r1 = routed_r1(feat["conf"] >= T)
            if r1 > best[1]:
                best = (T, r1)
        print(f"  탐지conf 라우터   최적 T={best[0]:.2f}  ->  R@1 {best[1]:.1%}")
        na, pa, asp = feat["n_animals"], feat["person_area"], feat["aspect"]
        print(f"  동물수 라우터    >=2 면 크롭  ->  R@1 {routed_r1(na >= 2):.1%}  (해당 {int((na >= 2).sum())}건)")
        for T in (0.10, 0.20, 0.30):
            print(f"  사람 라우터     사람면적>= {T:.2f} 면 크롭  ->  R@1 {routed_r1(pa >= T):.1%}  "
                  f"(해당 {int((pa >= T).sum())}건)")
        for T in (1.5, 2.0, 2.5):
            print(f"  종횡비 라우터   종횡비<= {T} 면 크롭(극단이면 원본)  ->  R@1 {routed_r1(asp <= T):.1%}")
        combo = (na >= 2) | (pa >= 0.20)
        print(f"  조합 라우터     (동물>=2 or 사람면적>=0.20) 면 크롭  ->  R@1 {routed_r1(combo):.1%}  "
              f"(해당 {int(combo.sum())}건)")
        return

    if args.complement:
        a, b = args.complement
        qp, gid, Ma = id_sim_matrix(query, gallery, q_emb[a], g_emb[a])
        _, _, Mb = id_sim_matrix(query, gallery, q_emb[b], g_emb[b])
        ra, rb = ranks_of(qp, gid, Ma), ranks_of(qp, gid, Mb)
        both_ok = int(((ra == 1) & (rb == 1)).sum())
        only_a = int(((ra == 1) & (rb != 1)).sum())
        only_b = int(((ra != 1) & (rb == 1)).sum())
        both_no = int(((ra != 1) & (rb != 1)).sum())
        n = len(qp)
        print(f"[상보성]  {a} vs {b}   (n={n}, model={model_name})")
        print(f"  둘 다 정답(R@1)     {both_ok:3d} ({both_ok / n:.1%})")
        print(f"  {a}만 맞힘          {only_a:3d} ({only_a / n:.1%})")
        print(f"  {b}만 맞힘          {only_b:3d} ({only_b / n:.1%})")
        print(f"  둘 다 틀림          {both_no:3d} ({both_no / n:.1%})")
        rf1 = ranks_of(qp, gid, (Ma + Mb) / 2)
        for k in (1, 5):
            solo_a, solo_b = float((ra <= k).mean()), float((rb <= k).mean())
            orc = float(((ra <= k) | (rb <= k)).mean())
            fused = float((rf1 <= k).mean())
            print(f"  R@{k}: {a} {solo_a:.1%} | {b} {solo_b:.1%} | "
                  f"OR상한 {orc:.1%} | score합산 {fused:.1%}")
        if args.dump_dir:
            dump_complement(args.dump_dir, model_name, a, b, query, cropped, qp, ra, rb, rf1, img_size)
        return

    if args.matrix:
        print(f"{'gallery':10s}{'query':10s} {'R@1':>7s} {'R@5':>7s} {'R@10':>7s}")
        for gm in modes:
            for qm in modes:
                r = recall_at(query, gallery, q_emb[qm], g_emb[gm])
                tag = "  <- 일치" if gm == qm else ""
                print(f"{gm:10s}{qm:10s} {r[1]:7.1%} {r[5]:7.1%} {r[10]:7.1%}{tag}")
    else:
        print(f"{'mode':8s} {'R@1':>7s} {'R@5':>7s} {'R@10':>7s}")
        for m in args.modes:
            r = recall_at(query, gallery, q_emb[m], g_emb[m])
            print(f"{m:8s} {r[1]:7.1%} {r[5]:7.1%} {r[10]:7.1%}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", nargs="+", default=["megadescriptor"],
                    help=f"하나 이상. 'all' = {MODELS}")
    ap.add_argument("--clipreid_config", default=None)
    ap.add_argument("--clipreid_weight", default=None)
    ap.add_argument("--src", default=str(ML_DIR / "dataset" / "raw" / "shelter_raw" / "dog"))
    ap.add_argument("--modes", nargs="+", default=["none", "rtdetr", "tv"],
                    help="gallery/query 를 같은 전처리로 돌릴 목록")
    ap.add_argument("--matrix", action="store_true",
                    help="gallery x query 전처리 조합 매트릭스 (불일치 영향 확인)")
    ap.add_argument("--complement", nargs=2, metavar=("A", "B"), default=None,
                    help="두 전처리(A,B)가 서로 다른 케이스에서 틀리는지 + 합치면 나은지")
    ap.add_argument("--route", action="store_true",
                    help="RT-DETR confidence·박스면적비로 크롭/원본을 케이스마다 고를 수 있는지")
    ap.add_argument("--dump_dir", default=None,
                    help="--complement 결과를 CSV+그리드로 저장할 폴더 (케이스별 확인용)")
    args = ap.parse_args()
    models = MODELS[:] if args.model == ["all"] else args.model

    query, gallery = build_split(args.src)
    n_real = sum(1 for _ in query)
    print(f"개체 {len(set(p for p, _ in gallery))} | query 케이스 {n_real} | "
          f"gallery {len(gallery)} (방해꾼 {len(gallery) - n_real})  device={DEVICE}")

    raw = {p: cv2.imread(str(p)) for _, p in gallery + query}

    modes = set(args.modes)
    if args.matrix or args.route:
        modes |= {"none", "rtdetr"}
    if args.complement:
        modes |= set(args.complement)
    modes = sorted(modes)

    # 크롭(감지)은 모델과 무관 -> 모드별로 딱 한 번만 (모델 여러 개일 때 재사용)
    cropped = {}
    for m in modes:
        cropper = make_cropper(m)
        cropped[m] = {p: cropper(im) for p, im in raw.items()}

    q_detail = None
    if args.route:
        rt = RtDetrDet()
        q_detail = {p: rtdetr_pick_detail(rt, raw[p]) for _, p in query}

    for model_name in models:
        run_model(model_name, args, query, gallery, cropped, modes, q_detail)


if __name__ == "__main__":
    main()
