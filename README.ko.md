# 카세트 2 — 스킵 없음, 이젠 공유까지

> 레트로 카세트 테이프 뮤직 플레이어. 스킵 버튼 없음. 알고리즘 없음. YouTube 링크로 나만의 믹스테이프를 만들고, 테이프를 여러 개 모아두고, 친구와 공유하는 앱.

[English README →](./README.md)

---

## 이 앱이 뭔가요?

요즘 음악, 제대로 들은 적 있으세요?

앞부분 조금 듣다가 넘기고, 또 넘기고. 재생목록은 수백 곡인데 정작 끝까지 들은 노래는 몇 곡 안 되는 그 느낌.

카세트 테이프 시절엔 달랐습니다. 싫어도 끝까지 들었고, 그러다 어느 순간 그 노래가 좋아졌습니다.

**스킵 버튼이 없습니다.**
넘기고 싶으면 FF 버튼을 꾹 누르고 있어야 합니다. 진짜 테이프처럼.

**트랙 사이마다 테이프 노이즈가 납니다.**
그 지직거리는 소리까지 듣는 게 이 앱의 경험입니다.

**Side A, Side B. 각 30분.**
직접 고른 노래만 담을 수 있습니다.

**스트리밍 없음. 내 파일만.**
알고리즘이 다음 곡을 결정하지 않습니다. 오직 내가 담은 곡만.

한 시간, 알고리즘 없이 내가 고른 노래만 들어보세요.
생각보다 훨씬 오래 기억에 남을 겁니다.

---

## 스크린샷

<p align="center">
  <img src="./screenshots/player-side-a.png" width="28%" alt="플레이어 - Side A" />
  &nbsp;&nbsp;
  <img src="./screenshots/library.png" width="28%" alt="라이브러리" />
  &nbsp;&nbsp;
  <img src="./screenshots/player-side-b.png" width="28%" alt="플레이어 - Side B (재생 중)" />
</p>
<p align="center">
  <em>플레이어 (Side A) &nbsp;·&nbsp; 라이브러리 &nbsp;·&nbsp; 플레이어 (Side B, 재생 중)</em>
</p>

---

## 주요 기능

- **스킵 버튼 없음** — FF 버튼을 꾹 눌러야 앞으로 넘어감. 진짜 테이프처럼
- **A/B 면 시스템** — 각 면 30분, 직접 담은 곡만 재생
- **테이프 노이즈** — 트랙 사이마다 실제 테이프 잡음 재생
- **카세트 플립 애니메이션** — A면↔B면 전환 시 부드러운 플립 효과
- **물리 기반 릴 회전 애니메이션** — 릴 반지름에 따라 회전 속도가 달라지는 물리적으로 정확한 애니메이션
- **백그라운드 오디오** — 화면이 꺼져도 재생 지속 (Android Foreground Service + WakeLock)
- **트랙 목록 유지** — 앱 재시작 후에도 트랙 목록 복원
- **FF / REW** — 실제 테이프 효과음과 함께 빨리감기/되감기
- **빈티지 UI** — 1980년대 카세트 플레이어에서 영감 받은 브라운/베이지 테마
- **로컬 파일 전용** — 내 음악만, 구독 없음, 인터넷 불필요

## 기술 스택

| 분류 | 패키지 |
|---|---|
| 프레임워크 | Expo SDK 54 (React Native) |
| 오디오 | expo-av |
| 애니메이션 | react-native-reanimated |
| SVG UI | react-native-svg |
| 파일 선택 | expo-document-picker |
| 백그라운드 서비스 | expo-notifications (Foreground Service) + 커스텀 WakeLock 모듈 |
| 데이터 영속성 | @react-native-async-storage/async-storage |
| 햅틱 피드백 | expo-haptics |

## 프로젝트 구조

```
artifacts/cassette-player/
├── app/
│   ├── player.tsx          # 메인 플레이어 화면
│   └── library.tsx         # A/B 트랙 관리
├── components/
│   ├── CassetteTape.tsx    # SVG 카세트 본체
│   ├── Spool.tsx           # 물리 기반 릴 회전 애니메이션
│   ├── ControlButtons.tsx  # 재생 컨트롤 (재생, 정지, FF, REW, 플립)
│   └── ProgressBar.tsx     # 트랙 진행 표시
├── hooks/
│   └── useAudioPlayer.ts   # 핵심 재생 로직 (A/B 면, 테이프 노이즈, 데이터 저장)
├── utils/
│   └── wakeLock.ts         # Android WakeLock + Foreground Service 브릿지
└── tools/
    ├── build-apk.sh        # APK 빌드 스크립트 (직접 설치용)
    └── build-store.sh      # AAB 빌드 스크립트 (Play Store용)
```

## 시작하기

### 사전 준비

- Node.js 20 이상
- pnpm
- 안드로이드 기기 또는 에뮬레이터

### 설치

```bash
git clone https://github.com/hyunseokyu1-netizen/cassette-music-player.git
cd cassette-music-player
pnpm install
cd artifacts/cassette-player
pnpm install
```

### 실행

```bash
# 기기 연결 후
adb reverse tcp:8081 tcp:8081

# 빌드 & 설치
npx expo run:android
```

### 빌드

```bash
# AAB (Play Store 업로드용)
./tools/build-store.sh

# APK (직접 설치 / 테스트용)
./tools/build-apk.sh
```

출력 파일: `artifacts/cassette-player/android/app/build/outputs/bundle/release/app-release.aab`

## 사용 방법

1. **Library** 탭을 연다
2. **Side A** 또는 **Side B**에서 **+ 추가**를 탭해 음악 파일을 불러온다
3. **Player** 탭으로 돌아간다
4. **Play** 버튼을 누르면 카세트 릴이 돌아간다
5. **FF** 버튼을 꾹 눌러야 트랙을 건너뛸 수 있다 (즉시 스킵 없음)
6. **Flip** 버튼으로 A면과 B면을 전환한다

## 참고 사항

- 로컬 오디오 파일 전용 — 스트리밍 미지원 (의도된 설계)
- 백그라운드 오디오는 `expo-notifications` Foreground Service + `PARTIAL_WAKE_LOCK`으로 Android Doze 모드를 대응
- 구현 상세 및 건드리면 안 되는 부분은 [`tools/BACKGROUND_AUDIO.md`](./tools/BACKGROUND_AUDIO.md) 참고

## 라이선스

MIT
