# 👨‍👩‍👧‍👦 패밀리 허브 - 가족 일정 관리 웹페이지

가족이 함께 사용할 수 있는 올인원 가족 관리 웹페이지입니다.

## ✨ 주요 기능

- 📅 **가족 일정** - 주요 행사를 달력으로 관리
- 📌 **공지/메모** - 가족 소식 및 메모를 실시간으로 공유
- ⏰ **시간표** - 아이들의 시간표를 한 눈에 보기
- ✓ **할 일 목록** - 할일을 우선순위로 관리
- 🛒 **쇼핑 리스트** - 필요한 물품을 목록화하고 예상 비용 계산
- 🌤️ **날씨** - 현재 위치의 날씨 정보 확인

## 🚀 빠른 시작

### 1. 로컬에서 실행 (권장 - 처음 시작)

```
1. 이 폴더를 VS Code에서 열기
2. 터미널에서: python -m http.server 8000
3. 브라우저에서: http://localhost:8000 열기
4. 이름을 입력하면 시작!
```

또는 Live Server 확장 사용:
```
1. VS Code에서 Live Server 확장 설치
2. index.html 우클릭 → "Open with Live Server"
```

### 2. 클라우드 배포 (Vercel 추천)

#### Vercel을 사용한 무료 배포:

1. **GitHub에 업로드**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/family-hub.git
   git push -u origin main
   ```

2. **Vercel에 연결**
   - https://vercel.com 접속
   - GitHub 계정으로 로그인
   - "New Project" → GitHub 리포지토리 선택
   - Deploy 버튼 클릭

3. **자동으로 배포됨!**
   - 제공된 URL로 접속 가능
   - 모바일에서도 접속 가능
   - 가족 모두 공유 가능

#### 또는 Netlify:

1. https://netlify.com 접속
2. GitHub 리포지토리 연결
3. Deploy 버튼 클릭

## 💾 데이터 저장

### 현재 상태 (로컬)
- 브라우저의 `LocalStorage`에 데이터 저장
- 같은 기기, 같은 브라우저에서만 데이터 유지

### Firebase로 업그레이드 (실시간 동기화)

1. **Firebase 프로젝트 생성**
   - https://console.firebase.google.com 방문
   - "새 프로젝트" 생성
   - 프로젝트명: "family-hub" (또는 원하는 이름)

2. **Firestore Database 설정**
   - "Build" → "Firestore Database" 클릭
   - "프로덕션 모드에서 시작" 선택
   - 위치 선택 (서울 권장)

3. **Authentication 설정**
   - "Build" → "Authentication" 클릭
   - "Sign-in method" → "Google" 활성화

4. **firebase-config.js 업데이트**
   ```
   - Firebase Console에서 프로젝트 설정 열기
   - "config" 객체의 keyconfig 복사
   - firebase-config.js에 붙여넣기
   ```

5. **app.js 업데이트** (Firebase 버전)
   - LocalStorage → Firestore 변경
   - (상세 변경 가이드는 주석 참고)

## 📱 기능 상세

### 📅 일정
- 새 일정 추가 (날짜, 시간, 설명)
- 월별 캘린더 뷰
- 가족 멤버별 공지

### 📌 공지/메모
- 메모 작성 및 공유
- 실시간 협약 편집 (공유 링크로)
- 메모 순서 정렬

### ⏰ 시간표
- 요일별 시간표 등록
- 중복 시간표 방지
- 활동 내용 상세 기록

### ✓ 할 일
- 우선순위 설정 (높음/중간/낮음)
- 담당자 할당
- 완료 체크 기능
- 필터링 (전체/진행중/완료)

### 🛒 쇼핑 리스트
- 물품 카테고리 분류
- 가격 × 수량 자동 계산
- 총액 표시
- 구매 완료 체크

### 🌤️ 날씨
- 위치 검색으로 날씨 확인
- 5일 예보
- Open-Meteo API 사용 (API 키 불필요)

## 🔒 보안 및 개인정보

현재 로컬 버전:
- 모든 데이터는 브라우저에 저장
- 로그인 정보 저장 안 함
- 다른 기기에서는 접근 불가

Firebase 버전:
- Google 계정으로 인증
- 가족 멤버별 접근 권한 설정 가능
- 자동 백업

## 📋 설치 가능한 추가 기능

- 가족 사진 갤러리
- 가족 채팅/메시지
- 가족 예산 관리
- 심부름 목록
- 약속 리마인더

## 🛠️ 기술 스택

- **프론트엔드**: HTML5, CSS3, Vanilla JavaScript
- **아이콘**: Emoji
- **API**: Open-Meteo (날씨)
- **선택사항**: Firebase (실시간 데이터베이스)
- **배포**: Vercel, Netlify

## 📚 파일 구조

```
family-hub/
├── index.html          # 메인 페이지
├── style.css           # 스타일시트 (반응형)
├── app.js              # 자바스크립트 로직
├── firebase-config.js  # Firebase 설정 (선택)
├── README.md           # 이 파일
└── assets/             # 향후 이미지 저장 폴더
```

## 🚨 트러블슈팅

### 데이터가 저장되지 않음
- 브라우저 개발자 도구 (F12) → Applications → Local Storage 확인
- 쿠키 및 사이트 데이터 삭제되지 않았는지 확인

### 날씨가 안 나옴
- 인터넷 연결 확인
- 올바른 도시명 입력 (예: "서울", "부산", "대전")
- 브라우저 콘솔에서 에러 확인 (F12 → Console)

### 배포 후 데이터 안 보임
- 각 기기/브라우저에서 새로 로그인 필요
- Firebase 설정되어 있는지 확인
- Firestore 규칙 확인

## 📝 라이선스

개인 및 가정용 사용 자유

## 💡 팁

- 정기적으로 쇼핑 리스트 정리하기
- 일정 충돌 방지를 위해 시간표 공유하기
- 중요한 공지는 상단에 고정하기
- 완료된 할일 주간 리뷰하기

## 🎉 즐거운 가족 생활을 응원합니다!

더 궁금한 사항이 있으면 이 파일을 수정하거나 코드에 주석을 추가하세요.
