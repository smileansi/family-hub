// ============================================
// Firebase 설정 (선택사항 - 클라우드 배포용)
// ============================================
// 이 파일은 Firebase를 사용하여 클라우드 배포할 때 필요합니다.
// 아래 단계를 따라 설정하세요:

// 1. Firebase 프로젝트 생성 (https://console.firebase.google.com)
// 2. Firestore Database 활성화
// 3. Authentication 활성화 (Google Sign-in)
// 4. 아래 코드에 Firebase 설정 값 입력

// import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
// import { getAuth } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";
// import { getFirestore } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

// const firebaseConfig = {
//   apiKey: "YOUR_API_KEY",
//   authDomain: "your-project.firebaseapp.com",
//   projectId: "your-project-id",
//   storageBucket: "your-project.appspot.com",
//   messagingSenderId: "YOUR_SENDER_ID",
//   appId: "YOUR_APP_ID"
// };

// const app = initializeApp(firebaseConfig);
// const auth = getAuth(app);
// const db = getFirestore(app);

// 현재는 localStorage를 사용하여 로컬에서 작동합니다.
// 클라우드 배포 시 위 설정을 활성화하고 app.js의 데이터 저장 로직을 Firebase로 변경하세요.
