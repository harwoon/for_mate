"""
법정동코드 전체자료 -> regions.json (시도 -> [시군구]) 드롭다운용.

- 입력: 행정표준코드관리시스템 "법정동코드 전체자료.txt" (탭 구분, cp949)
        기본 경로는 아래 SRC. 인자로 넘기면 그 경로 사용:
            python build_regions.py "C:\\path\\to\\법정동코드 전체자료.txt"
- 출력: 이 스크립트와 같은 폴더의 regions.json
- 시군구는 일반구를 접는다: "경기도 수원시 팔달구"(읍면동 아님) 행은 무시하고
  부모 "경기도 수원시" 행만 사용 -> regionParser.js 의 collapse 결과와 일치.
"""
import json
import sys
from pathlib import Path

import pandas as pd

SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).with_name("bjd_codes.txt")
OUT = Path(__file__).with_name("regions.json")

# regionParser.js 의 SIDO_SET 과 동일하게 유지할 것
SIDO_SET = [
    "서울특별시", "부산광역시", "대구광역시", "인천광역시", "대전광역시", "울산광역시",
    "세종특별자치시", "경기도", "충청북도", "충청남도", "경상북도", "경상남도",
    "강원특별자치도", "전북특별자치도", "제주특별자치도", "전남광주통합특별시",
]

df = pd.read_csv(SRC, sep="\t", encoding="cp949", dtype=str)
live = df[df["폐지여부"] == "존재"]
code = live["법정동코드"]

# 시군구 레벨 = 코드 뒤 5자리가 0, 단 시도(뒤 8자리 0) 제외
sgg = live[code.str.endswith("00000") & ~code.str.endswith("00000000")]

regions = {sido: set() for sido in SIDO_SET}
unknown = set()

for name in sgg["법정동명"]:
    toks = name.split()
    sido = toks[0]
    if sido not in regions:
        unknown.add(sido)
        continue
    if len(toks) == 2:            # "경기도 수원시" -> "수원시"
        regions[sido].add(toks[1])
    # len == 1: 세종 (시군구 없음)
    # len == 3: 일반구 -> 스킵 (부모 시는 len==2 행에서 포함됨)

regions = {sido: sorted(regions[sido]) for sido in SIDO_SET}

OUT.write_text(json.dumps(regions, ensure_ascii=False, indent=1), encoding="utf-8")

total = sum(len(v) for v in regions.values())
print(f"시도 {len(regions)}개 / 시군구 {total}개 -> {OUT}")
for sido, v in regions.items():
    print(f"  {sido}: {len(v)}")
if unknown:
    print(f"\n[경고] SIDO_SET 에 없는 시도명 (무시함): {sorted(unknown)}")
