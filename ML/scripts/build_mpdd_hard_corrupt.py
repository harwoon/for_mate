"""
MPDD_hard 의 query 에만 폰카메라스러운 열화(랜덤크롭+저해상도 왕복+JPEG 압축)를 입혀
MPDD_hard_corrupt 로 새로 저장한다.

MPDD_hard 안의 파일들은 원본(Multi-pose dog dataset, YT-BB-Dog)과 하드링크로 연결돼
있으므로 그 자리에서 덮어쓰면 원본까지 같이 망가진다. 그래서 항상 "새 목적지 파일"에만
쓰고, 기존 경로는 읽기 전용으로만 연다.
"""
import hashlib
import io
import os
import random
import shutil
from pathlib import Path

from PIL import Image

ML_DIR = Path(__file__).resolve().parent.parent  # ML/  (이 파일은 ML/scripts/ 안에 있음)
SRC_PT = ML_DIR / "dataset" / "derived" / "MPDD_hard" / "MPDD" / "pytorch"
DST_PT = ML_DIR / "dataset" / "derived" / "MPDD_hard_corrupt" / "MPDD" / "pytorch"


def link_or_copy(src_path, dst_path):
    if dst_path.exists():
        return
    try:
        os.link(src_path, dst_path)
    except OSError:
        shutil.copy2(src_path, dst_path)


def corrupt(src_path, dst_path):
    img = Image.open(src_path).convert("RGB")
    width, height = img.size
    # 파일명 기반 고정 시드 -> 같은 파일은 재실행해도 항상 같은 방식으로 열화됨(재현 가능)
    seeded_random = random.Random(int(hashlib.md5(src_path.name.encode()).hexdigest(), 16))

    crop_w = max(1, int(width * seeded_random.uniform(0.7, 0.9)))
    crop_h = max(1, int(height * seeded_random.uniform(0.7, 0.9)))
    crop_x = seeded_random.randint(0, width - crop_w)
    crop_y = seeded_random.randint(0, height - crop_h)
    img = img.crop((crop_x, crop_y, crop_x + crop_w, crop_y + crop_h))

    low_res = seeded_random.choice([64, 80, 96])
    img = img.resize((low_res, low_res), Image.BILINEAR).resize((crop_w, crop_h), Image.BILINEAR)

    jpeg_buffer = io.BytesIO()
    img.save(jpeg_buffer, "JPEG", quality=seeded_random.choice([35, 45, 55]))
    jpeg_buffer.seek(0)
    Image.open(jpeg_buffer).convert("RGB").save(dst_path, "JPEG", quality=95)


def main():
    for split in ("train", "query", "gallery"):
        (DST_PT / split).mkdir(parents=True, exist_ok=True)

    # train / gallery 는 그대로 재사용 (열화 대상은 query 뿐)
    for img_path in (SRC_PT / "train").glob("*.jpg"):
        link_or_copy(img_path, DST_PT / "train" / img_path.name)
    for img_path in (SRC_PT / "gallery").glob("*.jpg"):
        link_or_copy(img_path, DST_PT / "gallery" / img_path.name)

    # query 는 새 파일로 열화본을 만든다 (원본/MPDD_hard 는 읽기만 함)
    query_count = 0
    for img_path in (SRC_PT / "query").glob("*.jpg"):
        dst_path = DST_PT / "query" / img_path.name
        if not dst_path.exists():
            corrupt(img_path, dst_path)
        query_count += 1

    print(f"train {len(list((DST_PT/'train').glob('*.jpg')))} | "
          f"query(열화) {query_count} | gallery {len(list((DST_PT/'gallery').glob('*.jpg')))}")


if __name__ == "__main__":
    main()
