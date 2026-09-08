"""
유기동물 API 에서 종별로 목표 개체 수만큼 모은다 (collect_dataset.py 의 "목표량" 버전).

- 최신 달부터 거꾸로 내려가며 개 / 고양이 각각 --per_species 개체가 모이면 멈춘다.
- **원본 이미지 그대로 저장(크롭 안 함).** 탐지기 IoU 평가용 정답 박스를 그리려면, 또 실제
  서비스처럼 "멀리서 찍은 사진"을 유지하려면 원본이 필요. --crop 을 주면 torchvision 으로
  잘라서 저장(예전 collect_dataset.py 방식).
- 저장 경로는 processed_animals 와 분리하고 **종별 폴더로 나눔**. 개체별 하위폴더 없이
  한 폴더에 쭉 (파일명에 유기번호가 들어가 개체 구분):
      dataset/raw/<out_name>/<dog|cat>/<유기번호>_<사진순번>.jpg
- 사진 장수 하한 없음(기본 --min_photos 1). 필요하면 올리면 됨.
- 종 라벨은 API upKindNm(개/고양이) 기준 -> 부정확할 수 있으니 수집 후 육안 재검토 권장.

  python scripts/collect_shelter_balanced.py --per_species 500
  python scripts/collect_shelter_balanced.py --per_species 500 --crop --min_photos 3
  python scripts/collect_shelter_balanced.py --per_species 500 --start 2014-01
"""
import argparse
import calendar
import hashlib
import time
from collections import Counter
from datetime import date
from pathlib import Path

import cv2
from tqdm import tqdm

import collect_dataset as cd  # SERVICE_KEY / BASE_URL / 탐지기 / fetch / download / crop 재사용

KMAP = {"개": "dog", "고양이": "cat"}
MANIFEST = cd.ML_DIR / "dataset" / "raw" / "dataset_manifest_balanced.csv"


def months_desc(start_ym, end_ym):
    """end_ym 부터 start_ym 까지 (년,월) 역순으로 (bgnde, endde) 문자열 yield."""
    y, m = end_ym
    while (y, m) >= start_ym:
        yield f"{y}{m:02d}01", f"{y}{m:02d}{calendar.monthrange(y, m)[1]}"
        y, m = (y - 1, 12) if m == 1 else (y, m - 1)


def seed_counts(out_root, min_photos):
    """이미 out_root/<종>/ 에 있는 개체(파일명 <유기번호>_<n>.jpg)를 세어 시작 카운트 + 처리한 번호 집합."""
    counts, done = Counter(), set()
    for sp in ("dog", "cat"):
        sp_dir = out_root / sp
        if not sp_dir.exists():
            continue
        per_id = Counter()
        for f in sp_dir.glob("*.jpg"):
            per_id[f.stem.rsplit("_", 1)[0]] += 1
        for no, c in per_id.items():
            done.add(no)
            if c >= min_photos:
                counts[sp] += 1
    return counts, done


def collect_one(row, sp, min_photos, out_root, do_crop):
    """이미지 min_photos 장 이상 확보 시 out_root/<종>/<유기번호>_<n>.jpg 로 저장하고 장수 반환, 아니면 None."""
    urls = cd.image_urls(row)
    if not urls:
        return None
    imgs, hashes = [], set()
    for u in urls:
        im = cd.download(u)
        if im is None:
            continue
        if do_crop:
            im = cd.crop(im)          # torchvision 탐지 -> 정사각 224. 실패 시 None
            if im is None:
                continue
        h = hashlib.md5(im.tobytes()).hexdigest()   # 동일 프레임 중복 제거
        if h in hashes:
            continue
        hashes.add(h)
        imgs.append(im)
    if len(imgs) < min_photos:
        return None
    no = str(row["desertionNo"]).strip()
    d = out_root / sp
    d.mkdir(parents=True, exist_ok=True)
    for i, im in enumerate(imgs, 1):
        cv2.imwrite(str(d / f"{no}_{i}.jpg"), im)
    return len(imgs)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--per_species", type=int, default=500)
    ap.add_argument("--min_photos", type=int, default=1, help="개체당 최소 사진 수 (기본 1 = 하한 없음)")
    ap.add_argument("--start", default="2010-01", help="YYYY-MM, 이 달까지 거슬러 내려감")
    ap.add_argument("--crop", action="store_true",
                    help="주면 torchvision 으로 잘라서 저장(예전 방식). 기본은 원본 그대로")
    ap.add_argument("--out_name", default="shelter_raw", help="dataset/raw/ 아래 저장 폴더명")
    args = ap.parse_args()

    out_root = cd.ML_DIR / "dataset" / "raw" / args.out_name
    sy, sm = map(int, args.start.split("-"))
    start_ym, end_ym = (sy, sm), (date.today().year, date.today().month)
    target = args.per_species

    counts, done = seed_counts(out_root, args.min_photos)
    print(f"[{'크롭' if args.crop else '원본'}] -> {out_root}/<dog|cat>/<유기번호>_<n>.jpg")
    print(f"기존 보유 {dict(counts)} | 목표 종별 {target} | 사진 {args.min_photos}장+")

    new_rows = []
    for bgnde, endde in months_desc(start_ym, end_ym):
        if counts["dog"] >= target and counts["cat"] >= target:
            break
        page, seen = 1, 0
        pbar = tqdm(desc=bgnde[:6], unit="ind", leave=False)
        while True:
            items, total = cd.fetch(bgnde, endde, page)
            if not items:
                break
            for row in items:
                if counts["dog"] >= target and counts["cat"] >= target:
                    break
                no = str(row.get("desertionNo", "")).strip()
                sp = KMAP.get(row.get("upKindNm"))
                if not no.isdigit() or sp is None or counts[sp] >= target or no in done:
                    continue
                done.add(no)
                n_saved = collect_one(row, sp, args.min_photos, out_root, args.crop)
                if not n_saved:
                    continue
                counts[sp] += 1
                new_rows.append(dict(
                    desertion_no=no, species=sp, breed=row.get("kindNm"),
                    org_nm=row.get("orgNm"), care_nm=row.get("careNm"),
                    happen_dt=row.get("happenDt"), n_saved=n_saved,
                    window=bgnde[:6], collected_at=date.today().isoformat()))
                pbar.update(1)
                pbar.set_postfix(dog=counts["dog"], cat=counts["cat"])
            seen += len(items)
            if seen >= total:
                break
            page += 1
            time.sleep(0.2)
        pbar.close()
        print(f"  {bgnde[:6]} 후: dog {counts['dog']} / cat {counts['cat']}")

    if new_rows:
        import pandas as pd
        df = pd.DataFrame(new_rows)
        if MANIFEST.exists():
            df = pd.concat([pd.read_csv(MANIFEST, dtype=str), df], ignore_index=True)
            df = df.drop_duplicates("desertion_no", keep="first")
        df.to_csv(MANIFEST, index=False, encoding="utf-8-sig")

    print(f"\n신규 {len(new_rows)}개체 | 최종 dog {counts['dog']} / cat {counts['cat']}")
    print(f"manifest -> {MANIFEST}")
    print("주의: API 종 라벨은 오류가 있을 수 있음 -> 육안 재검토 권장")


if __name__ == "__main__":
    main()
