"""
유기동물 API 히스토리 수집 -> re-ID 파인튜닝용 데이터셋.

- 어디서 실행하든 무관 (경로는 이 파일 위치 기준 ML/ 로 고정):  python scripts/collect_dataset.py
- 반복 실행 가능: desertionNo 폴더가 이미 있으면 건너뜀 (재개 가능)
- 결과: dataset/raw/processed_animals/<desertionNo>/N.jpg  +  dataset/raw/dataset_manifest.csv
- 필요: ML/.env (SERVICE_KEY, BASE_URL),  checkpoints/yolo11n.pt
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
import torch
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from torchvision.models.detection import (
    FasterRCNN_ResNet50_FPN_V2_Weights,
    fasterrcnn_resnet50_fpn_v2,
)
from tqdm import tqdm
from urllib3.util.retry import Retry

ML_DIR = Path(__file__).resolve().parent.parent  # ML/  (이 파일은 ML/scripts/ 안에 있음)
load_dotenv(ML_DIR / ".env")

# ── 설정 (여기만 만지면 됨) ───────────────────────────────
SERVICE_KEY = os.environ.get("SERVICE_KEY") or os.environ["APIS_KEY"]   # data.go.kr 일반 인증키 (URL 인코딩된 문자열)
BASE_URL    = os.environ.get("BASE_URL") or os.environ["APIS_URL"]      # .../abandonmentPublicService_v2/abandonmentPublic_v2
START_YM    = (2024, 9)                                   # 수집 시작 (년, 월) — 넓히면 데이터 늘어남
END_YM      = (date.today().year, date.today().month)
NUM_ROWS    = 1000
SPECIES_OK  = {"개", "고양이"}                             # 개만 하려면 {"개"}
OUT_DIR     = ML_DIR / "dataset" / "raw" / "processed_animals"
MANIFEST    = ML_DIR / "dataset" / "raw" / "dataset_manifest.csv"
TARGET_SIZE = (224, 224)
# ─────────────────────────────────────────────────────────

POPFILES = [f"popfile{i}" for i in range(1, 9)]
ANIMAL_CLASSES = {"bird", "cat", "dog", "horse", "sheep",
                  "cow", "elephant", "bear", "zebra", "giraffe"}

OUT_DIR.mkdir(parents=True, exist_ok=True)

# 탐지기: torchvision (BSD-3). ultralytics YOLO(AGPL-3.0) 대체.
#   가볍게 쓰려면 fasterrcnn 대신 ssdlite320_mobilenet_v3_large / fcos_resnet50_fpn.
#   가중치는 최초 1회 torch hub 캐시로 자동 다운로드됨.
DET_DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
_DET_WEIGHTS = FasterRCNN_ResNet50_FPN_V2_Weights.DEFAULT
_det_model = fasterrcnn_resnet50_fpn_v2(weights=_DET_WEIGHTS, box_score_thresh=0.5)
_det_model.eval().to(DET_DEVICE)
_det_preprocess = _DET_WEIGHTS.transforms()      # ObjectDetection(): uint8 CxHxW -> float[0,1], 리사이즈는 모델 내부에서
_COCO_CATEGORIES = _DET_WEIGHTS.meta["categories"]  # label(int) -> 클래스명, 예: 18 -> "dog"

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


@torch.no_grad()
def _detect_animals(img_bgr):
    """img_bgr: HxWx3 uint8 (cv2 BGR). -> [(x1, y1, x2, y2, score), ...] (동물 클래스만)."""
    rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)
    t = torch.from_numpy(rgb).permute(2, 0, 1).contiguous()  # uint8 CxHxW
    out = _det_model([_det_preprocess(t).to(DET_DEVICE)])[0]
    dets = []
    for box, label, score in zip(out["boxes"], out["labels"], out["scores"]):
        if _COCO_CATEGORIES[int(label)] in ANIMAL_CLASSES:
            x1, y1, x2, y2 = box.tolist()
            dets.append((x1, y1, x2, y2, float(score)))
    return dets


def crop(img):
    dets = _detect_animals(img)
    if not dets:
        return None
    x1, y1, x2, y2, _ = max(dets, key=lambda d: (d[2] - d[0]) * (d[3] - d[1]))  # 면적 최대 박스
    h, w = img.shape[:2]
    x1, y1 = max(0, int(x1)), max(0, int(y1))
    x2, y2 = min(w, int(x2)), min(h, int(y2))
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
