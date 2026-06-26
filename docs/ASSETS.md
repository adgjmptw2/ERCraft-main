# ERCraft 에셋

## 아이콘 WebP (items / loadout)

아이템·특성·전술 스킬·무기 종류 아이콘은 슬롯 잘림 방지를 위해 WebP 생성 시 **투명 안전 여백**을 포함한다.

- 슬롯 UI 크기를 키우지 않고, 에셋 내부 여백으로 해결한다.
- 변환 시 `fit: contain`만 사용하며 crop/cover는 사용하지 않는다.
- 기본: 64×64 캔버스, 콘텐츠 약 82%(`contentScale: 0.82`), 나머지는 투명 여백.

## Fankit import

Eternal Return Fankit 원본 경로를 `FANKIT_PATH`에 설정한 뒤:

```bash
npm run assets:import-fankit
```

manifest의 `items`·`loadout` slug 기준으로 `public/assets/items/**`, `public/assets/loadout/**` WebP를 동일 규칙으로 생성·덮어쓴다.

`FANKIT_PATH`가 없으면 import는 건너뛰고 안내만 출력한다.

## 기존 WebP 재최적화 (Fankit 없이)

이미 `public/assets`에 있는 아이콘 WebP에 여백 규칙을 다시 적용하려면:

```bash
npm run assets:reoptimize-icons
```

대상: `public/assets/items/**`, `public/assets/loadout/**`  
제외: `characters`, `tiers`, `brand`, `skins`

## 제외

- `public/assets/characters/**` — 캐릭터 초상화 (별도 파이프라인)
- Fankit 원본 zip/png/psd는 Git에 포함하지 않는다.
