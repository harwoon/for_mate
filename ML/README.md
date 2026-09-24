## ai_server/ (운영용 — 이 폴더 + scripts/extract_embeddings.py 만 실제 서비스에서 사용됨)

`main.py` — FastAPI 서버. Node 백엔드가 실종 공고 등록/새벽 배치 시점에 이 서버를 호출한다.

- 크롭: RT-DETR r50vd(Apache-2.0, HF `PekingU/rtdetr_r50vd`), 신뢰도 0.25, 가장 큰 동물 박스 1개 -> 비율 유지 224 padding resize(letterbox). 손으로 라벨한 정답 박스 대비 평균 IoU가 개 0.949 / 고양이 0.894로 Faster R-CNN v2(0.892 / 0.821)보다 정확해서 교체함 — 자세한 비교는 `scripts/compare_detectors.py`
- 임베딩: `facebook/dinov2-small`(마지막 1개 블록 파인튜닝) + 학습된 Linear projection(384→512, L2 정규화). 종별로 체크포인트가 다름 — `.env`의 `DOG_EMBEDDING_CHECKPOINT` / `CAT_EMBEDDING_CHECKPOINT` (기본 각각 `dinov2_proj_dog_small_selfdistill_rkd.pth`, `dinov2_proj_cat_small_circle_distill_gen2.pth`). 학습 코드는 `scripts/train_dinov2_projection.py`
- 엔드포인트: `POST /embeddings/images`(실종공고/포인핸드용, 이미지 이미 존재), `POST /embeddings/rescue-animals`(공공데이터용, 이미지+임베딩 동시 생성)

아래 `scripts/`는 이 운영 파이프라인을 만든 학습·평가 코드다. 여기 이르기까지 시도한 후보 모델(MegaDescriptor/PetFace/ARBase/CLIP-ReID) 비교, 탐지기 선정, 손실함수·증류 실험 코드는 `experiments` 브랜치에 있다. 최종 채택 기준은 `scripts/compare_backbones.py` (하드 eval 세트에서의 케이스 단위 Recall) 결과.

# ML/ 디렉토리 안내

개·고양이 re-ID 파이프라인 코드 + 데이터. 폴더별 역할은 아래 표 참고.

| 폴더 | 역할 | git 추적 |
|---|---|---|
| `scripts/` | 최종 파이프라인 스크립트 (학습, 서빙 임베딩 추출, 평가 세트 생성) | O |
| `experiments/` | 비교 후 채택하지 않은 모델·실험 코드 — main에는 없고 **`experiments` 브랜치**에만 있음 | O (`experiments` 브랜치) |
| `checkpoints/` | 학습된 모델 가중치 (.pt/.pth) | X (재생성/재다운로드 가능) |
| `embeddings/` | 임베딩/teacher 캐시 (.pt, 일부 실험 잔여분은 .npy) | X (재생성 가능) |
| `external/` | 남의 레포 클론 — 지금은 `experiments` 브랜치 코드만 참조 | X |
| `dataset/raw/` | 원본 데이터 — **손대지 않음** | X (용량 큼) |
| `dataset/derived/` | 스크립트가 원본으로부터 만들어낸 평가용 데이터 — 지워도 스크립트 재실행하면 다시 생김 | X |
| `.env` | API 키 등 비밀값 | X |

`scripts/*.py` 는 `__file__` 기준 절대경로를 써서 아무 위치에서 실행해도 안전.

## scripts/

| 파일 | 내용 |
|---|---|
| `train_dinov2_projection.py` | 최종 학습 스크립트. `facebook/dinov2-{small,base,large}` 위에 Linear projection(+마지막 N개 블록 언프리즈)을 학습. ArcFace/Sub-center/CosFace/Circle Loss, RKD self-distillation, held-out + shelter 교차평가를 한 파일에서 `--loss_type`/`--teacher_ckpt` 등 인자로 선택 |
| `extract_embeddings.py` | 서빙 임베딩 코드 — RT-DETR 크롭 → DINOv2-small → projection → L2정규화 512차원. `ai_server/main.py`가 이 파일을 그대로 import |
| `compare_backbones.py` | 후보 모델(MegaDescriptor/PetFace/ARBase/CLIP-ReID/DINOv2 zero-shot/`ours`) 비교와 최종 모델 R@k 재측정에 계속 쓰는 평가 하네스 |
| `collect_dataset.py` | 유기동물 API 수집 + 탐지기 관련 공용 유틸 — 아래 두 스크립트가 `import`해서 재사용. `.env`에 `SERVICE_KEY`/`BASE_URL`(data.go.kr OpenAPI 인증키) 필요 |
| `collect_shelter_balanced.py` | 유기동물 API에서 종별 목표 개체 수만큼 균형 있게 수집 → `dataset/raw/shelter_raw/` |
| `build_shelter_hard.py` | `shelter_raw`로 케이스 단위 평가 세트 생성 — 선택용(`shelter_hard`, 200개체)과 최종용(`shelter_test`, 383개체, `--exclude_names`로 선택용과 정답 개체 비중복 보장). `--crop rtdetr`(기본값)은 `compare_detectors.py`의 `RtDetrDet`을 씀 |
| `compare_detectors.py` | 탐지기(YOLO/Faster R-CNN/RT-DETR) 정답 박스 대비 IoU 비교 CLI. `build_shelter_hard.py`가 `RtDetrDet` 클래스를 가져다 쓰는 의존성이라 main에 남겨둠 — 비교 자체는 탐지기 선정 실험(`experiments` 브랜치의 `detector_ablation.py` 등)의 일부 |

여러 후보 모델·손실함수·탐지기를 비교해서 지금 조합(DINOv2-small + RT-DETR)을 골랐다. 비교 과정 전체(MegaDescriptor/PetFace/ARBase/CLIP-ReID 파인튜닝, 탐지기 IoU 비교, optimizer/margin/scale 스윕 등)는 `experiments` 브랜치의 `ML/experiments/`에 있다.

## dataset/raw/ (현재 파이프라인 기준)

| 폴더 | 내용 |
|---|---|
| `shelter_raw/{dog,cat}/` | 유기동물 API로 모은 실제 보호소 사진. `build_shelter_hard.py`의 원본 |
| Dogs of the World(개) / LCW(고양이) | 학습 데이터(개 62,860개체/229,867장, 고양이 67,692개체/289,465장) — 용량 문제로 `ML/dataset/`이 아니라 로컬 별도 경로에 둔다 |

`mpdd_release/`, `YT-BB-Dog/`, `processed_animals*/`는 옛 MPDD 실험용 원본이다. `experiments` 브랜치의 스크립트만 참조한다.

## dataset/derived/ (현재 파이프라인 기준)

| 폴더 | 내용 |
|---|---|
| `shelter_hard_{dogs,cats}/` | 선택용 평가 세트 (정답 200 + 방해꾼 3,000) — loss/에폭/teacher를 고를 때 사용 |
| `shelter_test_{dogs,cats}/` | 최종 평가 세트 (정답 383 + 방해꾼 3,000, 선택용과 정답 개체 비중복) — 최종 리포트용, 튜닝에는 쓰지 않는다 |

`MPDD_hard*/`는 옛 실험용 세트다.

## external/, checkpoints/

`external/`(CLIP-ReID, PetFace 클론)과 `checkpoints/`의 MegaDescriptor·PetFace·ARBase 가중치는 `experiments` 브랜치 코드가 참조한다. main에서 실제로 쓰는 체크포인트는 `.env`의 `DOG_EMBEDDING_CHECKPOINT` / `CAT_EMBEDDING_CHECKPOINT`가 가리키는 DINOv2 projection 가중치뿐이다.
