"""
유기동물 API 히스토리 수집 -> re-ID 파인튜닝용 데이터셋.

- ML/ 에서 실행:  python collect_dataset.py
- 반복 실행 가능: desertionNo 폴더가 이미 있으면 건너뜀 (재개 가능)
- 결과: processed_animals/<desertionNo>/N.jpg  +  dataset_manifest.csv
- 필요: ML/.env (SERVICE_KEY, BASE_URL),  yolo11n.pt
"""
import calendar
import hashlib
import os
import time
from collections import Counter
from datetime import date
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from tqdm import tqdm
from ultralytics import YOLO
from urllib3.util.retry import Retry

load_dotenv()

# ── 설정 (여기만 만지면 됨) ───────────────────────────────
SERVICE_KEY = os.environ.get("SERVICE_KEY") or os.environ["APIS_KEY"]   # data.go.kr 일반 인증키 (URL 인코딩된 문자열)
BASE_URL    = os.environ.get("BASE_URL") or os.environ["APIS_URL"]      # .../abandonmentPublicService_v2/abandonmentPublic_v2
START_YM    = (2024, 9)                                   # 수집 시작 (년, 월) — 넓히면 데이터 늘어남
END_YM      = (date.today().year, date.today().month)
NUM_ROWS    = 1000
SPECIES_OK  = {"개", "고양이"}                             # 개만 하려면 {"개"}
OUT_DIR     = Path("processed_animals")
MANIFEST    = Path("dataset_manifest.csv")
TARGET_SIZE = (224, 224)
# ─────────────────────────────────────────────────────────

POPFILES = [f"popfile{i}" for i in range(1, 9)]
ANIMAL_CLASSES = {"bird", "cat", "dog", "horse", "sheep",
                  "cow", "elephant", "bear", "zebra", "giraffe"}

OUT_DIR.mkdir(exist_ok=True)
model = YOLO("yolo11n.pt")

sess = requests.Session()
sess.mount("https://", HTTPAdapter(max_retries=Retry(
    total=3, backoff_factor=0.5, status_forcelist=[500, 502, 503, 504])))


def month_windows(start, end):
    y, m = start
    while (y, m) <= end:
        first = f"{y}{m:02d}01"
        last = f"{y}{m:02d}{calendar.monthrange(y, m)[1]}"
        yield first, last
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def fetch(bgnde, endde, page):
    url = (f"{BASE_URL}?serviceKey={SERVICE_KEY}"
           f"&bgnde={bgnde}&endde={endde}"
           f"&numOfRows={NUM_ROWS}&pageNo={page}&_type=json")
    r = sess.get(url, timeout=20)
    r.raise_for_status()
    body = r.json()["response"]["body"]
    items = body.get("items") or {}
    item = items.get("item", []) if items else []
    if isinstance(item, dict):
        item = [item]
    return item, int(body.get("totalCount", 0))


def image_urls(row):
    out = []
    for k in POPFILES:
        u = str(row.get(k) or "").strip()
        if u and u not in out:
            out.append(u)
    return out


def download(url):
    try:
        r = sess.get(url, timeout=15)
        r.raise_for_status()
        return cv2.imdecode(np.frombuffer(r.content, np.uint8), cv2.IMREAD_COLOR)
    except Exception:
        return None


def resize_with_padding(img, size=TARGET_SIZE):
    tw, th = size
    h, w = img.shape[:2]
    s = min(tw / w, th / h)
    nw, nh = int(w * s), int(h * s)
    r = cv2.resize(img, (nw, nh), interpolation=cv2.INTER_AREA)
    canvas = np.full((th, tw, 3), 114, np.uint8)
    y0, x0 = (th - nh) // 2, (tw - nw) // 2
    canvas[y0:y0 + nh, x0:x0 + nw] = r
    return canvas


def crop(img):
    best, area = None, 0
    for res in model(img, verbose=False):
        for b in res.boxes:
            if model.names[int(b.cls[0])] not in ANIMAL_CLASSES:
                continue
            x1, y1, x2, y2 = map(int, b.xyxy[0])
            a = (x2 - x1) * (y2 - y1)
            if a > area:
                area, best = a, b
    if best is None:
        return None
    x1, y1, x2, y2 = map(int, best.xyxy[0])
    h, w = img.shape[:2]
    x1, y1, x2, y2 = max(0, x1), max(0, y1), min(w, x2), min(h, y2)
    c = img[y1:y2, x1:x2]
    return resize_with_padding(c) if c.size else None


def main():
    rows = []
    for bgnde, endde in month_windows(START_YM, END_YM):
        page, seen = 1, 0
        pbar = tqdm(desc=f"{bgnde[:6]}", unit="ind")
        while True:
            items, total = fetch(bgnde, endde, page)
            if not items:
                break
            for row in items:
                no = str(row.get("desertionNo", "")).strip()
                sp = row.get("upKindNm")
                if not no.isdigit() or sp not in SPECIES_OK:
                    continue
                d = OUT_DIR / no
                if d.exists():
                    continue
                urls = image_urls(row)
                if not urls:
                    continue

                imgs, hashes = [], set()
                for u in urls:
                    im = download(u)
                    if im is None:
                        continue
                    cr = crop(im)
                    if cr is None:
                        continue
                    h = hashlib.md5(cr.tobytes()).hexdigest()
                    if h in hashes:
                        continue
                    hashes.add(h)
                    imgs.append(cr)
                if not imgs:
                    continue

                d.mkdir(parents=True, exist_ok=True)
                for i, im in enumerate(imgs, 1):
                    cv2.imwrite(str(d / f"{i}.jpg"), im)

                rows.append(dict(
                    desertion_no=no, species=sp, breed=row.get("kindNm"),
                    color_cd=row.get("colorCd"), org_nm=row.get("orgNm"),
                    care_nm=row.get("careNm"), process_state=row.get("processState"),
                    happen_dt=row.get("happenDt"), notice_sdt=row.get("noticeSdt"),
                    notice_edt=row.get("noticeEdt"), n_urls=len(urls),
                    n_saved=len(imgs), window=bgnde[:6],
                    collected_at=date.today().isoformat()))
                pbar.update(1)

            seen += len(items)
            if seen >= total:
                break
            page += 1
            time.sleep(0.2)
        pbar.close()

    if rows:
        df = pd.DataFrame(rows)
        if MANIFEST.exists():
            df = pd.concat([pd.read_csv(MANIFEST, dtype=str), df], ignore_index=True)
            df = df.drop_duplicates("desertion_no", keep="first")
        df.to_csv(MANIFEST, index=False, encoding="utf-8-sig")

    dirs = [p for p in OUT_DIR.iterdir() if p.is_dir()]
    cnt = Counter(len(list(p.glob("*.jpg"))) for p in dirs)
    print(f"\n총 개체 {len(dirs)} / 신규 {len(rows)}")
    for k in sorted(cnt):
        print(f"  {k}장: {cnt[k]}개체")
    print(f"  3장+: {sum(v for k, v in cnt.items() if k >= 3)}개체")


if __name__ == "__main__":
    main()
