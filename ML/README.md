## ai_server/ (운영용 — 이 폴더만 실제 서비스에서 사용됨)

`main.py` — FastAPI 서버. Node 백엔드가 실종 공고 등록/새벽 배치 시점에 이 서버를 호출한다.

- 크롭: `torchvision`의 Faster R-CNN v2 (`scripts/collect_dataset.py`와 동일 설정)
- 임베딩: MegaDescriptor-B-224를 MPDD로 파인튜닝한 `checkpoints/megadescriptor_mpdd_best.pth` (1024차원, L2 정규화)
- 엔드포인트: `POST /embeddings/images`(실종공고/포인핸드용, 이미지 이미 존재), `POST /embeddings/rescue-animals`(공공데이터용, 이미지+임베딩 동시 생성)

아래 `notebooks/`, `scripts/`는 이 운영 파이프라인을 만들기 위한 실험 코드이자, 향후 모델 교체(CLIP-ReID, ARBase 등) 실험용이다.

# ML/ 디렉토리 안내

개(dog) re-ID 실험 코드 + 데이터. 폴더별 역할은 아래 표 참고.

| 폴더 | 역할 | git 추적 |
|---|---|---|
| `notebooks/` | 실험 노트북 (수집/전처리/파인튜닝/평가) | O |
| `scripts/` | 재사용하는 파이썬 스크립트 (데이터 수집, 하드 eval 세트 생성) | O |
| `checkpoints/` | 학습된 모델 가중치 (.pt/.pth) | X (재생성/재다운로드 가능) |
| `embeddings/` | 임베딩 캐시 (.npy) | X (재생성 가능) |
| `external/` | 남의 레포 클론 (우리 코드 아님, 우리가 안에 파일 몇 개 패치해둠) | X |
| `dataset/raw/` | 원본 데이터 — **손대지 않음** | X (용량 큼) |
| `dataset/derived/` | 스크립트가 원본으로부터 만들어낸 평가용 데이터 — 지워도 스크립트 재실행하면 다시 생김 | X |
| `.env` | API 키 등 비밀값 | X |

모든 노트북/스크립트는 **`ML/` 을 기준으로 한 단계 아래(`notebooks/`, `scripts/`)에서 실행**한다고 가정하고 상대경로(`../dataset/...`, `../checkpoints/...`)를 씁니다. `scripts/*.py` 는 `__file__` 기준 절대경로라 아무 위치에서 실행해도 안전.

## notebooks/

| 파일 | 내용 |
|---|---|
| `extraction_shelter.ipynb` | data.go.kr 유기동물 API에서 사진 수집 + YOLO 크롭 (실험용 스크래치 — 정식 버전은 `scripts/collect_dataset.py`) |
| `clip_reid_mpdd.ipynb` | CLIP-ReID 클론 + MPDD로 2-stage 파인튜닝 드라이버 |
| `finetune_megadescriptor_official.ipynb` | MegaDescriptor를 MPDD로 파인튜닝 + 보호소 데이터 평가 |
| `finetune_petface_official.ipynb` | PetFace 백본을 MPDD로 파인튜닝 + 보호소 데이터 평가 |
| `petface_test.ipynb` | PetFace 사전학습 가중치를 파인튜닝 없이 그대로 테스트 (정렬 유무 비교) |
| `model_test.ipynb` | MegaDescriptor 사전학습 가중치 zero-shot 테스트 |

## scripts/

| 파일 | 내용 |
|---|---|
| `collect_dataset.py` | 유기동물 API 수집 → `dataset/raw/processed_animals/` (재개 가능) |
| `build_mpdd_hard.py` | MPDD query/gallery를 cross-session으로 재분할 → `dataset/derived/MPDD_hard/` |
| `build_ytbb_distractors.py` | YT-BB-Dog 클립당 1장씩 뽑아 `MPDD_hard/gallery/` 에 방해꾼으로 추가 |
| `build_mpdd_hard_corrupt.py` | `MPDD_hard/query/` 를 저해상도+크롭+JPEG 열화시켜 `dataset/derived/MPDD_hard_corrupt/` 생성 |
| `arbase_model.py` | ARBase(IBN-ResNet50 + MGN 3-브랜치 + BoT) 모델 정의 — OpenAnimals(ICCV 2025) 논문 재구현, 공식 코드 미공개라 최선의 재현 |
| `train_arbase.py` | ARBase를 MPDD로 학습 (384x384, flip만 증강, cosine LR, 5에폭마다 mAP 체크+best저장+조기종료) |
| `eval_case_level_clipreid.py` | CLIP-ReID 체크포인트로 케이스단위(query 여러장 평균 + gallery N장 캡) 하드 eval |
| `eval_case_level_wildlife.py` | MegaDescriptor/PetFace/ARBase 체크포인트로 같은 케이스단위 하드 eval (`--model` 로 선택) |
| `inspect_errors.py` | `eval_case_level_*.py` 의 `--dump_errors` csv를 읽어 오답 케이스를 이미지 그리드 PNG로 렌더 |

`arbase_model.py`/`train_arbase.py`/`eval_case_level_*.py` 는 `external/CLIP-ReID/` 안의 `datasets/`, `loss/`, `config/`, `model/` 를 `sys.path` 로 가져다 쓰지만, 파일 자체는 여기(`scripts/`, git 추적됨)에 있음 — `external/` 은 통째로 gitignore 대상이라 우리가 직접 짠 코드를 그 안에 두면 깃에 안 올라감.

빌드 순서: `build_mpdd_hard.py` → `build_ytbb_distractors.py` → `build_mpdd_hard_corrupt.py` (셋 다 재실행해도 안전, 이미 있는 파일은 건너뜀).

## dataset/raw/

| 폴더 | 내용 |
|---|---|
| `mpdd_release/MPDD/pytorch/{train,query,gallery,val}` | Multi-pose Dog Dataset 원본 (Market-1501 스타일, `<pid>_c<pose>s<seq>_<n>.jpg`) |
| `YT-BB-Dog/{train,test}/<클립번호>/` | YouTube-BoundingBoxes 개 필터링 버전. 폴더 하나 = 영상 한 클립의 연속 프레임 |
| `processed_animals/<desertionNo>/` | 실제 보호소 유기동물 사진 (YOLO 전신 크롭) — 진짜 배포 도메인 데이터 |
| `processed_animals_masked/` | 위 사진에서 YOLO 세그멘테이션으로 배경 제거한 버전 |
| `processed_animals_faces/` | 얼굴 정렬 버전 (AnyFace 연동 미완성이라 비어있음) |

## dataset/derived/

| 폴더 | 내용 |
|---|---|
| `MPDD_hard/MPDD/pytorch/` | cross-session 재분할 + YT-BB 방해꾼 2,723장을 더한 하드 eval 세트 |
| `MPDD_hard_corrupt/MPDD/pytorch/` | 위에서 query만 폰카메라 열화(랜덤크롭+저해상도+JPEG)를 추가로 입힌 버전 — 지금까지 나온 것 중 가장 실전에 가까운 벤치마크 |

## external/

| 폴더 | 내용 |
|---|---|
| `CLIP-ReID/` | [Syliz517/CLIP-ReID](https://github.com/Syliz517/CLIP-ReID) 클론. `datasets/mpdd.py`, `datasets/make_dataloader*.py`(mpdd 등록), `configs/person/vit_clipreid_mpdd*.yml`, `model/arbase.py`(구버전, 지금은 `scripts/arbase_model.py`로 이동) 를 우리가 추가/패치함. 학습 결과는 `logs/mpdd_clipreid/` 안에 있음. 우리가 직접 짠 학습/평가 스크립트는 여기 두지 않고 `scripts/` 에 둠(이 폴더는 통째로 gitignore) |
| `petface_repo/` | [mapooon/PetFace](https://github.com/mapooon/PetFace) 클론. 얼굴 정렬용 keypoint 템플릿(`keypoints/dog.npy`)만 사용 중 |

## checkpoints/

| 파일 | 내용 |
|---|---|
| `megadescriptor_mpdd_best.pth` | MegaDescriptor를 MPDD로 파인튜닝한 최종 가중치 |
| `petface_mpdd_best.pth` | PetFace 백본을 MPDD로 파인튜닝한 최종 가중치 |
| `petface_pretrained/{dog,cat}.pt` | PetFace 공식 사전학습 ArcFace 가중치 (비상업 연구용) |
| `yolo11n.pt` / `yolo11n-seg.pt` | 동물 탐지 / 세그멘테이션용 YOLO11 가중치 |

CLIP-ReID 자체 체크포인트(`ViT-B-16_60.pth`)는 `external/CLIP-ReID/logs/mpdd_clipreid/` 안에 그대로 있음 (레포 구조를 안 건드리려고 여기 안 옮김).
