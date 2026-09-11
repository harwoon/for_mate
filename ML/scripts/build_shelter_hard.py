"""
실제 보호소 데이터(shelter_raw)로 케이스단위 하드 eval 세트를 만든다. RT-DETR 크롭 통일 + 방해꾼 주입.

입력:  dataset/raw/shelter_raw/<species>/<유기번호>_<n>.jpg   (collect_shelter_balanced.py 원본)
       또는 --src 로 다른 폴더. --extra_distractor_src 로 방해꾼 전용 폴더 추가 가능.

구성:
- 사진 >= --min_photos 개체 -> 정답 후보. 인덱스 순으로 앞쪽 절반 gallery / 뒤쪽 절반 query.
  --n_real 로 정답 개체 수 상한을 두면, 넘는 만큼은 방해꾼으로 강등된다 (정답과 방해꾼은 항상 배타적).
- 나머지(사진 부족 개체 + 강등분) + --extra_distractor_src -> 방해꾼: 개체당 1장(가장 선명), pid 900000+,
  gallery 에만 추가. 정답으로 안 쓰임 -> 답이 겹칠 수 없음.
- 전처리 통일(-15~20%p 규칙): query·정답 gallery·방해꾼 gallery 전부 같은 크롭 파이프라인.
    --crop rtdetr : RT-DETR 로 동물 박스 크롭(실패 시 원본) -> aspect 유지 224 패딩
    --crop none   : 크롭 없이 224 패딩만
- 파일명 Market1501 <pid>_c1s1_<idx>.jpg (eval_case_level_*.py 재사용). cam/seq 는 채점에서 안 씀.

  python scripts/build_shelter_hard.py --species dog --distractors 2000
  python scripts/build_shelter_hard.py --species dog cat --crop none --out_name shelter_hard_nocrop
"""
import argparse
import csv
import random
import shutil
import sys
from collections import defaultdict
from pathlib import Path

import cv2
import numpy as np

ML_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ML_DIR / "scripts"))

DISTRACTOR_PID_BASE = 900000


def resize_pad(img, size=224):
    h, w = img.shape[:2]
    s = size / max(h, w)
    nh, nw = max(1, int(h * s)), max(1, int(w * s))
    r = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
    canvas = np.full((size, size, 3), 114, np.uint8)
    y0, x0 = (size - nh) // 2, (size - nw) // 2
    canvas[y0:y0 + nh, x0:x0 + nw] = r
    return canvas


def sharpness(path):
    im = np.asarray(cv2.imread(str(path), cv2.IMREAD_GRAYSCALE), dtype=np.float32)
    gy, gx = np.gradient(im)
    return float((gx ** 2 + gy ** 2).mean())


def make_cropper(mode):
    if mode == "none":
        return lambda im: im
    from compare_detectors import RtDetrDet
    det = RtDetrDet()

    def crop(im):
        box = det(im, 0.25)
        if box is None:
            return im
        h, w = im.shape[:2]
        x1, y1 = max(0, int(box[0])), max(0, int(box[1]))
        x2, y2 = min(w, int(box[2])), min(h, int(box[3]))
        c = im[y1:y2, x1:x2]
        return c if c.size else im
    return crop


def process(src_path, dst_path, cropper):
    im = cv2.imread(str(src_path))
    if im is None:
        return False
    cv2.imwrite(str(dst_path), resize_pad(cropper(im)))
    return True


def group_by_id(species_dir):
    """<유기번호>_<n>.jpg -> {유기번호: [Path...] (n 순 정렬)}."""
    per = defaultdict(list)
    for f in species_dir.glob("*.jpg"):
        stem = f.stem
        if "_" not in stem:
            continue
        pid, idx = stem.rsplit("_", 1)
        if pid.isdigit() and idx.isdigit():
            per[pid].append((int(idx), f))
    return {k: [p for _, p in sorted(v)] for k, v in per.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(ML_DIR / "dataset" / "raw" / "shelter_raw"))
    ap.add_argument("--species", nargs="+", default=["dog"])
    ap.add_argument("--out_name", default="shelter_hard")
    ap.add_argument("--crop", choices=["rtdetr", "none"], default="rtdetr")
    ap.add_argument("--min_photos", type=int, default=2)
    ap.add_argument("--n_real", type=int, default=None,
                    help="정답 개체 수 상한. 넘는 만큼은 방해꾼으로 강등(사진 1장). 미지정=사진 조건 만족 전부")
    ap.add_argument("--distractors", type=int, default=3000,
                    help="방해꾼 개체 수(개체당 1장). 가용분이 적으면 있는 만큼")
    ap.add_argument("--extra_distractor_src", default=None,
                    help="방해꾼 전용 추가 폴더(같은 <유기번호>_<n>.jpg 형식). 종별 하위폴더 있으면 그걸 씀")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    src = Path(args.src)
    cropper = make_cropper(args.crop)
    print(f"[크롭 = {args.crop}]  전처리 통일: 모든 저장 이미지가 이 파이프라인을 통과")

    for sp in args.species:
        sp_dir = src / sp
        if not sp_dir.is_dir():
            print(f"[건너뜀] {sp_dir} 없음")
            continue
        by_id = group_by_id(sp_dir)
        eligible = sorted(k for k, v in by_id.items() if len(v) >= args.min_photos)
        demoted = []
        if args.n_real is not None and len(eligible) > args.n_real:
            random.Random(args.seed).shuffle(eligible)
            demoted = eligible[args.n_real:]          # 정답 상한 넘는 만큼 -> 방해꾼
            eligible = sorted(eligible[:args.n_real])
        real_ids = sorted(eligible)
        real_set = set(real_ids)
        leftover = [k for k in by_id if k not in real_set]  # 사진 부족 개체 + 강등분 -> 방해꾼 후보

        out = ML_DIR / "dataset" / "derived" / f"{args.out_name}_{sp}s"
        if out.exists():
            shutil.rmtree(out)  # 재실행 시 이전 개체가 안 지워지고 새 결과에 섞이는 걸 방지
            print(f"[정리] 기존 {out} 삭제 후 새로 생성")
        (out / "query").mkdir(parents=True, exist_ok=True)
        (out / "gallery").mkdir(parents=True, exist_ok=True)

        n_q = n_g = 0
        rows = []
        for k in real_ids:
            photos = by_id[k]
            nq = max(1, len(photos) // 2)
            for p in photos[:-nq]:
                if process(p, out / "gallery" / f"{k}_c1s1_{p.stem.rsplit('_', 1)[1]}.jpg", cropper):
                    n_g += 1
            for p in photos[-nq:]:
                if process(p, out / "query" / f"{k}_c1s1_{p.stem.rsplit('_', 1)[1]}.jpg", cropper):
                    n_q += 1
            rows.append(dict(pid=k, role="real", n_photos=len(photos)))

        # --- 방해꾼 풀 수집 (유기번호 기준 중복 제거, 개체당 가장 선명한 1장) ---
        seen = set(real_ids)
        dpool = []
        for k in leftover:
            if k in seen:
                continue
            seen.add(k)
            v = by_id[k]
            dpool.append((k, v[0] if len(v) == 1 else max(v, key=sharpness)))
        if args.extra_distractor_src:
            ext = Path(args.extra_distractor_src)
            ext = ext / sp if (ext / sp).is_dir() else ext
            if ext.is_dir():
                for k, v in group_by_id(ext).items():
                    if k not in seen:
                        seen.add(k)
                        dpool.append((k, max(v, key=sharpness)))
        random.Random(args.seed).shuffle(dpool)
        dpool = dpool[: args.distractors]

        n_d = 0
        for i, (k, p) in enumerate(dpool):
            dpid = DISTRACTOR_PID_BASE + i
            if process(p, out / "gallery" / f"{dpid}_c1s1_1.jpg", cropper):
                n_d += 1
                rows.append(dict(pid=dpid, role="distractor", n_photos=1))

        with open(out / "manifest.csv", "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=["pid", "role", "n_photos"])
            w.writeheader()
            w.writerows(rows)

        want = args.distractors
        note = "" if n_d >= want else f"  (요청 {want}, 가용분만)"
        print(f"[{sp}] 정답개체 {len(real_ids)} | query {n_q} | gallery 정답 {n_g} + 방해꾼 {n_d}{note}")
        print(f"      -> {out}")


if __name__ == "__main__":
    main()
