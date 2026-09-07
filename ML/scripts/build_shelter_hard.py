"""
실제 보호소 데이터(processed_animals)로 케이스단위 하드 eval 세트를 만든다.

MPDD_hard_corrupt 는 공개 연구용 데이터(MPDD)를 실전처럼 열화시킨 "시뮬레이션"이었는데,
이건 진짜 유기동물 API 사진(dataset/raw/processed_animals/<desertionNo>/N.jpg)으로 직접 만든다.

- processed_animals 는 세션 메타데이터가 없어서(파일명이 그냥 1.jpg, 2.jpg...) MPDD처럼
  cross-session 분리는 못 함. 대신 개체당 사진을 인덱스 순으로 반으로 갈라
  앞쪽 절반 -> gallery(등록사진), 뒤쪽 절반 -> query(신고사진) 로 취급.
- 별도 방해꾼 주입 없음 — gallery 자체가 이미 진짜 개체 344마리라 자연스러운 방해꾼 풀임
  (MPDD_hard 때 YT-BB 프레임을 방해꾼으로 넣었던 것과 달리, 여기선 다 진짜 정답 후보).
- 주의: 종(species) 라벨이 소실돼서 개/고양이가 섞여 있음 (dataset_manifest.csv 없음, README 참고).
- 파일명은 기존 eval_case_level_*.py 가 그대로 재사용되도록 Market1501 형식(<pid>_c1s1_<idx>.jpg)
  으로 맞춤. cam/seq 값은 케이스단위 스코어링 로직에서 안 쓰여서 더미(c1s1)로 고정해도 무방.
"""
import os
import shutil
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent.parent  # ML/  (이 파일은 ML/scripts/ 안에 있음)
SRC_DIR = ML_DIR / "dataset" / "raw" / "processed_animals"
DST_DIR = ML_DIR / "dataset" / "derived" / "shelter_hard"


def link_or_copy(src_path, dst_path):
    if dst_path.exists():
        return
    try:
        os.link(src_path, dst_path)
    except OSError:
        shutil.copy2(src_path, dst_path)


def main():
    (DST_DIR / "query").mkdir(parents=True, exist_ok=True)
    (DST_DIR / "gallery").mkdir(parents=True, exist_ok=True)

    animal_dirs = sorted(p for p in SRC_DIR.iterdir() if p.is_dir())
    skipped, kept = 0, 0
    n_query, n_gallery = 0, 0

    for animal_dir in animal_dirs:
        desertion_no = animal_dir.name
        if not desertion_no.isdigit():
            continue
        photos = sorted(animal_dir.glob("*.jpg"), key=lambda p: int(p.stem))
        if len(photos) < 2:
            skipped += 1
            continue
        kept += 1

        n_query_photos = max(1, len(photos) // 2)
        gallery_photos = photos[:-n_query_photos]
        query_photos = photos[-n_query_photos:]

        for photo in gallery_photos:
            link_or_copy(photo, DST_DIR / "gallery" / f"{desertion_no}_c1s1_{photo.stem}.jpg")
            n_gallery += 1
        for photo in query_photos:
            link_or_copy(photo, DST_DIR / "query" / f"{desertion_no}_c1s1_{photo.stem}.jpg")
            n_query += 1

    print(f"개체 {kept}마리 사용 (사진 1장뿐이라 제외 {skipped}마리)")
    print(f"gallery {n_gallery}장 | query {n_query}장 -> {DST_DIR}")


if __name__ == "__main__":
    main()
