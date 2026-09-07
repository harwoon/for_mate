"""
YT-BB-Dog 클립 폴더(같은 영상 연속 프레임)에서 폴더당 가장 선명한 프레임 1장만 뽑아
MPDD_hard/MPDD/pytorch/gallery/ 에 Market1501 파일명(<fake_pid>_c1s1_1.jpg)으로 추가.

이 파일명 규칙은 CLIP-ReID / MegaDescriptor(market_meta) / PetFace(같은 market_meta) 세 평가
코드가 전부 동일하게 파싱하므로, 여기서 만든 gallery 를 셋 다 그대로 재사용 가능.
"""
import shutil
from pathlib import Path

import numpy as np
import pandas as pd
from PIL import Image

ML_DIR    = Path(__file__).resolve().parent.parent   # ML/  (이 파일은 ML/scripts/ 안에 있음)
YTBB_ROOT = ML_DIR / "dataset" / "raw" / "YT-BB-Dog" / "YT-BB-Dog"
HARD_PT   = ML_DIR / "dataset" / "derived" / "MPDD_hard" / "MPDD" / "pytorch"
PID_START = 950000   # 지난번 Stanford Dogs 방해꾼(900000~902999)과 안 겹치게

def sharpness(path):
    im = np.asarray(Image.open(path).convert("L"), dtype=np.float32)
    gy, gx = np.gradient(im)
    return float((gx ** 2 + gy ** 2).mean())

def main():
    folders = [d for split in ("train", "test") for d in (YTBB_ROOT / split).glob("*") if d.is_dir()]
    print(f"클립 폴더 {len(folders)}개")

    gallery_dir = HARD_PT / "gallery"
    gallery_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    for i, folder in enumerate(folders):
        imgs = list(folder.glob("*.jpg"))
        if not imgs:
            continue
        best = max(imgs, key=sharpness)
        fake_pid = PID_START + i
        dst = gallery_dir / f"{fake_pid}_c1s1_1.jpg"
        if not dst.exists():
            shutil.copy2(best, dst)
        rows.append(dict(pseudo_id=fake_pid, src=str(best), n_frames_in_clip=len(imgs)))

    manifest = HARD_PT.parent.parent / "ytbb_distractor_manifest.csv"
    pd.DataFrame(rows).to_csv(manifest, index=False, encoding="utf-8-sig")
    print(f"방해꾼 {len(rows)}장 -> {gallery_dir}")
    print(f"manifest -> {manifest}")

if __name__ == "__main__":
    main()
