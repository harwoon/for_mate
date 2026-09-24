"""
카글 고양이 데이터셋(neko-jirushi 스크래핑) -> Re-ID 학습용 Market1501 레이아웃.

입력:  dataset/raw/cat_dataset/cat_<id>/image_NNN.jpg | .png | info.json
정리:  - .png 는 전부 광고 배너 -> 버림
       - .jpg 라도 해시가 --dup_folders 개 이상 폴더에 걸치면 사이트 boilerplate -> 버림
       - 폴더 내 완전 중복(같은 해시)도 1장만
       - 남은 사진 수 >= --min_photos 인 개체만 사용
출력:  dataset/derived/cat_reid/pytorch/{train,query,gallery}/<pid>_c1s1_<idx>.jpg
       + manifest.csv (pid, cat_folder, split, n_photos)

cam/seq 는 촬영 메타가 없어 더미(c1s1). pid 는 개체 정렬 순서로 0..K-1 재부여.
분리: 개체를 train / test 로 나누고(--test_frac), test 개체는 사진을 query / gallery 로 반 나눔.

  python scripts/build_cat_pytorch.py
  python scripts/build_cat_pytorch.py --min_photos 3 --test_frac 0.3 --dup_folders 3
"""
import argparse
import csv
import hashlib
import random
import shutil
from collections import defaultdict
from pathlib import Path

from PIL import Image

ML_DIR = Path(__file__).resolve().parent.parent


def md5(path):
    return hashlib.md5(path.read_bytes()).hexdigest()


def readable(path):
    try:
        Image.open(path).verify()
        return True
    except Exception:
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=str(ML_DIR / "dataset" / "raw" / "cat_dataset"))
    ap.add_argument("--out", default=str(ML_DIR / "dataset" / "derived" / "cat_reid" / "pytorch"))
    ap.add_argument("--dup_folders", type=int, default=3,
                    help="이 개수 이상 폴더에 나타나는 이미지는 boilerplate 로 보고 버림")
    ap.add_argument("--merge_shared", type=int, default=1,
                    help="사진을 이 장수 이상 공유하는 두 폴더는 같은 고양이(중복 등록)로 보고 병합. 0=안 함")
    ap.add_argument("--min_photos", type=int, default=2)
    ap.add_argument("--test_frac", type=float, default=0.3, help="평가용으로 뺄 개체 비율")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    src = Path(args.src)
    cat_dirs = sorted(d for d in src.iterdir() if d.is_dir() and d.name.startswith("cat_"))
    print(f"개체 폴더 {len(cat_dirs)}개")

    # 1) jpg 만 훑어 해시 -> {폴더} 집계
    hash_folders = defaultdict(set)
    folder_files = {}
    n_png = n_unreadable = 0
    for d in cat_dirs:
        keep = []
        for f in sorted(d.glob("*")):
            if f.suffix.lower() == ".png":
                n_png += 1
                continue
            if f.suffix.lower() not in (".jpg", ".jpeg"):
                continue
            if not readable(f):
                n_unreadable += 1
                continue
            h = md5(f)
            hash_folders[h].add(d.name)
            keep.append((h, f))
        folder_files[d.name] = keep

    boiler = {h for h, folders in hash_folders.items() if len(folders) >= args.dup_folders}
    print(f".png 광고 {n_png}장 제외 | 읽기 실패 {n_unreadable}장 | "
          f"boilerplate 해시 {len(boiler)}종 ({args.dup_folders}+ 폴더 공유) 제외")

    # 2) 폴더별 유효 사진(boilerplate·폴더내중복 제거) + 해시집합
    folder_uniq, folder_hs = {}, {}
    for name, keep in folder_files.items():
        seen, uniq = set(), []
        for h, f in keep:
            if h in boiler or h in seen:
                continue
            seen.add(h)
            uniq.append((h, f))
        folder_uniq[name] = uniq
        folder_hs[name] = seen

    # 3) 사진을 공유하는 폴더 = 같은 고양이 중복 등록 -> union-find 병합
    parent = {name: name for name in folder_uniq}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    n_merge = 0
    if args.merge_shared:
        names_l = sorted(folder_uniq)
        by_hash = defaultdict(list)
        for name in names_l:
            for h in folder_hs[name]:
                by_hash[h].append(name)
        pair_shared = defaultdict(int)
        for h, fs in by_hash.items():
            for i in range(len(fs)):
                for j in range(i + 1, len(fs)):
                    pair_shared[tuple(sorted((fs[i], fs[j])))] += 1
        for (a, b), c in pair_shared.items():
            if c >= args.merge_shared and find(a) != find(b):
                parent[find(a)] = find(b)
                n_merge += 1

    groups = defaultdict(list)
    for name in folder_uniq:
        groups[find(name)].append(name)
    print(f"중복 등록 병합: {n_merge}쌍 -> 폴더 {len(folder_uniq)}개가 개체 {len(groups)}개로")

    # 4) 개체(병합 그룹)별 사진 합치고 min_photos 필터
    per_id = {}
    for root, members in groups.items():
        seen, imgs = set(), []
        for name in sorted(members):
            for h, f in folder_uniq[name]:
                if h not in seen:
                    seen.add(h)
                    imgs.append(f)
        if len(imgs) >= args.min_photos:
            per_id[root] = (sorted(members), imgs)
    dropped = len(groups) - len(per_id)
    print(f"사진 {args.min_photos}장 미만이라 제외된 개체 {dropped}개 -> 사용 개체 {len(per_id)}개")
    dist = defaultdict(int)
    for _, v in per_id.values():
        dist[len(v)] += 1
    print("  개체당 사진 수:", dict(sorted(dist.items())))

    # 5) train / test 개체 분리
    names = sorted(per_id)
    random.Random(args.seed).shuffle(names)
    n_test = int(len(names) * args.test_frac)
    test_names, train_names = set(names[:n_test]), set(names[n_test:])
    pid_of = {name: i for i, name in enumerate(sorted(per_id))}

    out = Path(args.out)
    for sub in ("train", "query", "gallery"):
        (out / sub).mkdir(parents=True, exist_ok=True)

    rows = []
    n = defaultdict(int)
    for name in sorted(per_id):
        pid, (members, photos) = pid_of[name], per_id[name]
        folder_tag = "+".join(members)
        if name in train_names:
            for i, f in enumerate(photos, 1):
                shutil.copy2(f, out / "train" / f"{pid}_c1s1_{i}.jpg")
            n["train"] += len(photos)
            rows.append(dict(pid=pid, cat_folder=folder_tag, split="train", n_photos=len(photos)))
        else:
            # gallery=c1 / query=c2 로 카메라를 나눠야 Market1501 평가의
            # "같은 카메라 junk 제외" 가 정답 gallery 를 지우지 않음
            n_q = max(1, len(photos) // 2)
            for i, f in enumerate(photos[:-n_q], 1):
                shutil.copy2(f, out / "gallery" / f"{pid}_c1s1_{i}.jpg")
            for i, f in enumerate(photos[-n_q:], 1):
                shutil.copy2(f, out / "query" / f"{pid}_c2s1_{i}.jpg")
            n["gallery"] += len(photos) - n_q
            n["query"] += n_q
            rows.append(dict(pid=pid, cat_folder=folder_tag, split="test", n_photos=len(photos)))

    with open(out.parent / "manifest.csv", "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=["pid", "cat_folder", "split", "n_photos"])
        w.writeheader()
        w.writerows(rows)

    print(f"\ntrain 개체 {len(train_names)} / test 개체 {len(test_names)}")
    print(f"train {n['train']}장 | query {n['query']}장 | gallery {n['gallery']}장")
    print(f"-> {out}")
    print(f"manifest -> {out.parent / 'manifest.csv'}")


if __name__ == "__main__":
    main()
