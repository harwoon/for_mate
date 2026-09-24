# 하이퍼파라미터 스윕 라운드 1 (싼 축: optimizer / margin / scale)

`--max_identities`(비쌈, 특징 재추출 필요)는 이번 라운드에서 안 건드림 — optimizer/margin/scale/schedule/weight_decay만 바꿈, 전부 캐시된 특징 재사용이라 빠름.

**공통 고정값**: `--aug_views 2`(RandomResizedCrop+Flip+ColorJitter+GaussianBlur+RandomErasing), `--max_identities 16000`, `--epochs 60`, `--lr 1e-3`, `--sched cosine`, `--weight_decay 1e-4`(기본값 그대로)
**대상**: dog-base, dog-small, cat-base, cat-small (large는 이번 라운드 제외)

## 실험 목록 (baseline 포함 5개 x 4조합 = 20개, baseline은 기존 `_aug.pth` 재사용)

| 실험명 | optimizer | momentum | margin | scale | 비고 |
|---|---|---|---|---|---|
| baseline | adamw | - | 0.3 | 32.0 | 기존 `dinov2_proj_{dog,cat}_{base,small}_aug.pth` 그대로 사용, 재실행 안 함 |
| ①sgd | **sgd** | 0.9 | 0.3 | 32.0 | MegaDescriptor 공식 레시피의 optimizer |
| ②m02 | adamw | - | **0.2** | 32.0 | margin 완화 |
| ③m04 | adamw | - | **0.4** | 32.0 | margin 강화 |
| ④s64 | adamw | - | 0.3 | **64.0** | scale 2배 (클래스 수 16,000개 대비 부족 가능성 체크) |

## 체크포인트 파일명 규칙
`dinov2_proj_{dog|cat}_{base|small}_aug_{sgd|m02|m04|s64}.pth`

## 결과 (완료 — 16/16)

| 조합 | dog-base held-out | dog-base shelter | dog-small held-out | dog-small shelter | cat-base held-out | cat-base shelter | cat-small held-out | cat-small shelter |
|---|---|---|---|---|---|---|---|---|
| baseline(무증강) | 88.0% | 86.0~86.5% | 83.2% | 80.5% | 84.2% | 68.5% | 79.4% | 66.0% |
| baseline+aug | 88.2% | 85.5% | 83.6% | 82.5% | 84.0% | 70.5% | 79.6% | 69.5% |
| ①sgd | 87.0% | 85.0% | 82.6% | 80.0% | 82.0% | 70.5% | 78.4% | **70.5%** |
| ②m02 | 87.0% | 84.5% | 82.8% | 81.5% | 83.4% | 70.0% | **80.0%** | 70.0% |
| ③m04 | **88.4%** | **86.0%** | **84.0%** | **83.0%** | **84.6%** | **71.5%** | 79.8% | 70.0% |
| ④s64 | 86.2% | 84.5% | 82.2% | 81.0% | 82.8% | 69.5% | 78.4% | 69.0% |

(shelter는 각 학습 로그의 최고값 기준, held-out은 "최고 held-out R@1 @ epoch N" 기준. **굵게**=해당 조합 내 1등)

## 결론

- **m04(margin 0.4, 강화)가 4개 중 3개(dog-base/dog-small/cat-base)에서 held-out·shelter 둘 다 1등** — baseline+aug보다도 전부 높음. margin을 좀 더 세게 주는 방향이 이 규모(16,000개체)에서는 확실히 도움됨.
- **cat-small만 예외** — held-out은 m02(80.0%)가, shelter는 sgd(70.5%)가 근소하게 앞섬. 근데 cat-small 전체 스프레드가 69.0~70.5%(1.5%p)로 좁아서 노이즈일 가능성이 있고, m04도 이 안에서 크게 밀리진 않음(70.0%).
- sgd/m02/s64는 대체로 baseline+aug보다 낮거나 비슷 — 이번 라운드에서는 **m04가 가장 유력한 후보**.

**다음 라운드(비싼 축, max_identities 전체 사용)에서 재검증할 후보**: m04(1순위), baseline+aug(대조군)
