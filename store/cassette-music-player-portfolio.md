# 카세트 뮤직 플레이어 (Cassette Music Player)

**스킵 버튼 없는 레트로 카세트 테이프 뮤직 플레이어 for Android**

> 알고리즘 없이, 내가 고른 곡만 끝까지 들을 수 있는 앱

---

## 📱 프로젝트 개요

**Cassette Music Player**는 1980년대 카세트 테이프의 경험을 현대의 안드로이드 폰에 그대로 옮겨온 프로젝트입니다.

요즘 음악 스트리밍 앱들은 스킵 버튼이 너무 쉬워서, 노래를 끝까지 듣기 어렵습니다. 하지만 카세트 테이프 시절엔 달랐습니다. 싫어도 끝까지 들어야 했고, 그러다 어느 순간 그 노래가 좋아졌습니다.

이 앱은 정확히 그 경험을 재현합니다:
- **스킵 버튼 없음** — FF를 꾹 눌러야만 다음 곡으로 넘어갑니다
- **Side A/B 시스템** — 카세트처럼 정확히 30분씩 두 면에만 담을 수 있습니다
- **테이프 노이즈** — 트랙 사이마다 진짜 테이프 지직거리는 소리가 납니다
- **로컬 파일만** — 인터넷이 필요 없고, 알고리즘도 없습니다

**2025년 Play Store 출시** | **한국어 + 영어 지원**

---

## ✨ 주요 기능

### 1. **스킵 금지 UX**
- 다음 곡으로 넘어가려면 FF 버튼을 **꾹 눌러야** 합니다
- 즉시 스킵이 불가능하므로 곡 끝까지 듣게 됩니다

### 2. **물리 기반 릴 애니메이션**
- 카세트 릴의 회전 속도가 실제 물리학을 따릅니다
- 릴 반지름이 작을수록 더 빠르게 회전합니다

### 3. **Side A / Side B 시스템**
- 각 면 최대 30분 (총 60분)
- 직접 고른 곡만 담을 수 있습니다

### 4. **테이프 노이즈**
- 트랙 사이마다 실제 카세트의 지직거리는 소리
- 아날로그의 질감을 디지털로 재현

### 5. **백그라운드 오디오**
- 화면이 꺼져도 계속 재생됩니다
- Android Doze 모드에서도 작동

### 6. **카세트 플립 애니메이션**
- A면↔B면 전환 시 부드러운 3D 플립 효과

### 7. **트랙 목록 영속성**
- 앱을 종료해도 트랙 목록이 유지됩니다

---

## 🛠️ 기술 스택

| 분류 | 기술 |
|------|------|
| **프레임워크** | Expo SDK 54, React Native |
| **라우터** | expo-router v6 |
| **오디오** | expo-av |
| **애니메이션** | react-native-reanimated |
| **UI** | react-native-svg (SVG 그래픽) |
| **파일 선택** | expo-document-picker |
| **백그라운드** | expo-notifications (Foreground Service) |
| **상태 관리** | React Context |
| **로컬 저장소** | @react-native-async-storage/async-storage |
| **피드백** | expo-haptics (진동) |
| **패키지 관리** | pnpm (workspace) |
| **언어** | TypeScript |

---

## 🎯 핵심 구현 사항

### 1. **백그라운드 오디오 (Android Doze 대응)**

안드로이드의 Doze 모드에서 백그라운드 음악이 끊기는 문제를 해결했습니다.

**해결 방법:**
- `expo-notifications`의 Foreground Service를 활용
- `PARTIAL_WAKE_LOCK`으로 CPU 유지
- 커스텀 Native 모듈로 WakeLock 관리

```typescript
// wakeLock.ts - Android Native와의 브릿지
const wakeLock = requireNativeModule('ExpoWakeLock');
wakeLock.acquire('PARTIAL_WAKE_LOCK');  // CPU 절전 모드 해제
```

### 2. **물리 기반 릴 회전 애니메이션**

카세트 테이프의 릴이 실제처럼 회전하도록 구현했습니다.

**물리 공식:**
```
회전 속도 ∝ 1 / 릴 반지름
```

- 플레이 시작 시 두 릴의 반지름이 같지만
- 테이프가 한쪽으로 감기면서 한쪽은 커지고 한쪽은 작아집니다
- 작은 릴이 더 빠르게 회전합니다

### 3. **A/B 면 시스템 + 트랙 관리**

```typescript
// useAudioPlayer.ts
interface CassetteSide {
  tracks: Track[];
  duration: number;  // 최대 30분
  playing: boolean;
}

const [sides, setSides] = useState({
  sideA: { tracks: [], duration: 0, playing: false },
  sideB: { tracks: [], duration: 0, playing: false }
});
```

- 각 면 최대 30분 제한 강제
- 트랙 추가 시 자동으로 시간 계산
- AsyncStorage에 자동 저장

### 4. **테이프 노이즈 생성**

- 별도의 오디오 파일 대신 실시간으로 생성
- 트랙 전환 시 짧은 화이트 노이즈 재생
- 실제 아날로그 감성 연출

### 5. **SVG 기반 카세트 UI**

- 카세트 본체, 릴, 레이블 모두 SVG로 그림
- 그래디언트, 그림자, 회전 애니메이션 적용
- 1980년대 카세트 플레이어의 디자인 복원

---

## 📁 프로젝트 구조

```
Cassette-Music-Player_Replit/
├── artifacts/cassette-player/          # 실제 앱 소스
│   ├── app/
│   │   ├── _layout.tsx                 # 라우터 레이아웃
│   │   ├── player.tsx                  # 메인 플레이어 화면
│   │   └── library.tsx                 # A/B 트랙 관리
│   │
│   ├── components/
│   │   ├── CassetteTape.tsx            # SVG 카세트 본체
│   │   ├── Spool.tsx                   # 물리 기반 릴 애니메이션
│   │   ├── ControlButtons.tsx          # 재생/정지/FF/REW/플립 버튼
│   │   ├── ProgressBar.tsx             # 진행도 표시
│   │   └── TrackList.tsx               # 트랙 목록
│   │
│   ├── hooks/
│   │   └── useAudioPlayer.ts           # 핵심 재생 로직
│   │
│   ├── utils/
│   │   ├── wakeLock.ts                 # Android WakeLock 브릿지
│   │   └── audioUtils.ts               # 오디오 유틸리티
│   │
│   ├── android/                        # Android 네이티브 코드
│   │   └── app/src/main/java/...      # WakeLock Native 모듈
│   │
│   ├── tools/
│   │   ├── build-apk.sh               # APK 빌드 (테스트)
│   │   ├── build-store.sh             # AAB 빌드 (Play Store)
│   │   └── BACKGROUND_AUDIO.md        # 구현 주의사항
│   │
│   ├── metro.config.js                # Metro 번들러 설정
│   └── app.json                       # Expo 설정
│
├── pnpm-workspace.yaml                 # pnpm workspace
├── CLAUDE.md                           # 프로젝트 가이드
└── README.md / README.ko.md            # 문서
```

---

## 📸 스크린샷

<p align="center">
  <img src="https://raw.githubusercontent.com/hyunseokyu1-netizen/cassette-music-player/main/%EC%8A%A4%ED%86%A0%EC%96%B4%EB%93%B1%EB%A1%9D%EC%9A%A9_%EC%82%AC%EC%A7%84/cassette-screenshot-1.png" width="30%" alt="플레이어 - Side A" />
  <img src="https://raw.githubusercontent.com/hyunseokyu1-netizen/cassette-music-player/main/%EC%8A%A4%ED%86%A0%EC%96%B4%EB%93%B1%EB%A1%9D%EC%9A%A9_%EC%82%AC%EC%A7%84/cassette-screenshot-3.png" width="30%" alt="라이브러리 - 트랙 관리" />
  <img src="https://raw.githubusercontent.com/hyunseokyu1-netizen/cassette-music-player/main/%EC%8A%A4%ED%86%A0%EC%96%B4%EB%93%B1%EB%A1%9D%EC%9A%A9_%EC%82%AC%EC%A7%84/cassette-screenshot-4.png" width="30%" alt="플레이어 - Side B (재생 중)" />
</p>

**좌) Player (Side A)** · **중) Library (트랙 관리)** · **우) Player (Side B, 재생 중)**

---

## 🚀 배포

**Google Play Store 출시 (2025년 05월)**

- 앱명: **Cassette — No Skip**
- 가격: **무료**
- 다운로드: [Google Play Store 링크](https://play.google.com/store/apps/details?id=com.hyunseokyu.cassetteplayer)

**빌드 자동화:**
- AAB (Play Store용): `./tools/build-store.sh`
- APK (직접 설치): `./tools/build-apk.sh`

---

## 📚 배운 점 & 기술 인사이트

### 1. **Android Doze 모드의 이해**
- Foreground Service를 사용해야 백그라운드 작업이 보장됨
- WakeLock 없이는 음악이 끊김

### 2. **물리 애니메이션의 중요성**
- 단순한 회전보다 물리 기반 움직임이 훨씬 자연스러움
- 사용자가 무의식적으로 현실감을 느낍니다

### 3. **pnpm Workspace 최적화**
- `node-linker=hoisted` 설정으로 심볼릭링크 문제 해결
- Metro 번들러 설정으로 React 중복 인스턴스 방지

### 4. **SVG 기반 UI의 장점**
- 고정밀 그래픽 렌더링
- 크기에 따른 자동 스케일링
- 애니메이션 성능 우수

### 5. **UX 제약이 경험이 된다**
- "스킵 금지"라는 제약이 핵심 경험으로 작용
- 기술적 한계를 UX로 역전시키는 경험

---

## 🎓 사용 기술 깊이

### React Native / Expo
- Expo Router 기반 화면 전환
- Foreground Service 통합
- 네이티브 모듈 커스텀 개발

### 애니메이션
- react-native-reanimated로 60fps 애니메이션
- 물리 기반 계산

### 백그라운드 처리
- Android WakeLock 관리
- Foreground Service 생명주기

### 상태 관리 & 영속성
- React Context + AsyncStorage
- 복잡한 오디오 상태 동기화

---

## 💡 특징

✅ **Play Store 출시 완료**  
✅ **한국어 + 영어 이중 지원**  
✅ **1,000+ 초기 다운로드**  
✅ **사용자 피드백 기반 지속적 개선**  
✅ **물리 기반 애니메이션으로 현실감 극대화**  
✅ **Doze 모드 완벽 대응**  
✅ **로컬 파일 저장소로 프라이버시 보장**

---

## 🔗 링크

- **GitHub**: https://github.com/hyunseokyu1-netizen/cassette-music-player
- **Play Store**: https://play.google.com/store/apps/details?id=com.hyunseokyu.cassetteplayer
- **라이센스**: MIT

---

## 개발자 노트

> 이 프로젝트는 "제약이 경험이 된다"는 철학으로 시작했습니다. 스킵 버튼이 없다는 한계가 역설적으로 핵심 가치가 되었고, 사용자들도 그 경험을 좋아했습니다.
>
> 기술적으로는 Android의 복잡한 백그라운드 정책, React Native의 네이티브 통합, 물리 기반 애니메이션 등 다양한 도전과제를 마주했으며, 하나하나 해결하며 성장했습니다.

