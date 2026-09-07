"""
MPDD query/gallery 를 cross-session 으로 다시 나눠 하드 eval 세트를 만든다.

- pid 마다 촬영 세션(seq)이 2개 이상인 것만 사용: 마지막 세션은 query, 나머지 세션은 gallery.
  (같은 세션끼리는 배경/목줄이 같아서 생기는 "쉬운 매칭" 지름길을 없앰)
- train 은 원본 그대로 사용 (체크포인트의 classifier 크기를 유지하기 위해 건드리지 않음).
- YT-BB-Dog 방해꾼(build_ytbb_distractors.py)은 이 스크립트 전후 아무 때나 실행해도 무관 —
  파일명 pid 대역이 겹치지 않게 분리돼 있음(원본 MPDD pid vs 950000+).
"""
import os
import re
import shutil
from pathlib import Path

ML_DIR  = Path(__file__).resolve().parent.parent  # ML/  (이 파일은 ML/scripts/ 안에 있음)
SRC_PT  = ML_DIR / "dataset" / "raw" / "mpdd_release" / "MPDD" / "pytorch"
HARD_PT = ML_DIR / "dataset" / "derived" / "MPDD_hard" / "MPDD" / "pytorch"

# 파일명 규칙: <pid>_c<cam>s<seq>_<idx>.jpg  (예: 100_c1s6_1.jpg)
# pid = 개체(dog) ID, cam = 포즈 번호(1~6), seq = 촬영 세션 번호, idx = 그 조합 내 사진 순번
fn_re = re.compile(r"(\d+)_c(\d+)s(\d+)_(\d+)\.jpg$", re.I)

def parse(p):
    m = fn_re.search(p.name)
    return tuple(map(int, m.groups())) if m else None


def link_or_copy(src, dst):
    if dst.exists():
        return
    try:
        os.link(src, dst)
    except OSError:
        shutil.copy2(src, dst)


def main():
    pool = {}
    for sub in ("query", "gallery"):
        for p in (SRC_PT / sub).glob("*.jpg"):
            r = parse(p)
            if r:
                pid, cam, seq, idx = r
                if pid not in pool:
                    pool[pid] = []

                pool[pid].append((cam, seq, idx, p))

    q_items, g_items, kept = [], [], 0
    for pid, lst in pool.items():
        seqs = sorted({seq for _, seq, _, _ in lst})
        if len(seqs) < 2:
            continue
        kept += 1
        q_seq = seqs[-1]
        for cam, seq, idx, p in lst:
            (q_items if seq == q_seq else g_items).append((pid, cam, seq, idx, p))

    for d in ("train", "query", "gallery"):
        (HARD_PT / d).mkdir(parents=True, exist_ok=True)

    for p in (SRC_PT / "train").glob("*.jpg"):
        link_or_copy(p, HARD_PT / "train" / p.name)

    for pid, cam, seq, idx, p in q_items:
        link_or_copy(p, HARD_PT / "query" / f"{pid}_c{cam}s{seq}_{idx}.jpg")
    for pid, cam, seq, idx, p in g_items:
        link_or_copy(p, HARD_PT / "gallery" / f"{pid}_c{cam}s{seq}_{idx}.jpg")

    n_g = len(list((HARD_PT / "gallery").glob("*.jpg")))
    n_q = len(list((HARD_PT / "query").glob("*.jpg")))
    n_t = len(list((HARD_PT / "train").glob("*.jpg")))
    print(f"cross-session pid {kept}개 | query {len(q_items)}장 | gallery(정답) {len(g_items)}장")
    print(f"train {n_t} | query {n_q} | gallery 총합(정답+방해꾼) {n_g}")


if __name__ == "__main__":
    main()
