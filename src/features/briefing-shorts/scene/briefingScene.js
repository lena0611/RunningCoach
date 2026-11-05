// 브리핑 쇼츠 3D 장면(#898) — 달리던 러너가 멈춰 카메라를 보고 오늘 훈련을 말하고, 다시 달려 나간다.
//
// PoC(저장소 밖 ~/practice/vrm-comic-poc/index.html, 21번 다듬어 폰에서 확인한 것)를 거의 그대로 옮겼다.
// 이 파일은 **장면만** 그린다. 문구·자막·목소리(기기 TTS)·닫기는 앱(BriefingShortsPopup.vue)이 맡는다 —
// 대사는 화면 브리핑과 같은 함수(buildSessionBriefing)에서 오므로 여기에 문장을 두지 않는다(두 번째 진실 금지).
//
// 타입: 2,600줄짜리 PoC 를 TS 로 옮기면 동작이 바뀔 위험만 크다. JS 로 두고 공개 API 만 briefingScene.d.ts 로 묶는다.
// 함정·측정 기록은 PoC README(12장 함정 모음)에 있다 — 특히 셰이더 pow/acos 의 NaN(Apple GPU), VRM0 축 부호.
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'

// 러닝 타입별 기본 페이스(초/km)·케이던스(걸음/분)와 자세. knee·thigh = 스윙 무릎 최대 굽힘·허벅지 앞으로 드는 각,
// drop = 엉덩이 낮춤(다리 대비). 인터벌은 빠르게 달리기 ↔ 걷기를 run·rest 초씩 오간다
const RUNS = {
  easy: { pace: 390, spm: 168, arm: 0.5, knee: 1.66, thigh: 0.66, lean: 0.14, drop: 0.048 },
  tempo: { pace: 300, spm: 178, arm: 0.7, knee: 1.92, thigh: 0.79, lean: 0.18, drop: 0.058 },
  lsd: { pace: 450, spm: 164, arm: 0.42, knee: 1.55, thigh: 0.6, lean: 0.12, drop: 0.045 },
  race: { pace: 270, spm: 184, arm: 0.85, knee: 2.05, thigh: 0.9, lean: 0.2, drop: 0.062 },
  interval: { pace: 240, spm: 188, arm: 0.95, knee: 2.15, thigh: 0.95, lean: 0.22, drop: 0.064, walk: { run: 8, rest: 8 } },
}
// sx 성별 · rn 러닝 타입 · st 주법 · pc 페이스(0 = 타입 기본) · cd 케이던스(0 = 타입 기본) · wt 체중(0 = 모델 기본)
// dy 날짜(1~365) · tm 시간(시) · wx 날씨 · tp 옷(계절) · ac 악세사리(- 로 잇는다) · df 심도(0 = 끔)
// el·az·ds 달릴 때 카메라 앵글·포지션·디스턴스 · mv 뛰기(1)/멈추기(0) · ol 검은 외곽선(먹선) 1 = 그림 / 0 = 뺌(기본, 사용자 요청 2026-11-05)
export const SCENE_DEFAULTS = { sx: 'f', rn: 'easy', st: 'rear', pc: 0, cd: 0, wt: 0, dy: 308, df: 0, tm: 9, wx: 'clear', tp: 'mild', ac: 'cap-watch', el: 6, az: 54, ds: 3.4, mv: 1, ol: 0 }
// 체중 기준(kg): 모델 기본 체형 = BMI 20 안팎의 마른 몸(여 키 1.57m → 50kg, 남 1.70m → 60kg). wt = 0 이면 이 값
const WT_BASE = { f: 50, m: 60 }
const STOPS = [0, 16, 11, 8, 5.6, 4, 2.8, 2, 1.4] // 조리개 단계 → f값

export async function createBriefingScene({ canvas, modelUrl, options = {}, onReadyToTalk, signal } = {}) {
  const OPT = { ...SCENE_DEFAULTS, ...options }
  let disposed = false
  let raf = 0
  signal?.addEventListener('abort', () => { disposed = true })

  // ---- 옵션: 앱이 넘긴 값(OPT). 문구·목소리는 앱(Vue)이 맡고, 여기는 장면만 그린다 ----
  const CHAR = { f: 'female', m: 'male' }[OPT.sx];
  // cloud = 구름 덮임(0~1: 별·해·그림자를 가리고 하늘을 잿빛으로), precip = 내리는 것, wet = 젖은 바닥, cold = 입김. paper* = 페인터리 종이색
  const WEATHERS = {
    clear: { cloud: 0, chip: '' },
    cloudy: { cloud: 0.85, chip: '흐림 14°C' },
    rain: { cloud: 1, precip: 'rain', wet: 1, chip: '비 12°C' },
    snow: { cloud: 0.9, precip: 'snow', cold: 1, chip: '눈 −2°C', paperTop: [0.80, 0.86, 0.93], paperBottom: [0.88, 0.91, 0.95] },
  };
  const WX = WEATHERS[OPT.wx] ?? WEATHERS.clear;

  // 카메라: 캐릭터가 바라보는 방향(FACING) 기준 각도·거리·높이. 키 스케일 k 를 곱해 쓴다
  const FACING = -0.8; // 옆모습 쪽으로 돌려 보폭이 보이게
  const CAMERAS = {
    hero: { yaw: 0.95, dist: 3.4, h: 0.75, look: 0.85, fov: 34, roll: -0.04 },  // 살짝 로우앵글 3/4
    face: { yaw: 0.35, dist: 1.0, h: 1.48, look: 1.46, fov: 30, roll: 0 },      // 말하는 얼굴 클로즈업
    side: { yaw: Math.PI / 2, dist: 4.4, h: 0.95, look: 0.9, fov: 30, roll: 0 }, // 옆모습 — 보폭
    back: { yaw: Math.PI - 0.35, dist: 3.2, h: 1.5, look: 1.0, fov: 34, roll: 0 }, // 뒤따라가기
    top: { yaw: 0.6, dist: 2.2, h: 3.4, look: 0.7, fov: 34, roll: 0 },          // 내려다보기
    low: { yaw: 0.5, dist: 2.0, h: 0.12, look: 1.25, fov: 42, roll: -0.08 },   // 바닥에서 올려다보기
  };
  const CUTS = ['hero', 'face', 'side', 'back']; // ?cam=cuts → 2.5초마다 끊어 붙인다
  const CUT_SEC = 2.5;

  const FX = false; // 페인터리 후처리는 PoC 옵션 — 앱은 VRoid 원본 렌더(사용자 결정)
  const CAM = 'hero';
  const STORY = true; // 브리핑 연출(러너가 다가오면 카메라맨이 앞서 뛰며 찍는다 — 아래 '브리핑 연출')

  const RUN = RUNS[OPT.rn]; // 지금 러닝 타입

  const W = 720, H = 819; // 위 16%·아래 20% 레터박스를 뺀 가운데 무대(9:10.24)
  const STEP = 1 / 12; // 페인터리(?fx=1)는 캐릭터·땅을 12fps 로 끊는다. 원본은 매 프레임
  const clock = new THREE.Clock();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 200);

  const light = new THREE.DirectionalLight('#ffffff', Math.PI); // 채움 빛(낮 하늘·땅 반사, 밤 달빛) — 색·세기는 시간이 정한다
  light.position.set(-1.4, 2.0, 1.3);
  scene.add(light);

  // ---- VRM ----
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.loadAsync(modelUrl);
  if (disposed) { renderer.dispose(); renderer.forceContextLoss(); throw new DOMException('aborted', 'AbortError'); }
  const vrm = gltf.userData.vrm;
  const isV0 = vrm.meta?.metaVersion === '0';
  if (isV0) VRMUtils.rotateVRM0(vrm);
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  vrm.scene.traverse((o) => { o.frustumCulled = false; });
  vrm.scene.rotation.y += FACING; // rotateVRM0 가 돌려 둔 180° 위에 더한다
  const baseYaw = vrm.scene.rotation.y; // 브리핑 때 몸을 돌리는 기준
  // 명암은 후처리가 노멀로 다시 그린다 → MToon 은 그림자 없는 평면색만 낸다
  if (FX) vrm.scene.traverse((o) => {
    for (const m of [o.material].flat()) {
      if (!m?.isMToonMaterial || m.isOutline) continue;
      m.shadeColorFactor.copy(m.color);
      m.shadeMultiplyTexture = m.map;
      m.needsUpdate = true;
    }
  });
  scene.add(vrm.scene);
  vrm.lookAt.target = camera;
  // 키가 달라도 같은 구도가 나오게 머리 높이로 카메라를 키운다(여성 샘플 머리 높이 1.386m 가 기준)
  vrm.scene.updateMatrixWorld(true);
  const k = vrm.humanoid.getRawBoneNode('head').getWorldPosition(new THREE.Vector3()).y / 1.386;
  const ease = (x) => { x = Math.min(Math.max(x, 0), 1); return x * x * (3 - 2 * x); };

  // ---- 러닝 차림: 옷(계절)·악세사리·묶은 머리 ----
  // 모델 파일은 그대로 두고 불러온 뒤 덧입힌다. 치수는 머리 틀(mm): 원점 = 머리뼈, x 왼쪽·y 위·z 앞(쉬는 자세)
  //  - 모자: 타원체 돔 + 앞챙. 러너처럼 눈썹 바로 위까지 푹 눌러쓴다. 모자 속 머리카락은 돔 안으로 눌러 넣고, 테두리 밑으로는 눌린 채 흘러나오게 한다
  //  - 여자: 모델이 묶은 포니테일을 그대로 모자 뒤 구멍으로 빼서 흔들리게 + 왼손목 워치 + 흰 중목 양말
  //  - 남자: 머리 가닥을 뿌리부터 줄여 짧고 단정하게
  const OUTFITS = {
    female: {
      cap: { c: [0, 100, 0], r: [103, 113, 114], front: 106, back: 60, brim: 70, color: '#f2f0eb', shade: '#c3c2cc' },
      cut: /^J_Sec_Hair\d_01$/, // 정수리 바보털 — 모자 꼭대기를 뚫고 솟는다
      // 묶은 꼬리: 모자에 눌러 넣지 않고 원래 흔들림(스프링 뼈)을 살린다. 모델은 정수리 뒤에 높이 묶어서 모자를 쓰면 꼬리가 모자 위에 얹혀 보인다
      // → 모자를 쓰면 러너처럼 뒤 구멍(뒤 테두리 위 3~4cm) 높이로 꼬리째 내려 묶는다(root = 묶은 뿌리 새 자리)
      ponytail: { re: /^J_Sec_Hair\d_02$/, root: [0, 96, -120] },
      bare: { cut: null }, // 모자를 안 쓰면 머리는 그대로
      watch: { strap: '#ff6f5e', strapShade: '#c4503f', case: '#2a2c33', face: '#0d1015', ring: '#3ee08f' },
    },
    male: {
      // 여자와 같은 VRoid 머리틀. 예전 검정 모자는 정면에서 챙이 돔과 한 덩어리로 보여 바가지(헬멧) 같았다(사용자 지적 2026-11-05) →
      // 밝은 회색 + 챙 밑 진회색(정면에서 챙 끝선이 또렷), 옆폭 103 → 96(옆으로 부푼 헬멧 실루엣을 줄인다 — 머리카락도 같은 돔으로 눌러 안 샌다)
      cap: { c: [0, 100, 0], r: [96, 113, 114], front: 106, back: 60, brim: 70, color: '#d9dce1', shade: '#a9adb6', brimUnder: '#3b3f47', brimUnderShade: '#25282e' },
      trim: { fringe: 0.5, rest: 0.6 }, // 가닥 길이 비율: 앞머리는 눈썹 위로, 옆은 귀 중간·뒤는 목덜미 위로
      side: 0.45, // 귀 앞 옆머리를 짧은 구레나룻으로
      bare: { trim: { fringe: 0.65, rest: 0.6 }, side: 0.6 }, // 모자를 안 쓸 때: 앞머리는 눈썹 위까지만 줄인다
      watch: { strap: '#22252b', strapShade: '#131418', case: '#2a2c33', face: '#0d1015', ring: '#ffb547' }, // 그늘색도 줄 색 계열(여자 주황 그늘이면 검은 줄이 그늘에서 주황으로 보였다)
    },
  };
  const SEASON = OPT.tp, ACC = new Set(String(OPT.ac).split('-').filter(Boolean)); // 옷(계절)·악세사리(컨트롤러)
  const OUT = { ...OUTFITS[CHAR], ...(!ACC.has('cap') && OUTFITS[CHAR].bare) }; // 모자를 안 쓰면 머리 손질을 바꾼다

  const UP = new THREE.Vector3(0, 1, 0);
  const MM = new THREE.Vector3(1e-3, 1e-3, 1e-3);
  const frameOf = (origin, x, y, z) => new THREE.Matrix4().makeBasis(x, y, z).scale(MM).setPosition(origin); // mm 틀 → 월드
  // 뼈에 틀째로 붙인다 → 뼈를 따라 움직인다
  function attach(bone, frame, obj) {
    obj.matrixAutoUpdate = false;
    obj.matrix.copy(bone.matrixWorld).invert().multiply(frame);
    bone.add(obj);
    return obj;
  }
  vrm.scene.updateMatrixWorld(true);
  const headBone = vrm.humanoid.getRawBoneNode('head');
  const facing = new THREE.Vector3(0, 0, isV0 ? -1 : 1).applyQuaternion(vrm.scene.quaternion);
  const HEAD = frameOf(headBone.getWorldPosition(new THREE.Vector3()), new THREE.Vector3().crossVectors(UP, facing), UP, facing);
  const HEAD_INV = HEAD.clone().invert();

  // ---- 골격 비율: 팔·다리·어깨·골반·머리를 실제 사람 비율로(키 대비, 남녀 따로) ----
  // 기준: ANSUR II(미군 6,068명) — 위팔 = 견봉~요골두 0.191H 에서 어깨관절(견봉 아래 ~4cm)만큼 뺀 관절 사이 길이,
  // 아래팔 = 요골두~경상돌기에서 손목관절까지, 어깨관절 사이 = 견봉 너비 - 5cm. 여자는 어깨가 좁고 골반·엉덩이가 넓다(엉덩이 폭 +10%).
  // VRoid 기본 체형은 위팔이 짧고 어깨가 좁고 무릎이 높고(정강이 > 허벅지) 머리가 크다(키의 1/6.6~1/7.2), 남녀 어깨·골반 차이가 없다.
  // 뼈에 크기를 주면 팔꿈치를 굽힐 때 아래팔이 찌그러져서(부모의 비균일 크기 × 회전) 쉬는 자세 자체를 고친다:
  // 마디마다 '쉬는 자세 변환'(제 마디는 뼈 방향으로 늘이고, 아래 사슬은 늘어난 만큼 밀어냄)을 쌓아 꼭짓점은 뼈 가중치로 섞어 옮기고,
  // 뼈를 새 자리로 옮긴 뒤 바인드 행렬을 다시 잡는다. 다리는 전체 길이를 그대로 두고 무릎만 옮긴다(발이 땅에서 안 뜨게)
  // 키 대비. shoulder = 양 어깨관절 사이, hipJoint = 양 고관절 사이, hipFlesh = 골반 살(엉덩이) 옆 폭 배율
  // 사용자 눈으로 다듬은 값: 여자 어깨는 실측(0.193)보다 좁게 — 어깨/엉덩이 1.03 에 가깝게, 남자 팔은 5% 짧게 —
  // VRoid 는 고관절이 높고(0.55H) 몸통이 짧아 실측 길이 그대로면 팔이 몸통에 비해 길어 보이고, 소매가 손목을 3cm 덮어 아래팔이 더 길어 보인다
  const REAL = {
    female: { upperArm: 0.165, foreArm: 0.141, shoulder: 0.185, hipJoint: 0.107, hipFlesh: 1.05 },
    male: { upperArm: 0.157, foreArm: 0.139, shoulder: 0.208 },
  }[CHAR];
  const HEAD_RATIO = 1 / 7.5; // 머리(턱~정수리) = 키의 1/7.5
  let headScale = 1;
  {
    const raw = (n) => vrm.humanoid.getRawBoneNode(n);
    let top = -Infinity, floor = Infinity, chin = Infinity;
    const v = new THREE.Vector3();
    vrm.scene.traverse((o) => {
      const name = o.isSkinnedMesh && [o.material].flat()[0].name;
      if (!/_SKIN/.test(name)) return;
      for (let i = 0, p = o.geometry.attributes.position; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        top = Math.max(top, v.y);
        floor = Math.min(floor, v.y);
        if (/Face/.test(name)) chin = Math.min(chin, v.y);
      }
    });
    // 키(정수리 ~ 발바닥)는 머리를 줄인 뒤의 키로 맞춘다: 몸 + 새 머리 = H, 새 머리 = H/7.5
    const headH = top - chin, H = (top - floor - headH) / (1 - HEAD_RATIO);
    headScale = Math.min(1, (HEAD_RATIO * H) / headH);

    const bones = [];
    vrm.scene.traverse((o) => { if (o.isBone) bones.push(o); }); // 부모 먼저
    const rest = new Map(bones.map((b) => [b, b.getWorldPosition(new THREE.Vector3())]));
    const restMatrix = new Map(bones.map((b) => [b, b.matrixWorld.clone()]));
    const M = new Map(bones.map((b) => [b, new THREE.Matrix4()]));
    const at = (b) => rest.get(b).clone().applyMatrix4(M.get(b));
    // bone→child 마디를 len 으로: 제 마디(와 사슬 밖 자손 — 소매 흔들림 뼈 등)는 관절 기준 뼈 방향으로 늘이고, child 사슬은 밀어낸다
    function setLength(bone, child, len) {
      const p = at(bone), a = at(child).sub(p), L = a.length();
      a.normalize();
      const k1 = len / L - 1;
      const S = new THREE.Matrix4().set(
        1 + k1 * a.x * a.x, k1 * a.x * a.y, k1 * a.x * a.z, 0,
        k1 * a.y * a.x, 1 + k1 * a.y * a.y, k1 * a.y * a.z, 0,
        k1 * a.z * a.x, k1 * a.z * a.y, 1 + k1 * a.z * a.z, 0,
        0, 0, 0, 1);
      S.premultiply(new THREE.Matrix4().makeTranslation(p.x, p.y, p.z)).multiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
      const T = new THREE.Matrix4().makeTranslation(a.x * (len - L), a.y * (len - L), a.z * (len - L));
      const chain = new Set();
      child.traverse((o) => chain.add(o));
      bone.traverse((o) => M.get(o)?.premultiply(chain.has(o) ? T : S));
    }
    const half = rest.get(raw('leftUpperArm')).distanceTo(rest.get(raw('rightUpperArm'))) / 2;
    const widen = (REAL.shoulder * H) / 2 - half; // 어깨: 남자는 넓히고 여자는 좁힌다
    for (const side of ['left', 'right']) {
      const sh = raw(`${side}Shoulder`), ua = raw(`${side}UpperArm`), la = raw(`${side}LowerArm`), hand = raw(`${side}Hand`);
      if (sh) setLength(sh, ua, at(sh).distanceTo(at(ua)) + widen);
      setLength(ua, la, REAL.upperArm * H);
      setLength(la, hand, REAL.foreArm * H);
      const ul = raw(`${side}UpperLeg`), ll = raw(`${side}LowerLeg`), foot = raw(`${side}Foot`);
      const leg = (at(ul).distanceTo(at(ll)) + at(ll).distanceTo(at(foot))) / 2; // 실제는 허벅지 ≈ 정강이
      setLength(ul, ll, leg);
      setLength(ll, foot, leg);
    }
    if (REAL.hipJoint) { // 여자 골반: 고관절을 옆으로 벌리고, 골반 살(hips 뼈 꼭짓점)을 옆으로 넓힌다. 허리(척추 쪽)는 그대로라 허리~엉덩이 곡선이 생긴다
      const across = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, isV0 ? -1 : 1).applyQuaternion(vrm.scene.quaternion));
      const hipsBone = raw('hips'), c = rest.get(hipsBone);
      const gap = (REAL.hipJoint * H - at(raw('leftUpperLeg')).distanceTo(at(raw('rightUpperLeg')))) / 2;
      for (const side of ['left', 'right']) {
        const ul = raw(`${side}UpperLeg`), out = across.clone().multiplyScalar(Math.sign(at(ul).sub(c).dot(across)) * gap);
        const T = new THREE.Matrix4().makeTranslation(out.x, out.y, out.z);
        ul.traverse((o) => M.get(o)?.premultiply(T));
      }
      const f = REAL.hipFlesh - 1, a = across;
      const S = new THREE.Matrix4().set(1 + f * a.x * a.x, f * a.x * a.y, f * a.x * a.z, 0, f * a.y * a.x, 1 + f * a.y * a.y, f * a.y * a.z, 0, f * a.z * a.x, f * a.z * a.y, 1 + f * a.z * a.z, 0, 0, 0, 0, 1);
      M.get(hipsBone).premultiply(new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(S).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z)));
    }
    const I = new THREE.Matrix4(), changed = new Set(bones.filter((b) => !M.get(b).equals(I)));
    const w = new THREE.Vector3(), acc = new THREE.Vector3(), tmp = new THREE.Vector3(), inv = new THREE.Matrix4();
    vrm.scene.traverse((mesh) => {
      if (!mesh.isSkinnedMesh) return;
      const g = mesh.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, sb = mesh.skeleton.bones;
      inv.copy(mesh.matrixWorld).invert();
      let dirty = false;
      for (let i = 0; i < pos.count; i++) {
        let hit = false, sum = 0;
        for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) > 0 && changed.has(sb[si.getComponent(i, c)])) hit = true;
        if (!hit) continue;
        w.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        acc.set(0, 0, 0);
        for (let c = 0; c < 4; c++) {
          const wt = sw.getComponent(i, c);
          if (!wt) continue;
          acc.addScaledVector(tmp.copy(w).applyMatrix4(M.get(sb[si.getComponent(i, c)])), wt);
          sum += wt;
        }
        acc.divideScalar(sum).applyMatrix4(inv);
        pos.setXYZ(i, acc.x, acc.y, acc.z);
        dirty = true;
      }
      if (dirty) { pos.needsUpdate = true; g.computeBoundingSphere(); }
    });
    for (const b of bones) {
      if (!changed.has(b)) continue;
      b.parent.updateWorldMatrix(true, false);
      b.position.copy(b.parent.worldToLocal(at(b)));
    }
    vrm.scene.updateMatrixWorld(true);
    // 바인드 역행렬은 '옮긴 만큼'만 고친다: 새 = 새뼈⁻¹ × 옛뼈 × 옛 역행렬
    // (calculateInverses 로 새로 잡으면 캐릭터를 돌려 둔 회전이 빠져 팔을 굽힐 때 엉뚱한 축으로 돈다)
    const skeletons = new Set(), fix = new THREE.Matrix4();
    vrm.scene.traverse((o) => { if (o.isSkinnedMesh) skeletons.add(o.skeleton); });
    for (const sk of skeletons) {
      sk.bones.forEach((b, i) => { if (changed.has(b)) sk.boneInverses[i].premultiply(restMatrix.get(b)).premultiply(fix.copy(b.matrixWorld).invert()); });
    }
    vrm.springBoneManager?.setInitState?.();
  }

  // ---- 체중 → 몸 두께: 쉬는 자세 메시를 뼈 둘레 방향으로만 부풀린다(길이·관절 자리·걸음은 그대로) ----
  // 키가 같으면 부피 ∝ 체중 → 둘레 배율 ≈ √(체중 / 기본 체중). ±15~20% 굵기까지가 자연스럽다(그 밖은 막는다).
  // 붙는 양은 부위마다 다르다: 배·엉덩이·허벅지가 많이, 위팔·가슴은 조금 덜, 팔뚝·종아리·목은 적게, 손·발·머리는 그대로.
  // 원래 옷 메시도 같은 뼈 가중치로 같이 부풀어 계속 맞는다. 몸통 축에서 먼 어깨 끝은 몸통 몫을 빼서(팔이 따로 부푼다) 어깨가 안 찢어진다
  const GIRTH = Math.min(1.2, Math.max(0.86, Math.sqrt((OPT.wt || WT_BASE[OPT.sx]) / WT_BASE[OPT.sx])));
  if (GIRTH !== 1) {
    vrm.scene.updateMatrixWorld(true);
    const P = (n) => vrm.humanoid.getRawBoneNode(n)?.getWorldPosition(new THREE.Vector3());
    const axis = (a, b) => { const p = P(a), q = P(b); return p && q ? { p, d: q.sub(p).normalize() } : null; };
    const facingW = new THREE.Vector3(0, 0, isV0 ? -1 : 1).applyQuaternion(vrm.scene.quaternion), acrossW = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), facingW);
    const torso = (re, ax, k, belly = 1) => ({ re, ax, k, belly, core: true });
    const REGIONS = [
      torso(/Bip_C_Hips$/, axis('hips', 'spine'), 1, 1.2),
      torso(/Bip_C_Spine$/, axis('spine', 'chest'), 1.1, 1.35), // 배가 먼저 나온다
      torso(/Bip_C_Chest$|Bust/, axis('chest', 'upperChest') ?? axis('chest', 'neck'), 0.85),
      torso(/Bip_C_UpperChest$/, axis('upperChest', 'neck'), 0.7),
      { re: /Bip_C_Neck$/, ax: axis('neck', 'head'), k: 0.35 },
    ];
    for (const [side, S] of [['left', 'L'], ['right', 'R']]) REGIONS.push(
      { re: new RegExp(`_${S}_UpperLeg$`), ax: axis(`${side}UpperLeg`, `${side}LowerLeg`), k: 1 },
      { re: new RegExp(`_${S}_LowerLeg$`), ax: axis(`${side}LowerLeg`, `${side}Foot`), k: 0.55 },
      { re: new RegExp(`_${S}_UpperArm$`), ax: axis(`${side}UpperArm`, `${side}LowerArm`), k: 0.9 },
      { re: new RegExp(`_${S}_(LowerArm|Elbow)$|J_Roll_${S}_Hand$`), ax: axis(`${side}LowerArm`, `${side}Hand`), k: 0.45 },
      { re: new RegExp(`_${S}_Shoulder$`), ax: axis(`${side}Shoulder`, `${side}UpperArm`), k: 0.5 },
    );
    const g = GIRTH - 1, p = new THREE.Vector3(), r = new THREE.Vector3(), disp = new THREE.Vector3(), inv = new THREE.Matrix4();
    vrm.scene.traverse((mesh) => {
      if (!mesh.isSkinnedMesh) return;
      const geo = mesh.geometry, pos = geo.attributes.position, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
      const region = mesh.skeleton.bones.map((b) => REGIONS.find((R) => R.ax && R.re.test(b.name)) ?? null);
      if (!region.some(Boolean)) return;
      inv.copy(mesh.matrixWorld).invert();
      let dirty = false;
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        disp.set(0, 0, 0);
        for (let c = 0; c < 4; c++) {
          const w = sw.getComponent(i, c), R = w && region[si.getComponent(i, c)];
          if (!R) continue;
          r.copy(p).sub(R.ax.p);
          r.addScaledVector(R.ax.d, -r.dot(R.ax.d)); // 뼈 축에서 수직으로 뻗은 방향
          let k = R.k;
          if (R.core) {
            k *= 1 - ease((Math.abs(r.dot(acrossW)) - 0.12) / 0.07); // 어깨 끝은 몸통 몫을 뺀다
            if (r.dot(facingW) > 0) k *= R.belly;
          }
          disp.addScaledVector(r, w * g * k);
        }
        if (disp.lengthSq() < 1e-12) continue;
        p.add(disp).applyMatrix4(inv);
        pos.setXYZ(i, p.x, p.y, p.z);
        dirty = true;
      }
      if (dirty) { pos.needsUpdate = true; geo.computeBoundingSphere(); }
    });
  }

  // 재질: 캐릭터 재질(MToon)을 복제한다 → 몸과 같은 빛 반응·외곽선. 원래 무늬(UV 그림)는 떼고 색이나 새 그림만 입힌다
  const UV_MAPS = ['map', 'normalMap', 'emissiveMap', 'shadeMultiplyTexture', 'shadingShiftTexture', 'rimMultiplyTexture', 'outlineWidthMultiplyTexture', 'uvAnimationMaskTexture'];
  const meshes = [];
  vrm.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const matsOf = (re) => {
    const mesh = meshes.find((o) => re.test([o.material].flat()[0].name));
    return mesh ? [mesh.material].flat() : null;
  };
  // 옷 재질의 바탕: 속옷만 입힌 모델은 상의가 없어서 신발 재질을 쓴다(같은 옷 셰이더)
  const CLOTH = matsOf(/Tops_\d+_CLOTH/) ?? matsOf(/Shoes_\d+_CLOTH/);
  function dress(src, color, shade = color, tex = null) {
    return src.map((m) => {
      const c = m.clone();
      for (const key of UV_MAPS) if (c[key]) c[key] = null;
      c.emissive?.setScalar(0); // 머리 재질은 주황 발광색을 마스크 그림으로 가려 쓴다 → 그림을 떼면 통째로 빛나서 끈다
      if (!m.isOutline) {
        c.color.set(color);
        c.shadeColorFactor.set(shade);
        if (tex) c.map = c.shadeMultiplyTexture = tex;
        if (FX) { c.shadeColorFactor.copy(c.color); c.shadeMultiplyTexture = c.map; }
      } else c.outlineColorFactor?.copy(new THREE.Color(shade).multiplyScalar(0.45)); // 외곽선은 그 옷의 어두운 톤 — 원래 옷의 검붉은 외곽선이 소매·장갑 끝 안쪽으로 비쳤다
      c.needsUpdate = true;
      return c;
    });
  }
  function wear(geo, mats) {
    if (mats.length > 1) mats.forEach((_, i) => geo.addGroup(0, Infinity, i)); // 면 + 외곽선
    const mesh = new THREE.Mesh(geo, mats.length > 1 ? mats : mats[0]);
    mesh.frustumCulled = false;
    return mesh;
  }
  function geometry(pos, uv, index, normal) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(index);
    if (normal) g.setAttribute('normal', new THREE.Float32BufferAttribute(normal, 3));
    else g.computeVertexNormals();
    return g;
  }

  // ---- 머리카락: 여자는 긴 가닥을 걷어 내고, 남자는 가닥을 줄이고, 둘 다 모자 속으로 눌러 넣는다(뒤통수 피부도) ----
  const cap = OUT.cap, CC = new THREE.Vector3(...cap.c), CR = new THREE.Vector3(...cap.r);
  // 모자 테두리 높이: 앞이 높고 뒤가 낮게 기운 띠. cosTh = 타원체 방위각(0 = 앞)의 cos
  const rimAt = (cosTh) => (cap.front + cap.back) / 2 + ((cap.front - cap.back) / 2) * cosTh;
  // blend: 테두리 아래로 점점 풀리는 폭(mm). 머리카락은 2.5cm(눌린 채 삐져나온 머리), 피부는 0(테두리 위만)
  function pressUnderCap(p, blend) {
    const ex = (p.x - CC.x) / CR.x, ey = (p.y - CC.y) / CR.y, ez = (p.z - CC.z) / CR.z, n = Math.hypot(ex, ey, ez);
    if (n <= 0.965) return false;
    const rim = rimAt(ez / (Math.hypot(ex, ez) || 1));
    const w = blend ? ease((p.y - rim + blend) / blend) : p.y > rim ? 1 : 0;
    if (w <= 0) return false;
    p.sub(CC).multiplyScalar((n + (0.965 - n) * w) / n).add(CC);
    return true;
  }
  const tailRoot = OUT.ponytail ? headBone.children.find((b) => OUT.ponytail.re.test(b.name)) ?? null : null;
  if (tailRoot && ACC.has('cap')) {
    // 꼬리 밑동(머리뼈에도 걸친 꼭짓점)을 뿌리 뼈에만 붙인다 → 뿌리를 옮기면 꼬리 전체가 늘어나지 않고 통째로 따라온다
    for (const mesh of meshes) {
      if (!mesh.isSkinnedMesh || !/HAIR/.test([mesh.material].flat()[0].name)) continue;
      const bones = mesh.skeleton.bones, rootIndex = bones.indexOf(tailRoot), si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
      if (rootIndex < 0) continue;
      for (let i = 0; i < si.count; i++) {
        let on = false;
        for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) > 0.05 && OUT.ponytail.re.test(bones[si.getComponent(i, c)].name)) on = true;
        if (!on) continue;
        for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) && !OUT.ponytail.re.test(bones[si.getComponent(i, c)].name)) si.setComponent(i, c, rootIndex);
      }
      si.needsUpdate = true;
    }
    tailRoot.position.copy(tailRoot.parent.worldToLocal(new THREE.Vector3(...OUT.ponytail.root).applyMatrix4(HEAD)));
    vrm.scene.updateMatrixWorld(true);
    vrm.springBoneManager?.setInitState?.();
  }
  if (OUT.trim) {
    for (const root of headBone.children.filter((b) => /Hair/.test(b.name))) {
      const z = root.getWorldPosition(new THREE.Vector3()).applyMatrix4(HEAD_INV).z;
      const f = z > 80 ? OUT.trim.fringe : OUT.trim.rest;
      root.scale.setScalar(f);
    }
    vrm.scene.updateMatrixWorld(true);
    vrm.springBoneManager?.setInitState?.(); // 줄인 길이로 흔들림 기준을 다시 잡는다
  }
  // 귀 앞 옆머리: 모자 밑으로 얼굴 옆을 볼·턱까지 덮던 가닥(뿌리가 귀보다 앞 · 옆)을 뿌리째 줄인다 — 길이·굵기가 함께 준다
  if (OUT.side) {
    for (const root of headBone.children.filter((b) => /Hair/.test(b.name))) {
      const p = root.getWorldPosition(new THREE.Vector3()).applyMatrix4(HEAD_INV);
      if (Math.abs(p.x) > 45 && p.z > 20) root.scale.multiplyScalar(OUT.side);
    }
    vrm.scene.updateMatrixWorld(true);
    vrm.springBoneManager?.setInitState?.();
  }
  for (const joint of vrm.springBoneManager?.joints ?? []) {
    if (!/Hair/.test(joint.bone.name) || OUT.ponytail?.re.test(joint.bone.name)) continue; // 포니테일은 원래 흔들림·충돌 그대로
    Object.assign(joint.settings, { stiffness: 4, dragForce: 1, gravityPower: 0 }); // 모자가 누르고 있어 거의 안 흔들린다
    joint.colliderGroups = []; // 머리를 줄이면 머리 충돌 구가 상대적으로 커져 앞머리를 챙 위로 밀어낸다
  }
  {
    const skinM = new THREE.Matrix4(), boneM = new THREE.Matrix4(), toWorld = new THREE.Matrix4(), toBind = new THREE.Matrix4(), v = new THREE.Vector3();
    for (const mesh of meshes) {
      const kind = [mesh.material].flat()[0].name;
      const hair = /HAIR/.test(kind), tail = hair && OUT.ponytail?.re;
      if (!mesh.isSkinnedMesh || !(hair || /_SKIN/.test(kind))) continue; // 몸 메시엔 뒤통수 피부도 있어서 함께 눌러 넣는다
      const g = mesh.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const bones = mesh.skeleton.bones, inverses = mesh.skeleton.boneInverses;
      // 걷어 낼 가닥에 조금이라도 붙은 꼭짓점의 삼각형을 접어 없앤다(외곽선도 같은 인덱스라 함께 빠진다)
      if (hair && OUT.cut && g.index) {
        const gone = new Uint8Array(pos.count);
        for (let i = 0; i < pos.count; i++) {
          for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) > 0.05 && OUT.cut.test(bones[si.getComponent(i, c)].name)) gone[i] = 1;
        }
        const idx = g.index.array;
        for (let t = 0; t < idx.length; t += 3) if (gone[idx[t]] || gone[idx[t + 1]] || gone[idx[t + 2]]) idx[t + 1] = idx[t + 2] = idx[t];
        g.index.needsUpdate = true;
      }
      // 쉬는 자세의 실제 자리(줄인 가닥 포함)에서 눌러 넣고, 그 자리로 가게 원래 좌표를 고쳐 쓴다
      for (let i = 0; i < pos.count; i++) {
        if (tail) { // 포니테일에 조금이라도 붙은 꼭짓점은 그대로(모자 뒤 구멍으로 나와 있다)
          let on = false;
          for (let c = 0; c < 4; c++) if (sw.getComponent(i, c) > 0.05 && tail.test(bones[si.getComponent(i, c)].name)) on = true;
          if (on) continue;
        }
        skinM.elements.fill(0);
        for (let c = 0; c < 4; c++) {
          const w = sw.getComponent(i, c);
          if (!w) continue;
          const b = si.getComponent(i, c);
          boneM.multiplyMatrices(bones[b].matrixWorld, inverses[b]);
          for (let e = 0; e < 16; e++) skinM.elements[e] += w * boneM.elements[e];
        }
        toWorld.multiplyMatrices(skinM, mesh.bindMatrix);
        v.fromBufferAttribute(pos, i).applyMatrix4(toWorld).applyMatrix4(HEAD_INV);
        if (!ACC.has('cap') || !pressUnderCap(v, hair ? 25 : 0)) continue; // 모자를 안 쓰면 머리를 안 누른다
        v.applyMatrix4(HEAD).applyMatrix4(toBind.copy(toWorld).invert());
        pos.setXYZ(i, v.x, v.y, v.z);
      }
      pos.needsUpdate = true;
    }
  }

  // ---- 모자: 6쪽 돔(솔기·통풍 구멍) + 앞챙 + 꼭지 단추 ----
  // 포니테일이 모자를 빠져나오는 높이: 묶은 뿌리를 돔 중심에서 바깥으로 비춘 자리(뒤 가운데)
  const holeY = tailRoot ? (() => {
    const p = tailRoot.getWorldPosition(new THREE.Vector3()).applyMatrix4(HEAD_INV).sub(CC);
    return CC.y + p.y / Math.hypot(p.x / CR.x, p.y / CR.y, p.z / CR.z);
  })() : null;
  function capTexture() {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 64;
    const x = cv.getContext('2d');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, 512, 64);
    for (let k = 0; k < 6; k++) { // 솔기: 앞 가운데를 비우고 60° 마다
      const u = ((0.5 + (2 * k + 1) / 12) % 1) * 512;
      x.fillStyle = 'rgba(0,0,0,0.16)';
      x.fillRect(u - 1, 0, 2, 64);
      x.fillStyle = 'rgba(0,0,0,0.1)';
      for (let v = 2; v < 64; v += 4) { x.fillRect(u - 4, v, 1, 2); x.fillRect(u + 3, v, 1, 2); }
    }
    x.fillStyle = 'rgba(0,0,0,0.2)'; // 옆 판 통풍 구멍
    for (const uc of [0.5 - 1 / 6, 0.5 + 1 / 6]) {
      for (let r = 0; r < 4; r++) for (let c = -3; c <= 3; c++) { x.beginPath(); x.arc(uc * 512 + c * 7 + (r % 2) * 3.5, 24 + r * 6, 1.3, 0, Math.PI * 2); x.fill(); }
    }
    x.fillStyle = 'rgba(0,0,0,0.1)'; // 테두리 바이어스
    x.fillRect(0, 59, 512, 5);
    if (holeY !== null) { // 뒤 구멍: 포니테일이 빠져나오는 자리
      const vOf = (y) => Math.acos((y - CC.y) / CR.y) / Math.acos((cap.back - CC.y) / CR.y);
      const y0 = holeY, v0 = vOf(y0 + 16) * 64, v1 = vOf(y0 - 14) * 64, du = (26 / (2 * Math.PI * CR.z)) * 512;
      x.fillStyle = '#3a261e';
      for (const u of [0, 512]) { x.beginPath(); x.ellipse(u, (v0 + v1) / 2, du, (v1 - v0) / 2, 0, 0, Math.PI * 2); x.fill(); }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    return tex;
  }
  // 돔: 방위각마다 꼭대기에서 테두리까지(이음매는 뒤). 법선은 타원체에서 바로 구한다
  function domeGeometry() {
    const NA = 48, NV = 12, pos = [], uv = [], normal = [], index = [];
    for (let i = 0; i <= NA; i++) {
      const th = Math.PI + (i / NA) * Math.PI * 2, s = Math.sin(th), c = Math.cos(th);
      const psiRim = Math.acos(Math.min(1, Math.max(-1, (rimAt(c) - CC.y) / CR.y)));
      for (let j = 0; j <= NV; j++) {
        const psi = (psiRim * j) / NV, ex = Math.sin(psi) * s, ey = Math.cos(psi), ez = Math.sin(psi) * c;
        pos.push(CC.x + CR.x * ex, CC.y + CR.y * ey, CC.z + CR.z * ez);
        normal.push(...new THREE.Vector3(ex / CR.x, ey / CR.y, ez / CR.z).normalize().toArray());
        uv.push(i / NA, j / NV);
      }
    }
    for (let i = 0; i < NA; i++) {
      for (let j = 0; j < NV; j++) {
        const a = i * (NV + 1) + j, b = a + NV + 1;
        index.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    return geometry(pos, uv, index, normal);
  }
  // 앞챙: 테두리 앞쪽 ±56° 를 따라 붙어 앞으로 뻗고 14° 숙인다(양끝은 더 숙여 둥글게 감싼다). 가운데가 가장 길고 양끝은 돔에 녹아든다. 두께 3mm
  function brimGeometry(part = 'all') { // part: 'top' = 윗면만, 'under' = 아랫면·가장자리(챙 밑을 다른 색으로)
    const TH = 0.98, NI = 24, NJ = 6, T = 3, pos = [], uv = [], index = [];
    const at = (th, s, dy) => {
      const sn = Math.sin(th), cs = Math.cos(th), rim = rimAt(cs);
      const sp = Math.sin(Math.acos(Math.min(1, Math.max(-1, (rim - CC.y) / CR.y))));
      const out = new THREE.Vector2(sn / CR.x, cs / CR.z).normalize(); // 테두리에서 바깥(타원 법선)
      const len = cap.brim * Math.cos((th / TH) * Math.PI / 2) * s;
      return [CC.x + CR.x * sp * sn + out.x * len, rim - len * (0.25 + (30 / cap.brim) * Math.abs(th / TH) ** 1.6) + dy, CC.z + CR.z * sp * cs + out.y * len];
    };
    for (const dy of [T / 2, -T / 2]) {
      for (let i = 0; i <= NI; i++) for (let j = 0; j <= NJ; j++) { pos.push(...at(-TH + (2 * TH * i) / NI, -0.06 + (1.06 * j) / NJ, dy)); uv.push(0, 0); }
    }
    const row = NJ + 1, half = (NI + 1) * row;
    for (let i = 0; i < NI; i++) {
      for (let j = 0; j < NJ; j++) {
        const a = i * row + j, b = a + row;
        if (part !== 'under') index.push(a, a + 1, b, b, a + 1, b + 1); // 윗면
        if (part !== 'top') index.push(half + a, half + b, half + a + 1, half + b, half + b + 1, half + a + 1); // 아랫면
      }
      const a = i * row + NJ, b = a + row; // 바깥 가장자리
      if (part !== 'top') index.push(a, half + a, b, b, half + a, half + b);
    }
    return geometry(pos, uv, index);
  }
  if (ACC.has('cap')) {
    const domeMats = dress(CLOTH, cap.color, cap.shade, capTexture());
    domeMats[0].side = THREE.DoubleSide; // 밑에서 보면 안감이 보인다
    const button = new THREE.SphereGeometry(7, 12, 6).scale(1, 0.45, 1).translate(CC.x, CC.y + CR.y, CC.z);
    const group = new THREE.Group();
    // 챙 밑·가장자리는 다른 색(brimUnder) — 같은 색이면 정면에서 챙이 안 보여 모자가 바가지(헬멧)처럼 보였다(사용자 지적 2026-11-05)
    const brimUnder = dress(CLOTH, cap.brimUnder ?? cap.color, cap.brimUnderShade ?? cap.shade);
    group.add(wear(domeGeometry(), domeMats), wear(brimGeometry('top'), dress(CLOTH, cap.color, cap.shade)), wear(brimGeometry('under'), brimUnder), wear(button, dress(CLOTH, cap.color, cap.shade)));
    attach(headBone, HEAD, group);
  }

  // ---- 선글라스: 얼굴 앞을 감싸는 스포츠 고글형 렌즈 한 장 + 위 테 + 귀까지 다리. 눈 높이·얼굴 앞은 쉬는 자세에서 잰다 ----
  // (머리를 줄이기 전에 머리뼈에 붙여야 같이 줄어든다)
  let lensMat = null; // 선글라스 렌즈(밤엔 시간 빛깔로 어두워진다 — applyTime)
  if (ACC.has('sun')) {
    const eye = ['leftEye', 'rightEye'].map((n) => vrm.humanoid.getRawBoneNode(n).getWorldPosition(new THREE.Vector3()).applyMatrix4(HEAD_INV));
    const ey = (eye[0].y + eye[1].y) / 2;
    let zf = 0;
    const v = new THREE.Vector3(), facePts = [];
    for (const f of meshes.filter((o) => o.isSkinnedMesh && /Face_00_SKIN/.test([o.material].flat()[0].name))) {
      for (let i = 0, a = f.geometry.attributes.position; i < a.count; i++) {
        v.fromBufferAttribute(a, i).applyMatrix4(f.matrixWorld).applyMatrix4(HEAD_INV);
        if (Math.abs(v.y - ey) < 14 && Math.abs(v.x) < 45) zf = Math.max(zf, v.z);
        if (Math.abs(v.y - ey) < 40) facePts.push([v.x, v.y, v.z]);
      }
    }
    // 러닝 쉴드형(가이드 공통: 얼굴을 감싸는 랩 + 위 테만 있는 하프림 + 코받침·귀걸이 고정 + 눈썹과 렌즈 사이 통풍 틈)
    // 예전 판(같은 높이 띠 · 불투명 남색 · 곧은 막대 다리)은 정면에서 눈가리개처럼 보였고 다리 끝이 머리카락 밖으로 삐져나왔다
    const skinSide = (z, y0 = ey - 14, y1 = ey + 24) => { // 그 깊이·높이 범위에서 얼굴(머리) 옆 피부 폭
      let m = 0;
      for (const f of meshes.filter((o) => o.isSkinnedMesh && /_SKIN/.test([o.material].flat()[0].name))) {
        for (let i = 0, a = f.geometry.attributes.position; i < a.count; i++) {
          v.fromBufferAttribute(a, i).applyMatrix4(f.matrixWorld).applyMatrix4(HEAD_INV);
          if (Math.abs(v.z - z) < 12 && v.y > y0 && v.y < y1) m = Math.max(m, Math.abs(v.x)); // 남자 얼굴은 꼭짓점이 성겨 넉넉히
        }
      }
      return m;
    };
    // 렌즈 곡면(위에서 본 원호): 콧등 9mm 앞(z0)을 지나 관자놀이 피부 6mm 바깥(xEnd, zEnd)에서 끝난다
    const z0 = zf + 9, zEnd = zf - 40, xEnd = Math.max(skinSide(zEnd), 62) + 6; // (못 재면 렌즈가 작은 원통을 감아 콧등만 가렸다)
    const zc = (z0 * z0 - xEnd * xEnd - zEnd * zEnd) / (2 * (z0 - zEnd)), R = z0 - zc, SPAN = Math.atan2(xEnd, zEnd - zc);
    const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    // 윤곽: 위 = 눈썹선(끝으로 갈수록 살짝 내려옴), 아래 = 가운데 콧등 홈 · 눈 밑 · 바깥 끝은 위로 쓸려 올라간다. 끝은 둥글게 모인다
    const top = (a) => { const u = Math.abs(a) / SPAN; return ey + 19 - 6 * u * u - 7 * smooth(0.82, 1, u); };
    const bottom = (a) => { const u = Math.abs(a) / SPAN; return ey - 23 + 19 * Math.exp(-((a / 0.16) ** 2)) + 12 * smooth(0.55, 1, u) + 6 * smooth(0.85, 1, u); };
    const tilt = (y) => 0.1 * (y - ey - 2); // 앞기울기(아래가 볼 쪽으로 ~6°)
    const at = (a, y, out = 0) => [(R + out) * Math.sin(a), y, zc + (R + out) * Math.cos(a) + tilt(y)];
    const sheet = (y0f, y1f, out, NA, NY) => { // 곡면 조각: 열마다 y0f(a)~y1f(a). uv = (a/SPAN, 아래→위 0~1)
      const pos = [], uv = [], index = [];
      for (let i = 0; i <= NA; i++) {
        const a = -SPAN + (2 * SPAN * i) / NA, y0 = y0f(a), y1 = y1f(a);
        for (let j = 0; j <= NY; j++) { pos.push(...at(a, y0 + ((y1 - y0) * j) / NY, out)); uv.push(a / SPAN, j / NY); }
      }
      for (let i = 0; i < NA; i++) for (let j = 0; j < NY; j++) {
        const p = i * (NY + 1) + j, q = p + NY + 1;
        index.push(p, q, p + 1, p + 1, q, q + 1);
      }
      return geometry(pos, uv, index);
    };
    const FRAME = () => dress(CLOTH, '#1a1c22', '#0c0d10');
    // 렌즈: 위는 하늘이 비친 미러, 가운데·아래는 반투명이라 눈이 비친다(브리핑 때 표정이 살아야 한다) + 사선 하이라이트 두 줄
    lensMat = new THREE.ShaderMaterial({
      uniforms: { tint: { value: new THREE.Color(1, 1, 1) }, ey: { value: ey } },
      vertexShader: /* glsl */`
        varying vec2 vUv; varying vec3 vP;
        void main() { vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 tint; uniform float ey;
        varying vec2 vUv; varying vec3 vP;
        void main() {
          float t = vUv.y;
          vec3 c = mix(vec3(0.05, 0.07, 0.14), vec3(0.13, 0.20, 0.42), smoothstep(0.0, 0.7, t));
          c = mix(c, vec3(0.36, 0.42, 0.86), smoothstep(0.7, 1.0, t)); // 위쪽: 청보라 미러 코팅에 하늘이 비친다
          float a = mix(0.88, 0.97, smoothstep(0.4, 1.0, t)); // 눈은 어렴풋이(섞기가 선형 공간이라 0.74 면 피부가 회색으로 훤히 비쳤다)
          float d = (vP.x - 26.0) + 0.85 * (vP.y - ey);
          float hl = (1.0 - smoothstep(2.0, 3.2, abs(d))) * 0.7 + (1.0 - smoothstep(0.6, 1.4, abs(d - 8.0))) * 0.45;
          hl *= smoothstep(0.08, 0.3, t) * (1.0 - smoothstep(0.88, 1.0, t));
          c = mix(c, vec3(1.0), hl);
          gl_FragColor = vec4(pow(c, vec3(2.2)) * tint, max(a, hl));
        }
      `,
      transparent: true, side: THREE.DoubleSide,
    });
    const group = new THREE.Group();
    group.add(wear(sheet(bottom, top, 0, 56, 10), [lensMat, FRAME()[1]])); // 렌즈 + 테두리 외곽선
    group.add(wear(sheet((a) => top(a) - 2.4, (a) => top(a) + 1.6, 1.2, 56, 1), FRAME())); // 위 테(하프림)
    const tube = (pts, r) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), 24, r, 8, false);
    // 코받침: 렌즈 콧등 홈 양옆에서 코 옆면에 닿는 고무 받침
    // 그 자리 얼굴 앞면 z. 남자 얼굴은 꼭짓점이 성겨 3mm 안에 없으면 -1e9 가 돼 코받침 막대가 머리 뒤로 끝없이 뻗었다 → 넓혀 찾고, 없으면 렌즈 12mm 뒤
    const faceAt = (x, y) => { let m = -1e9; for (const p of facePts) if (Math.abs(p[0] - x) < 6 && Math.abs(p[1] - y) < 6) m = Math.max(m, p[2]); return m > -1e8 ? m : z0 - 12; };
    for (const sgn of [1, -1]) {
      const x = sgn * 9, y = ey - 3, pad = [x, y, faceAt(x, y) + 2]; // 렌즈 뒤에 숨는 높이(받침 막대는 빼고 받침만 — 렌즈 너머로 검은 점처럼 보였다)
      const p = new THREE.CapsuleGeometry(1.8, 4, 4, 8).rotateZ(sgn * 0.5).translate(...pad);
      group.add(wear(p, dress(CLOTH, '#a3a8b0', '#7d828a'))); // 연회색 실리콘
    }
    // 다리: 경첩(렌즈 바깥 위 끝)에서 머리 옆면을 따라 귀 위를 지나 귀 뒤로 살짝 내려간다(끝은 미끄럼 방지 고무)
    const s10 = skinSide(10, ey + 12, ey + 30), sBack = skinSide(-40, ey + 12, ey + 30), side = (z) => s10 + ((sBack - s10) * (10 - z)) / 50 + 3; // 귀보다 위에서 잰 머리통 폭(귀까지 재면 귀 뒤 고무 끝이 머리카락 밖으로 나왔다)
    for (const sgn of [1, -1]) {
      const h = at(sgn * SPAN * 0.985, top(SPAN) - 2.5, -0.5);
      group.add(wear(new THREE.BoxGeometry(5, 6, 9).translate(h[0] - sgn * 1.5, h[1], h[2] - 3), FRAME())); // 경첩
      const path = [[h[0], h[1], h[2] - 6], [sgn * side(zEnd - 25), ey + 9, zEnd - 25], [sgn * side(10), ey + 8, 10], [sgn * side(-18), ey + 6, -18]];
      group.add(wear(tube(path, 1.8), FRAME()));
      group.add(wear(tube([[sgn * side(-18), ey + 6, -18], [sgn * side(-26), ey + 1, -26], [sgn * side(-32), ey - 9, -32]], 2.6), dress(CLOTH, '#2a2d34', '#15171b'))); // 귀걸이 고무
    }
    attach(headBone, HEAD, group);
  }

  // 머리 크기: 모자·꼬리까지 붙인 뒤 머리 뼈째 줄인다(같이 줄어든다)
  headBone.scale.setScalar(headScale);
  vrm.scene.updateMatrixWorld(true);
  vrm.springBoneManager?.setInitState?.();

  // ---- 워치: 왼손목(카메라 쪽) 손등 쪽에 둥근 러닝 워치. 손목 굵기는 피부 꼭짓점에서 잰다 ----
  if (ACC.has('watch')) {
    const WA = OUT.watch;
    const arm = vrm.humanoid.getRawBoneNode('leftLowerArm');
    const A0 = arm.getWorldPosition(new THREE.Vector3()), A1 = vrm.humanoid.getRawBoneNode('leftHand').getWorldPosition(new THREE.Vector3());
    const ax = A1.clone().sub(A0).normalize(), dorsal = UP.clone().addScaledVector(ax, -UP.dot(ax)).normalize(); // 쉬는 자세(T자)는 손등이 위
    const across = new THREE.Vector3().crossVectors(ax, dorsal), at = A1.clone().addScaledVector(ax, -0.035); // 손목뼈에서 3.5cm 팔꿈치 쪽
    const skin = meshes.find((o) => /Body_00_SKIN/.test([o.material].flat()[0].name));
    let ry = 0.015, rz = 0.02;
    for (let i = 0, p = new THREE.Vector3(), sp = skin.geometry.attributes.position; i < sp.count; i++) {
      p.fromBufferAttribute(sp, i).applyMatrix4(skin.matrixWorld).sub(at);
      if (Math.abs(p.dot(ax)) > 0.008 || p.length() > 0.05) continue;
      ry = Math.max(ry, Math.abs(p.dot(dorsal)));
      rz = Math.max(rz, Math.abs(p.dot(across)));
    }
    const sleeveOff = ACC.has('jacket') ? 10.5 : SEASON === 'winter' ? 7.5 : 0; // 겨울은 긴팔(띄움 6.5mm) 위, 바람막이면 소매 고무단(9mm) 위에 찬다
    ry = ry * 1000 + 1.2 + sleeveOff;
    rz = rz * 1000 + 1.2 + sleeveOff;
    // 줄: 손목 단면 타원을 따라 납작한 띠(폭 20mm·두께 2.6mm)를 두른다
    const prof = [[-10, 0.3], [-10, 2.2], [-9.2, 2.6], [9.2, 2.6], [10, 2.2], [10, 0.3], [9.2, 0], [-9.2, 0], [-10, 0.3]];
    const NA = 40, pos = [], uv = [], index = [];
    for (let i = 0; i <= NA; i++) {
      const a = (i / NA) * Math.PI * 2, nE = new THREE.Vector2(Math.cos(a) / ry, Math.sin(a) / rz).normalize();
      for (const [x, o] of prof) { pos.push(x, ry * Math.cos(a) + nE.x * o, rz * Math.sin(a) + nE.y * o); uv.push(0, 0); }
    }
    const NP = prof.length;
    for (let i = 0; i < NA; i++) {
      for (let k = 0; k < NP - 1; k++) {
        const a = i * NP + k, b = a + NP;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const top = ry + 2.6;
    const watch = new THREE.Group();
    const caseGeo = new THREE.CylinderGeometry(16, 16.5, 8, 32).translate(0, top + 4, 0);
    const bezel = new THREE.TorusGeometry(15.6, 1.4, 6, 32).rotateX(-Math.PI / 2).translate(0, top + 8, 0);
    const screen = new THREE.Mesh(new THREE.CircleGeometry(14.2, 32).rotateX(-Math.PI / 2).translate(0, top + 8.2, 0), new THREE.MeshBasicMaterial({ color: WA.face }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(10.5, 12.5, 40, 1, Math.PI / 2, Math.PI * 1.4).rotateX(-Math.PI / 2).translate(0, top + 8.4, 0), new THREE.MeshBasicMaterial({ color: WA.ring }));
    watch.add(wear(geometry(pos, uv, index), dress(CLOTH, WA.strap, WA.strapShade)), wear(caseGeo, dress(CLOTH, WA.case, '#16171b')), wear(bezel, dress(CLOTH, '#5a5f6a', '#30333a')), screen, ring);
    attach(arm, frameOf(at, ax, dorsal, across), watch);
  }

  // ---- 몸에 붙는 옷: 피부를 한 겹 띄워 입힌다(상의·하의·양말·장갑·마스크·넥워머·조끼) ----
  // 같은 뼈대로 움직여 몸에 딱 붙고(여자 가슴 라인도 그대로 드러난다), 팔을 흔들어도 접히거나 뚫리지 않는다.
  // pick(p, w): 입힐 꼭짓점인가(p = 쉬는 자세 월드 위치, w = 뼈 이름별 가중치). edge(p): 경계 밖 꼭짓점을 단으로 되민다(단이 반듯하다).
  // off: 피부에서 띄우는 거리(m) — 겹쳐 입는 순서대로 커진다(맨살 1.5 < 상의·하의 3 < 양말 3.5 < 시보리 8 < 겉옷 9 < 넥워머·조끼 12)
  // 두 모델 모두 속옷만 입은 몸이다(속옷은 몸 텍스처 그림 — 피부가 다 남아 있다)
  const SKINS = meshes.filter((o) => o.isSkinnedMesh && /Body_00_SKIN/.test([o.material].flat()[0].name));
  const FACES = meshes.filter((o) => o.isSkinnedMesh && /Face_00_SKIN/.test([o.material].flat()[0].name));
  const wsum = (w, re) => Object.entries(w).reduce((a, [k, v]) => a + (re.test(k) ? v : 0), 0);
  const HANDS = /Bip_[LR]_Hand|Thumb|Index|Middle|Ring|Little/, ARMS = // 손 = 손뼈·손가락(팔뚝 비틀림 보조뼈 J_Roll_L_Hand 는 팔뚝이다)
    /UpperArm|LowerArm|Elbow|Hand|Thumb|Index|Middle|Ring|Little/; // 팔꿈치 보조뼈(J_Roll_Elbow)도 팔
  const LEGS_RE = /UpperLeg|LowerLeg|Foot|Toe/, HEADS = /Neck|Head|Eye|Jaw/;
  // 옷 밑 피부 밀어 넣기: 옷을 다 지은 뒤 한꺼번에(먼저 밀면 뒤에 짓는 옷의 띄움 기준이 달라진다)
  const TUCK = new Map(); // 피부 메시 → 꼭짓점별 밀어 넣을 거리(m)
  function tuckAt(skin, i, d) {
    let a = TUCK.get(skin);
    if (!a) TUCK.set(skin, (a = new Float32Array(skin.geometry.attributes.position.count)));
    a[i] = Math.max(a[i], d);
  }
  function applyTuck() {
    for (const [skin, a] of TUCK) {
      const sp = skin.geometry.attributes.position, sn = skin.geometry.attributes.normal;
      for (let i = 0; i < sp.count; i++) if (a[i]) sp.setXYZ(i, sp.getX(i) - sn.getX(i) * a[i], sp.getY(i) - sn.getY(i) * a[i], sp.getZ(i) - sn.getZ(i) * a[i]);
      sp.needsUpdate = true;
    }
  }
  const weightsOf = (skin, i, w) => {
    const g = skin.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, sb = skin.skeleton.bones;
    for (const k in w) delete w[k];
    for (let c = 0; c < 4; c++) {
      const v = sw.getComponent(i, c);
      if (v) { const k = sb[si.getComponent(i, c)].name; w[k] = (w[k] || 0) + v; }
    }
    return w;
  };
  let OUTER = SKINS; // 몸통 가장 바깥 옷(조끼·물병을 그 위에 얹는다): 옷을 입힐 때마다 갈아 끼운다
  // 잘게 쪼개기: 삼각형 하나를 넷으로(가장자리 가운데 점은 이웃과 같이 쓴다, 뼈 가중치는 두 끝점을 섞는다)
  // — 성긴 옷(삼각형 3~4cm) 위에 무늬(조끼)를 오려 낼 때 가장자리가 계단처럼 깨지지 않게
  function subdivide(g) {
    const pos = Array.from(g.attributes.position.array), nor = Array.from(g.attributes.normal.array), uv = g.attributes.uv ? Array.from(g.attributes.uv.array) : null;
    const si = Array.from(g.attributes.skinIndex.array), sw = Array.from(g.attributes.skinWeight.array), mids = new Map(), out = [], idx = g.index.array;
    const mid = (a, b) => {
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (mids.has(key)) return mids.get(key);
      const m = pos.length / 3, n = [0, 1, 2].map((c) => (nor[a * 3 + c] + nor[b * 3 + c]) / 2), nl = Math.hypot(...n) || 1;
      for (let c = 0; c < 3; c++) { pos.push((pos[a * 3 + c] + pos[b * 3 + c]) / 2); nor.push(n[c] / nl); }
      if (uv) for (let c = 0; c < 2; c++) uv.push((uv[a * 2 + c] + uv[b * 2 + c]) / 2);
      const w = new Map();
      for (const v of [a, b]) for (let c = 0; c < 4; c++) if (sw[v * 4 + c]) w.set(si[v * 4 + c], (w.get(si[v * 4 + c]) || 0) + sw[v * 4 + c] / 2);
      const top = [...w].sort((x, y) => y[1] - x[1]).slice(0, 4), sum = top.reduce((t, [, x]) => t + x, 0);
      for (let c = 0; c < 4; c++) { si.push(top[c]?.[0] ?? 0); sw.push(top[c] ? top[c][1] / sum : 0); }
      mids.set(key, m);
      return m;
    };
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      if (a === b || b === c || a === c) continue;
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      out.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    ng.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    if (uv) ng.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    ng.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    ng.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    ng.setIndex(out);
    return ng;
  }
  // 쪼갠 본뜨기: 원래 메시 자리·뼈대 그대로, 모양만 잘게 (피부 밀어 넣기는 원본에 안 닿으므로 tuck 은 끈다)
  const fineCopy = (skin, levels = 2) => {
    let geometry = skin.geometry;
    for (let i = 0; i < levels; i++) geometry = subdivide(geometry);
    // 같은 자리 점(무늬 이음매)은 띄우는 방향을 하나로 — 따로 띄우면 이음매가 갈라져 틈이 보인다
    const pa = geometry.attributes.position, na = geometry.attributes.normal, sum = new Map(), key = (i) => `${Math.round(pa.getX(i) * 1e4)},${Math.round(pa.getY(i) * 1e4)},${Math.round(pa.getZ(i) * 1e4)}`;
    for (let i = 0; i < pa.count; i++) { const k = key(i), v = sum.get(k) ?? [0, 0, 0]; v[0] += na.getX(i); v[1] += na.getY(i); v[2] += na.getZ(i); sum.set(k, v); }
    for (let i = 0; i < pa.count; i++) { const v = sum.get(key(i)), l = Math.hypot(...v) || 1; na.setXYZ(i, v[0] / l, v[1] / l, v[2] / l); }
    return { geometry, matrixWorld: skin.matrixWorld, skeleton: skin.skeleton, bindMatrix: skin.bindMatrix, parent: skin.parent, position: skin.position, quaternion: skin.quaternion, scale: skin.scale };
  };
  function skinShell({ src = SKINS, pick, edge, off = 0.003, color, shade = color, tuck = true, fine = false }) {
    const made = [];
    for (const skin of fine ? src.map((o) => fineCopy(o)) : src) {
      const g = skin.geometry, sp = g.attributes.position, sn = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, sb = skin.skeleton.bones;
      const toLocal = skin.matrixWorld.clone().invert(), p = new THREE.Vector3(), n = new THREE.Vector3(), nw = new THREE.Vector3();
      const keep = new Uint8Array(sp.count), pos = new Float32Array(sp.count * 3), w = {};
      for (let i = 0; i < sp.count; i++) {
        for (const k in w) delete w[k];
        for (let c = 0; c < 4; c++) {
          const v = sw.getComponent(i, c);
          if (v) { const k = sb[si.getComponent(i, c)].name; w[k] = (w[k] || 0) + v; }
        }
        p.fromBufferAttribute(sp, i).applyMatrix4(skin.matrixWorld);
        keep[i] = pick(p, w) ? 1 : 0;
        const o = typeof off === 'function' ? off(p, nw.fromBufferAttribute(sn, i).transformDirection(skin.matrixWorld)) : off;
        if (keep[i] && tuck && !fine && o > 0) tuckAt(skin, i, Math.min(o, 0.003));
        if (!keep[i]) edge?.(p, w);
        p.applyMatrix4(toLocal).addScaledVector(n.fromBufferAttribute(sn, i), o).toArray(pos, i * 3);
      }
      const index = [], idx = g.index.array;
      for (let t = 0; t < idx.length; t += 3) {
        const k = keep[idx[t]] + keep[idx[t + 1]] + keep[idx[t + 2]];
        if (edge ? k > 0 : k === 3) index.push(idx[t], idx[t + 1], idx[t + 2]); // 단이 있으면 걸친 삼각형까지(넘친 꼭짓점은 단에 붙였다)
      }
      if (!index.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      for (const key of ['normal', 'uv', 'skinIndex', 'skinWeight']) geo.setAttribute(key, g.attributes[key]);
      geo.setIndex(index);
      const mats = dress(CLOTH, color, shade);
      mats.forEach((_, i) => geo.addGroup(0, Infinity, i));
      const mesh = new THREE.SkinnedMesh(geo, mats);
      mesh.frustumCulled = false;
      mesh.position.copy(skin.position);
      mesh.quaternion.copy(skin.quaternion);
      mesh.scale.copy(skin.scale);
      skin.parent.add(mesh);
      mesh.bind(skin.skeleton, skin.bindMatrix);
      mesh.updateMatrixWorld(true); // 바로 위에 또 입힐 수 있게(조끼) 월드 행렬을 지금 채운다
      made.push(mesh);
    }
    return made;
  }
  // 잘라 입히기: field(p, w) = 무늬 안쪽까지의 거리(m, + 안 · − 밖). 경계(0)를 지나는 삼각형은 그 선을 따라 잘라
  // 새 꼭짓점(위치·법선·UV·뼈 가중치를 섞음)을 만든다 → 가장자리가 삼각형 크기와 상관없이 매끈한 선이 된다
  function clipShell({ src, field, off, color, shade, fine = true }) {
    const made = [];
    // 이미 잘게 쪼갠 옷(크루넥 등으로 오린 것) 위에 또 오릴 땐 다시 쪼개지 않는다 — 겹치면 삼각형이 16배씩 불어난다
    const split = fine && !src.every((o) => o.userData.fine);
    for (const skin of split ? src.map((o) => fineCopy(o)) : src) {
      const g = skin.geometry, sp = g.attributes.position, sn = g.attributes.normal, su = g.attributes.uv, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const p = new THREE.Vector3(), nw = new THREE.Vector3(), w = {}, F = new Float32Array(sp.count);
      const pos = [], nor = [], uv = [], bi = [], bw = [];
      for (let i = 0; i < sp.count; i++) {
        nw.fromBufferAttribute(sn, i).transformDirection(skin.matrixWorld);
        F[i] = field(p.fromBufferAttribute(sp, i).applyMatrix4(skin.matrixWorld), weightsOf(skin, i, w), nw);
        for (let c = 0; c < 3; c++) { pos.push(sp.getComponent(i, c) + sn.getComponent(i, c) * off); nor.push(sn.getComponent(i, c)); }
        if (su) uv.push(su.getX(i), su.getY(i));
        for (let c = 0; c < 4; c++) { bi.push(si.getComponent(i, c)); bw.push(sw.getComponent(i, c)); }
      }
      const cuts = new Map();
      const cut = (a, b) => { // a(안)–b(밖) 변에서 field = 0 인 점
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        if (cuts.has(key)) return cuts.get(key);
        const t = F[a] / (F[a] - F[b]), m = pos.length / 3, mix = (arr, n, k) => arr[a * n + k] + (arr[b * n + k] - arr[a * n + k]) * t;
        for (let c = 0; c < 3; c++) { pos.push(mix(pos, 3, c)); nor.push(mix(nor, 3, c)); }
        if (su) uv.push(mix(uv, 2, 0), mix(uv, 2, 1));
        const ww = new Map();
        for (const [v, k] of [[a, 1 - t], [b, t]]) for (let c = 0; c < 4; c++) if (bw[v * 4 + c]) ww.set(bi[v * 4 + c], (ww.get(bi[v * 4 + c]) || 0) + bw[v * 4 + c] * k);
        const top = [...ww].sort((x, y) => y[1] - x[1]).slice(0, 4), sum = top.reduce((q, [, x]) => q + x, 0);
        for (let c = 0; c < 4; c++) { bi.push(top[c]?.[0] ?? 0); bw.push(top[c] ? top[c][1] / sum : 0); }
        cuts.set(key, m);
        return m;
      };
      const out = [], idx = g.index.array;
      for (let t = 0; t < idx.length; t += 3) {
        let v = [idx[t], idx[t + 1], idx[t + 2]];
        if (v[0] === v[1] || v[1] === v[2] || v[0] === v[2]) continue;
        const inside = v.map((i) => F[i] >= 0), n = inside.filter(Boolean).length;
        if (n === 3) { out.push(...v); continue; }
        if (n === 0) continue;
        const odd = n === 1 ? inside.indexOf(true) : inside.indexOf(false); // 혼자 다른 꼭짓점을 맨 앞으로(감기 방향 유지)
        v = [v[odd], v[(odd + 1) % 3], v[(odd + 2) % 3]];
        if (n === 1) out.push(v[0], cut(v[0], v[1]), cut(v[0], v[2]));
        else { const m1 = cut(v[1], v[0]), m2 = cut(v[2], v[0]); out.push(m1, v[1], v[2], m1, v[2], m2); }
      }
      if (!out.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      if (su) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(bi, 4));
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(bw, 4));
      geo.setIndex(out);
      const mats = dress(CLOTH, color, shade);
      mats.forEach((_, i) => geo.addGroup(0, Infinity, i));
      const mesh = new THREE.SkinnedMesh(geo, mats);
      mesh.frustumCulled = false;
      mesh.position.copy(skin.position);
      mesh.quaternion.copy(skin.quaternion);
      mesh.scale.copy(skin.scale);
      skin.parent.add(mesh);
      mesh.bind(skin.skeleton, skin.bindMatrix);
      mesh.updateMatrixWorld(true);
      mesh.userData.fine = fine; // 쪼갰거나 이미 쪼갠 옷에서 오렸다
      made.push(mesh);
    }
    return made;
  }
  // 몸 치수(쉬는 자세, 비율을 고친 뒤): 팔은 어깨관절에서 손목 쪽으로 잰 거리 t 로 소매·장갑 길이를 정한다
  const RB = (n) => vrm.humanoid.getRawBoneNode(n)?.getWorldPosition(new THREE.Vector3());
  const ACROSS = new THREE.Vector3().crossVectors(UP, facing); // 캐릭터 왼쪽
  const BM = (() => {
    const hips = RB('hips'), neck = RB('neck'), chest = RB('upperChest') ?? RB('chest');
    const arm = ['left', 'right'].map((sd) => {
      const sh = RB(`${sd}UpperArm`), wr = RB(`${sd}Hand`), axis = wr.clone().sub(sh).normalize();
      return { sh, axis, wristT: wr.clone().sub(sh).length(), elbowT: RB(`${sd}LowerArm`).sub(sh).dot(axis) };
    });
    return { hips, neck, arm, shoulderY: arm[0].sh.y, chestZ: chest.clone().sub(hips).dot(facing), ankle: RB('leftFoot').y, knee: RB('leftLowerLeg').y };
  })();
  const sideOf = (p) => (p.clone().sub(BM.hips).dot(ACROSS) > 0 ? 0 : 1);
  const armT = (p) => { const a = BM.arm[sideOf(p)]; return p.clone().sub(a.sh).dot(a.axis); };
  const clampArm = (p, t0, t1) => { const a = BM.arm[sideOf(p)], t = p.clone().sub(a.sh).dot(a.axis); p.addScaledVector(a.axis, Math.min(t1, Math.max(t0, t)) - t); };
  const lat = (p) => Math.abs(p.clone().sub(BM.hips).dot(ACROSS));
  const front = (p) => p.clone().sub(BM.hips).dot(facing) > BM.chestZ - 0.02;
  const WRIST = BM.arm[0].wristT;
  // 상의: sleeve = 소매 길이(어깨관절에서 m, 손목 = WRIST), hem = 밑단 높이(월드 y), neck = 목 밑으로 내린 깊이, scoop = 앞목을 더 판다
  function top({ sleeve = 0, hem, neck = 0.035, scoop = 0, off = 0.003, color, shade }) {
    const neckY = (p) => BM.neck.y - neck - (front(p) ? scoop : 0);
    return OUTER = skinShell({
      off, color, shade,
      // 머리뼈에 붙은 피부(머리카락 밑 뒤통수)는 뺀다 — 목 위로 넉넉히 덮은 뒤 크루넥으로 자르는데, 뒤통수는 목 축에서 멀어 잘리지 않고 남아 뒷머리 끝 사이로 비쳤다
      pick: (p, w) => wsum(w, HANDS) < 0.3 && wsum(w, LEGS_RE) < 0.5 && wsum(w, /C_Head$/) < 0.5 && p.y < neckY(p) && p.y > hem && armT(p) < sleeve,
      edge: (p) => { p.y = Math.min(Math.max(p.y, hem), neckY(p)); clampArm(p, -1, sleeve); },
    });
  }
  // 둥근 목(크루넥): 상의를 목 위까지 덮어 만든 OUTER 를 목 둘레를 따라 둥글게 잘라 낸다(거리장이라 끝단이 매끈) + 목 시보리.
  // 목 축(목뼈→머리뼈)에서 잰다: 옆은 목 밑동(반경 5.8cm), 앞은 쇄골 패임까지 조금 더(7cm·3.5cm 아래), 뒤는 높이로 끊는다(뒷목은 축에 가까워 반경으로는 등까지 파인다).
  // 예전엔 목뼈 1.2cm 밑 수평면으로 잘라 승모근 비탈을 따라 넓은 보트넥이 되고 옆 끝단이 계단처럼 찢어졌다
  const NECK_DIR = RB('head').sub(BM.neck).normalize();
  const neckField = (p) => {
    const d = p.clone().sub(BM.neck), along = d.dot(NECK_DIR), rad = d.addScaledVector(NECK_DIR, -along), r = rad.length(), cf = rad.dot(facing) / (r || 1);
    const fr = Math.max(0, cf) ** 2, bk = Math.max(0, -cf);
    const a = r - (0.058 + 0.012 * fr), b = -0.035 * fr + 0.008 * bk - along, k = 0.014;
    return 0.5 * (a + b + Math.sqrt((a - b) ** 2 + k * k)); // + = 옷이 남는 쪽. 부드러운 max — 반경 경계·높이 경계가 만나는 뒷목 모서리를 둥글게
  };
  function crewNeck({ color, shade, rib, ribShade }) {
    const F = neckField;
    const src = OUTER;
    src.forEach((o) => { o.visible = false; });
    OUTER = clipShell({ src, field: F, off: 0, color, shade });
    clipShell({ src, field: (p) => { const f = F(p); return Math.min(f, 0.014 - f); }, off: 0.0012, color: rib, shade: ribShade }); // 시보리 1.4cm
  }
  // 하프집(하이넥 긴팔): 크루넥 선보다 목을 collar 만큼 더 덮는 스탠드 깃 + 앞 가운데 지퍼(목뼈 13cm 아래까지) + 깃 끝 시보리
  function halfZip({ color, shade, rib, ribShade, zip = '#17181c', collar = 0.032 }) {
    const F = (p) => neckField(p) + collar, src = OUTER;
    src.forEach((o) => { o.visible = false; });
    OUTER = clipShell({ src, field: F, off: 0, color, shade });
    clipShell({ src, field: (p) => { const f = F(p); return Math.min(f, 0.01 - f); }, off: 0.0012, color: rib, shade: ribShade });
    panel(OUTER, (p) => Math.min(0.0032 - lat(p), p.y - (BM.neck.y - 0.13), front(p) ? 1 : -1), zip, zip, 0.0015);
  }
  // 민소매(러닝 싱글렛): 목 위까지 덮은 상의를 거리장으로 오려 목 구멍·진동(팔 구멍)을 내고 가장자리에 바이어스를 두른다.
  // 끈 = 옆 6.5~11.2cm 띠 — 높이와 상관없이 남겨 어깨 위로 넘어가 앞·뒤판을 잇는다. 목 구멍은 끈 안쪽에서만 U자로(앞 9cm·뒤 4cm 파임),
  // 진동은 겨드랑이 위에서 끈 바깥선 밖을 판다(겨드랑이 쪽은 둥글게 넓어진다).
  // 예전엔 목 파임을 '목뼈 높이 수평선'으로 잘라 어깨 위(목뼈보다 높은 승모근)에서 끈이 끊겨 앞뒤가 안 이어지고, 바이어스가 갈고리처럼 말렸다(사용자 지적 2026-11-05).
  // 바이어스는 오린 끝단에서 안쪽으로 한쪽만 잰다(양쪽 거리로 재면 띠가 삼각형보다 좁아 군데군데 끊겼다)
  // 띠 폭은 F 값이 아니라 옷 표면 위 실제 거리로 잰다(surfaceDist) — F 는 높이·옆거리를 섞은 값이라 1 단위가 곳마다 달라
  // V넥 옆(가파른 파임)은 3mm 로 얇고 어깨 위(평평)·둥글린 모서리는 1cm 넘게 두꺼워 삐뚤빼뚤했다(사용자 지적 2026-11-05)
  function tankTop({ color, shade, trim, trimShade, hem = HEM }) {
    const n = BM.neck, armpit = BM.shoulderY - 0.075, inner = 0.065, k = 0.014;
    const smax = (a, b) => 0.5 * (a + b + Math.sqrt((a - b) ** 2 + k * k)), smin = (a, b) => -smax(-a, -b);
    const F = (p) => {
      const l = lat(p), s = ease((p.clone().sub(n).dot(facing) + 0.02) / 0.04); // s: 0 = 등, 1 = 가슴
      const depth = (0.04 + 0.05 * s) * (1 - ease(l / inner)); // 목 파임: 가운데가 가장 깊고 끈 안쪽선에서 0
      const neck = smax(n.y - depth - p.y, l - inner); // + = 목 파임 아래거나 끈 자리
      const outer = 0.112 + 0.03 * (1 - ease((p.y - armpit) / 0.06)); // 끈 바깥선 — 겨드랑이 쪽은 둥글게 넓어진다
      const arm = smax(armpit - p.y, outer - l); // + = 겨드랑이 아래거나 끈 바깥선 안
      return smin(neck, arm); // + = 옷이 남는 쪽
    };
    top({ sleeve: -0.005, hem, neck: -0.09, off: 0.0055, color, shade });
    const src = OUTER;
    src.forEach((o) => { o.visible = false; });
    OUTER = clipShell({ src, field: F, off: 0, color, shade });
    const D = surfaceDist(F);
    clipShell({ src: OUTER, field: (p, w, nrm) => 0.008 - D(p, nrm), off: 0.0012, color: trim, shade: trimShade }); // 바이어스 8mm
  }
  // 거리장 F(+ 안 · − 밖)를 끝단(F = 0)까지의 표면 위 거리(m)로 바꾼다: F ÷ |표면을 따라 잰 기울기|(중앙차분 1mm, 법선 성분은 뺀다).
  // 0 선은 그대로라 옷 모양은 안 바뀌고, 그 선에서 잰 띠 폭만 어디서나 같아진다. 기울기가 거의 0 인 곳(평평한 데서 높이만 보는 값)은 4배까지만 늘린다.
  // 끝단에서 먼 곳(F > far — 기울기가 아무리 커도 띠 밖)은 기울기를 안 잰다(옷 꼭짓점 대부분 — 로딩 시간)
  function surfaceDist(F, far = 0.03, h = 0.001) {
    const q = new THREE.Vector3(), g = new THREE.Vector3();
    return (p, nrm) => {
      const f = F(p);
      if (f > far) return f;
      for (const ax of ['x', 'y', 'z']) { q.copy(p); q[ax] += h; const a = F(q); q[ax] -= 2 * h; g[ax] = (a - F(q)) / (2 * h); }
      if (nrm) g.addScaledVector(nrm, -g.dot(nrm));
      return f / Math.max(g.length(), 0.25);
    };
  }
  // ---- 배색·무늬: 이미 입힌 옷 위에 살짝 띄워 다른 색 조각을 거리장으로 오려 붙인다(+ = 칠하는 쪽, 끝단이 매끈) ----
  function panel(src, field, color, shade = color, off = 0.0008) {
    return clipShell({ src, field, off, color, shade });
  }
  const between = (v, lo, hi) => Math.min(v - lo, hi - v); // lo~hi 사이면 +
  // 몸통 둘레 각(rad): 0 = 앞 가운데, π/2 = 옆선, π = 등 가운데
  const torsoAng = (p) => { const v = p.clone().sub(BM.hips); return Math.atan2(Math.abs(v.dot(ACROSS)), v.dot(facing)); };
  // 다리 바깥 각(rad): 0 = 그 다리 바깥 옆선(고관절 기준)
  const LEG_C = ['left', 'right'].map((sd) => RB(`${sd}UpperLeg`));
  const legOutAng = (p) => {
    const sd = sideOf(p), v = p.clone().sub(LEG_C[sd]);
    return Math.atan2(Math.abs(v.dot(facing)), v.dot(ACROSS) * (sd === 0 ? 1 : -1));
  };
  // 팔 윗선 각(rad): 0 = 쉬는 자세(T자)에서 팔 위쪽 — 달릴 땐 팔 바깥선
  const armTopAng = (p) => {
    const a = BM.arm[sideOf(p)], v = p.clone().sub(a.sh), r = v.addScaledVector(a.axis, -v.dot(a.axis));
    return Math.acos(Math.max(-1, Math.min(1, r.dot(UP) / (r.length() || 1))));
  };
  const sidePanel = (src, color, shade, half = 0.3) => panel(src, (p, w) => Math.min(half - Math.abs(torsoAng(p) - Math.PI / 2), 0.5 - wsum(w, ARMS)), color, shade);
  const legStripe = (src, color, shade, half = 0.16) => panel(src, (p) => half - legOutAng(p), color, shade);
  const sleeveStripe = (src, color, shade, half = 0.3) => panel(src, (p, w) => Math.min(half - armTopAng(p), wsum(w, ARMS) - 0.5, armT(p) - 0.03), color, shade);
  const chestBand = (src, y0, y1, color, shade) => panel(src, (p, w) => Math.min(between(p.y, y0, y1), 0.5 - wsum(w, ARMS)), color, shade);
  // 어깨 요크: 몸통은 y0 위, 팔은 어깨관절에서 10cm 까지
  const yoke = (src, y0, color, shade) => panel(src, (p, w) => (wsum(w, ARMS) > 0.5 ? 0.1 - armT(p) : p.y - y0), color, shade);
  const reflectBand = (src, y, width = 0.008) => panel(src, (p) => width / 2 - Math.abs(p.y - y), '#e3e7ee', '#a9b0bc', 0.001); // 반사띠(밤엔 빛을 받아 밝다)
  // 스플릿 쇼츠: 다리 바깥 옆선 밑단을 ㅅ자로 튼다(트임 높이 h, 폭 = 바깥 각 ±half)
  function splitShorts({ hem, off = 0.003, color, shade, h = 0.04, half = 0.32 }) {
    const src = bottom({ hem, off, color, shade });
    src.forEach((o) => { o.visible = false; });
    return clipShell({ src, field: (p) => Math.max((legOutAng(p) - half) * 0.08, p.y - hem - h * (1 - legOutAng(p) / half)), off: 0, color, shade });
  }
  // 하의: 허리(waist)에서 hem 높이까지. 반바지는 허벅지 중간, 타이츠는 발목
  function bottom({ hem, waist = BM.hips.y + 0.07, off = 0.003, color, shade }) {
    return skinShell({
      off, color, shade,
      pick: (p, w) => p.y < waist && p.y > hem && wsum(w, ARMS) < 0.3 && wsum(w, /Foot|Toe/) < 0.5,
      edge: (p) => { p.y = Math.min(Math.max(p.y, hem), waist); },
    });
  }
  // ---- 헐렁한 겉옷(바람막이·패딩 조끼) — 사용자 요청 2026-11-05: "다 몸에 달라붙는 옷뿐, 가을·겨울엔 바람막이를 걸치고 겨울엔 조끼도 입는다" ----
  // 몸에 붙는 옷과 달리 피부에서 1~2cm 띄우고, 띄운 면을 이웃끼리 고르게 펴서(Taubin 평활) 가슴 밑·허리 잘록·쇄골 같은 몸 굴곡을 따라가지 않게 한다.
  // 같은 자리 점(무늬 이음매)은 하나로 묶어 띄우고 편다 — 따로 하면 멀리 띄운 만큼 이음매가 갈라진다. 편 뒤에도 피부에서 minOff 보다 가까워지지 않게(안에 입은 옷이 뚫고 나오지 않게) 되민다.
  // drape: 몸통 천이 위에서 아래로 떨어진다 — 가슴(여자)·견갑골에서 내려오며 허리 잘록·허리 오목을 메운다(둘레 방향마다 위쪽 가장 먼 반경에서 taper 만큼만 안으로).
  // off(p, w) = 띄울 거리(m, p = 쉬는 자세 월드 위치). 팔 뼈 가중치는 그대로 — 안에 입은 옷과 같이 움직여야 겨드랑이 쪽에서 안옷이 뚫고 나오지 않는다.
  // 끝단은 clipShell 로 오려 매끈하게 한다(이 껍질은 넉넉히 덮는 밑감)
  function looseShell({ pick, edge, off, color, shade, relax = 16, minOff = 0.0095, drape = BM.shoulderY - 0.08, taper = 0.18, split = 1 }) {
    const made = [];
    for (const skin of SKINS) {
      const g = skin.geometry, sp = g.attributes.position, sn = g.attributes.normal, n = sp.count, idx = g.index.array;
      const toLocal = skin.matrixWorld.clone().invert(), p = new THREE.Vector3(), w = {};
      const id = new Int32Array(n), ids = new Map();
      for (let i = 0; i < n; i++) {
        const k = `${Math.round(sp.getX(i) * 1e4)},${Math.round(sp.getY(i) * 1e4)},${Math.round(sp.getZ(i) * 1e4)}`;
        if (!ids.has(k)) ids.set(k, ids.size);
        id[i] = ids.get(k);
      }
      const U = ids.size, rep = new Int32Array(U).fill(-1), nrm = new Float32Array(U * 3), base = new Float32Array(U * 3), pos = new Float32Array(U * 3), keep = new Uint8Array(U), torso = new Uint8Array(U);
      for (let i = 0; i < n; i++) { const u = id[i]; if (rep[u] < 0) rep[u] = i; for (let c = 0; c < 3; c++) nrm[u * 3 + c] += sn.getComponent(i, c); }
      for (let u = 0; u < U; u++) {
        weightsOf(skin, rep[u], w);
        p.fromBufferAttribute(sp, rep[u]).applyMatrix4(skin.matrixWorld);
        keep[u] = pick(p, w) ? 1 : 0;
        if (!keep[u]) edge?.(p, w);
        torso[u] = wsum(w, ARMS) < 0.2 ? 1 : 0;
        const o = off(p, w), l = Math.hypot(nrm[u * 3], nrm[u * 3 + 1], nrm[u * 3 + 2]) || 1;
        p.applyMatrix4(toLocal);
        for (let c = 0; c < 3; c++) { nrm[u * 3 + c] /= l; base[u * 3 + c] = p.getComponent(c); pos[u * 3 + c] = base[u * 3 + c] + nrm[u * 3 + c] * o; }
      }
      const tris = [];
      for (let t = 0; t < idx.length; t += 3) {
        const k = keep[id[idx[t]]] + keep[id[idx[t + 1]]] + keep[id[idx[t + 2]]];
        if (edge ? k > 0 : k === 3) tris.push(idx[t], idx[t + 1], idx[t + 2]);
      }
      if (!tris.length) continue;
      const nb = new Map(), link = (a, b) => { if (a !== b) (nb.get(a) ?? nb.set(a, new Set()).get(a)).add(b); };
      for (let t = 0; t < tris.length; t += 3) {
        const a = id[tris[t]], b = id[tris[t + 1]], c = id[tris[t + 2]];
        link(a, b); link(b, a); link(b, c); link(c, b); link(c, a); link(a, c);
      }
      const used = [...nb.keys()], tmp = new Float32Array(U * 3);
      if (drape) { // 둘레 각 10°·높이 1cm 칸마다 가장 먼 반경 → 위에서부터 내려오며 taper 만큼만 줄어드는 '떨어지는 천' 반경 아래로는 안 들어가게
        const W = new THREE.Vector3(), toWorld = skin.matrixWorld, NA = 36, H = 0.01, yLo = BM.hips.y - 0.2, NY = Math.ceil((drape - yLo) / H) + 1;
        const R = new Float32Array(NA * NY), cell = new Int32Array(U).fill(-1), rad = new Float32Array(U);
        for (const u of used) {
          if (!torso[u]) continue;
          W.fromArray(pos, u * 3).applyMatrix4(toWorld);
          const d = W.clone().sub(BM.hips), x = d.dot(ACROSS), z = d.dot(facing), a = Math.floor(((Math.atan2(x, z) / (2 * Math.PI)) + 1) % 1 * NA), yi = Math.floor((W.y - yLo) / H);
          if (yi < 0 || yi >= NY) continue; // 어깨(drape) 위는 재지도 밀지도 않는다
          rad[u] = Math.hypot(x, z);
          cell[u] = a * NY + yi;
          R[cell[u]] = Math.max(R[cell[u]], rad[u]);
        }
        for (let a = 0; a < NA; a++) for (let yi = NY - 2; yi >= 0; yi--) R[a * NY + yi] = Math.max(R[a * NY + yi], R[a * NY + yi + 1] - taper * H);
        for (const u of used) {
          if (cell[u] < 0) continue;
          const need = R[cell[u]] - rad[u];
          if (need <= 0) continue;
          W.fromArray(pos, u * 3).applyMatrix4(toWorld);
          const d = W.clone().sub(BM.hips), out = ACROSS.clone().multiplyScalar(d.dot(ACROSS)).addScaledVector(facing, d.dot(facing)).normalize();
          W.addScaledVector(out, need).applyMatrix4(toLocal).toArray(pos, u * 3);
        }
      }
      for (let it = 0; it < relax; it++) for (const lam of [0.5, -0.53]) { // 줄였다 되부풀리기(Taubin) — 그냥 평균만 내면 옷이 쪼그라든다
        for (const u of used) {
          let x = 0, y = 0, z = 0;
          for (const v of nb.get(u)) { x += pos[v * 3]; y += pos[v * 3 + 1]; z += pos[v * 3 + 2]; }
          const m = nb.get(u).size;
          tmp[u * 3] = pos[u * 3] + lam * (x / m - pos[u * 3]);
          tmp[u * 3 + 1] = pos[u * 3 + 1] + lam * (y / m - pos[u * 3 + 1]);
          tmp[u * 3 + 2] = pos[u * 3 + 2] + lam * (z / m - pos[u * 3 + 2]);
        }
        for (const u of used) for (let c = 0; c < 3; c++) pos[u * 3 + c] = tmp[u * 3 + c];
      }
      for (const u of used) { // 피부에서 minOff 안쪽으로 들어온 점은 되민다
        let d = 0;
        for (let c = 0; c < 3; c++) d += (pos[u * 3 + c] - base[u * 3 + c]) * nrm[u * 3 + c];
        if (d < minOff) for (let c = 0; c < 3; c++) pos[u * 3 + c] += nrm[u * 3 + c] * (minOff - d);
      }
      const faceNormals = () => { // 묶은 점마다 둘레 면 법선(이음매 양쪽이 같은 법선 — 갈라져 보이지 않게)
        const fn = new Float32Array(U * 3), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
        for (let t = 0; t < tris.length; t += 3) {
          const a = id[tris[t]], b = id[tris[t + 1]], c = id[tris[t + 2]];
          A.fromArray(pos, a * 3); B.fromArray(pos, b * 3).sub(A); C.fromArray(pos, c * 3).sub(A); B.cross(C);
          for (const v of [a, b, c]) { fn[v * 3] += B.x; fn[v * 3 + 1] += B.y; fn[v * 3 + 2] += B.z; }
        }
        for (const u of used) { const l = Math.hypot(fn[u * 3], fn[u * 3 + 1], fn[u * 3 + 2]) || 1; for (let c = 0; c < 3; c++) fn[u * 3 + c] /= l; }
        return fn;
      };
      const fn = faceNormals();
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { P[i * 3 + c] = pos[id[i] * 3 + c]; N[i * 3 + c] = fn[id[i] * 3 + c]; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
      geo.setAttribute('uv', g.attributes.uv);
      geo.setAttribute('skinIndex', g.attributes.skinIndex);
      geo.setAttribute('skinWeight', g.attributes.skinWeight);
      geo.setIndex(tris);
      const mats = dress(CLOTH, color, shade);
      mats.forEach((_, i) => geo.addGroup(0, Infinity, i));
      let fineGeo = geo; // split 번 쪼갠다(오릴 때 또 쪼개지 않게 fine) — 바람막이를 두 번 쪼개면 6만 삼각형, 준비가 0.5초 늘었다. 패딩 칸은 촘촘해야 해 두 번
      for (let k = 0; k < split; k++) fineGeo = subdivide(fineGeo);
      const mesh = new THREE.SkinnedMesh(fineGeo, mats);
      mesh.geometry.clearGroups();
      mats.forEach((_, i) => mesh.geometry.addGroup(0, Infinity, i));
      mesh.userData.fine = true;
      mesh.frustumCulled = false;
      mesh.position.copy(skin.position);
      mesh.quaternion.copy(skin.quaternion);
      mesh.scale.copy(skin.scale);
      skin.parent.add(mesh);
      mesh.bind(skin.skeleton, skin.bindMatrix);
      mesh.updateMatrixWorld(true);
      made.push(mesh);
    }
    return made;
  }
  // 겉감은 양면을 그린다 — 앞섶·밑단·소매 사이로 안감(그늘색)이 보여야 얇은 천 한 겹으로 읽힌다.
  // sheen: 나일론 겉감의 윤기 — 가장자리(빛을 비스듬히 받는 쪽)에 밝은 테두리(림 라이트)
  const twoSided = (shells, sheen = 0) => shells.forEach((o) => [o.material].flat().forEach((m) => {
    if (m.isOutline) return;
    m.side = THREE.DoubleSide;
    if (sheen) { m.parametricRimColorFactor?.setScalar(sheen); m.parametricRimFresnelPowerFactor = 3.5; m.parametricRimLiftFactor = 0; m.rimLightingMixFactor = 1; }
    m.needsUpdate = true;
  }));
  // 패딩 칸: 잘게 쪼갠 겉감을 법선 방향으로 bulge(p)만큼 부풀리고 법선을 다시 잰다(같은 자리 점은 한 법선 — 이음매가 갈라지지 않게).
  // 오린 뒤(쪼갠 뒤)에 해야 칸이 매끈하다 — 원래 몸 메시는 칸 하나에 꼭짓점이 두세 줄뿐이라 부풀림이 뭉개졌다
  function quilt(shells, bulge) {
    const p = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
    for (const o of shells) {
      const g = o.geometry, pa = g.attributes.position, na = g.attributes.normal, idx = g.index.array;
      for (let i = 0; i < pa.count; i++) {
        const b = bulge(p.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld));
        pa.setXYZ(i, pa.getX(i) + na.getX(i) * b, pa.getY(i) + na.getY(i) * b, pa.getZ(i) + na.getZ(i) * b);
      }
      const key = (i) => `${Math.round(pa.getX(i) * 1e4)},${Math.round(pa.getY(i) * 1e4)},${Math.round(pa.getZ(i) * 1e4)}`, sum = new Map();
      for (let t = 0; t < idx.length; t += 3) {
        A.fromBufferAttribute(pa, idx[t]); B.fromBufferAttribute(pa, idx[t + 1]).sub(A); C.fromBufferAttribute(pa, idx[t + 2]).sub(A); B.cross(C);
        for (let c = 0; c < 3; c++) { const k = key(idx[t + c]), v = sum.get(k) ?? [0, 0, 0]; v[0] += B.x; v[1] += B.y; v[2] += B.z; sum.set(k, v); }
      }
      for (let i = 0; i < pa.count; i++) { const v = sum.get(key(i)); if (!v) continue; const l = Math.hypot(...v) || 1; na.setXYZ(i, v[0] / l, v[1] / l, v[2] / l); }
      pa.needsUpdate = na.needsUpdate = true;
    }
  }
  const neckAlong = (p) => p.clone().sub(BM.neck).dot(NECK_DIR); // 목 밑동에서 목을 따라 올라간 높이(m)
  // 바람막이: 안에 입은 옷 위에 걸친다. 지퍼를 가슴까지 내려 안에 입은 옷 목이 V 로 보이고, 깃(collar)은 목을 감싸 선다.
  // 밑단·소매 끝은 고무단(덜 띄워 몸에 붙는다), 소매는 손목까지 — 워치는 소매 위에 찬다(워치 쪽 JACKET_CUFF_MM)
  function windJacket({ color, shade, trim, trimShade, zip = '#17181c', hem = HEM - 0.01, open = 0.13, collar = 0.045 }) {
    const sleeve = WRIST - 0.004, margin = 0.03, yV = BM.neck.y - open;
    const loose = looseShell({
      color, shade,
      pick: (p, w) => wsum(w, HANDS) < 0.3 && wsum(w, LEGS_RE) < 0.5 && wsum(w, /C_Head$/) < 0.5 && p.y > hem - margin && neckAlong(p) < collar + margin && armT(p) < sleeve + margin,
      edge: (p) => { p.y = Math.max(p.y, hem - margin); clampArm(p, -1, sleeve + margin); const a = neckAlong(p) - collar - margin; if (a > 0) p.addScaledVector(NECK_DIR, -a); },
      off: (p, w) => {
        const arm = Math.min(1, wsum(w, ARMS) * 1.4), t = armT(p);
        const body = 0.021 - 0.009 * ease((p.y - (BM.shoulderY - 0.07)) / 0.08) - 0.008 * (1 - ease((p.y - hem) / 0.06)); // 가슴·배·등 2.1cm, 어깨 위 1.2cm, 밑단 고무단 1.3cm
        const sl = 0.013 + 0.007 * ease(t / BM.arm[0].elbowT) - 0.011 * ease((t - (sleeve - 0.075)) / 0.04); // 위팔 1.3 → 팔꿈치 2.0 → 소매 고무단 0.9cm
        return body * (1 - arm) + sl * arm;
      },
    });
    const Vf = (p) => (p.clone().sub(BM.neck).dot(facing) > -0.02 ? lat(p) - (p.y - yV) * 0.24 : 1); // 앞섶 V(+ = 옷): 꼭지점 yV 에서 위로 벌어진다
    const topF = (p) => collar - neckAlong(p);
    const F = (p) => Math.min(p.y - hem, topF(p), sleeve - armT(p), Vf(p));
    loose.forEach((o) => { o.visible = false; });
    const shell = clipShell({ src: loose, field: F, off: 0, color, shade });
    twoSided(shell, 0.35);
    // 가장자리 띠는 이미 오린 끝단에서 안쪽으로 한쪽만 잰다(0.007 - f) — 양쪽(min(f, 0.007 - f))으로 재면 띠가 삼각형보다 좁아 군데군데 끊겼다
    panel(shell, (p) => Math.min(0.007 - Vf(p), p.y - yV + 0.004), zip, zip); // 열린 섶 지퍼 테이프
    panel(shell, (p) => Math.min(0.0035 - lat(p), yV - p.y, front(p) ? 1 : -1), zip, zip); // 잠긴 지퍼(앞 가운데 꼭짓점 줄을 따라간다)
    panel(shell, (p) => 0.008 - topF(p), trim, trimShade); // 깃 끝
    panel(shell, (p) => hem + 0.022 - p.y, trim, trimShade); // 밑단 고무단
    panel(shell, (p, w) => Math.min(wsum(w, ARMS) - 0.5, armT(p) - (sleeve - 0.025)), trim, trimShade); // 소매 고무단
    panel(shell, (p) => Math.min(0.007 - Math.abs(p.y - (BM.shoulderY - 0.1)), 0.12 - lat(p), p.clone().sub(BM.hips).dot(facing) < BM.chestZ - 0.08 ? 1 : -1), '#e3e7ee', '#a9b0bc'); // 등 반사띠(1.4cm — 더 좁으면 삼각형 사이로 끊긴다)
    OUTER = shell;
  }
  // 패딩 조끼: 안에 입은 긴팔 위, 몸통만(진동은 크게 판다). 가로 칸(q)마다 부풀리고 박음선은 눌려 그늘이 진다. 높은 깃 + 앞 지퍼 끝까지
  function padVest({ color, shade, trim, trimShade, zip = '#17181c', hem = HEM + 0.01, collar = 0.05, q = 0.068, base = 0.016 }) {
    const margin = 0.03, armpit = BM.shoulderY - 0.1, edgeLat = lat(BM.arm[0].sh) - 0.04, k = 0.04;
    const smax = (a, b) => 0.5 * (a + b + Math.sqrt((a - b) ** 2 + k * k)), smin = (a, b) => -smax(-a, -b);
    const loose = looseShell({
      color, shade, minOff: base - 0.004, split: 2,
      pick: (p, w) => wsum(w, ARMS) < 0.5 && armT(p) < 0.03 && wsum(w, LEGS_RE) < 0.5 && wsum(w, /C_Head$/) < 0.5 && p.y > hem - margin && neckAlong(p) < collar + margin,
      edge: (p) => { p.y = Math.max(p.y, hem - margin); clampArm(p, -1, 0.03); const a = neckAlong(p) - collar - margin; if (a > 0) p.addScaledVector(NECK_DIR, -a); },
      off: (p) => base - 0.003 * ease((p.y - (BM.shoulderY - 0.06)) / 0.08) - 0.005 * (1 - ease((p.y - hem) / 0.05)),
    });
    const armF = (p) => smax(armpit - p.y, edgeLat - lat(p)); // 진동(+ = 옷): 겨드랑이 밑은 몸통 전체, 그 위는 어깨 끝 안쪽만 — 모서리를 둥글게
    const topF = (p) => collar - neckAlong(p);
    const F = (p) => smin(Math.min(p.y - hem, topF(p)), armF(p));
    loose.forEach((o) => { o.visible = false; });
    const shell = clipShell({ src: loose, field: F, off: 0, color, shade });
    twoSided(shell);
    const fr = (p) => ((((p.y - hem) / q) % 1) + 1) % 1, quilted = (p) => 1 - ease((p.y - (BM.shoulderY - 0.03)) / 0.04); // 칸 안 위치(0~1) · 어깨 위(깃)는 칸 없음
    quilt(shell, (p) => 0.011 * Math.sin(Math.PI * fr(p)) ** 0.6 * quilted(p));
    panel(shell, (p) => Math.min(0.0015 - Math.min(fr(p), 1 - fr(p)) * q, quilted(p) - 0.5, p.y - hem - 0.02), shade, shade); // 박음선
    panel(shell, (p) => Math.min(0.003 - lat(p), front(p) ? 1 : -1), zip, zip); // 앞 지퍼
    panel(shell, (p) => 0.008 - topF(p), trim, trimShade); // 깃 끝(오린 끝단에서 안쪽으로 한쪽만)
    panel(shell, (p) => hem + 0.012 - p.y, trim, trimShade); // 밑단 바이어스
    panel(shell, (p) => Math.min(0.008 - armF(p), p.y - armpit + 0.03), trim, trimShade); // 진동 바이어스
    OUTER = shell;
  }
  // 양말: 발목뼈 위 above(m) 까지. 신발 속(피부 바로 바깥에 신발 면)은 띄우지 않아 신발을 뚫고 비치지 않는다
  function socks(above, color = '#f7f7f4', shade = '#c8cbd5') {
    const topY = BM.ankle + above, shoe = meshes.find((o) => /Shoes_\d+_CLOTH/.test([o.material].flat()[0].name));
    const ray = new THREE.Raycaster();
    ray.far = 0.02;
    return skinShell({
      color, shade,
      off: (p, nWorld) => (p.y < topY && shoe && (ray.set(p, nWorld), ray.intersectObject(shoe, false).length) ? 0 : 0.0035),
      pick: (p) => p.y < topY,
      edge: (p) => { p.y = topY; },
    });
  }
  // ---- 러닝화(사용자 요청 2026-11-05: "지금 신발은 일반 스니커즈 같다") ----
  // 모델 운동화(코트 스니커즈: 얇은 컵솔·옆 줄무늬)를 겉모양만 러닝화로 바꾼다 — 메시는 그대로 두고 모양을 조금 손보고 그림을 새로 칠한다.
  // 러닝화 겉 특징 — 상상 말고 실측·사진에서 추렸다(사용자 요청, 2026-11-05 RunRepeat 랩 테스트: 489켤레 평균 뒤꿈치 스택 35.6mm·앞 27.2mm·드롭 8.4mm,
  // 데일리 트레이너 단면·옆 사진): 두꺼운 미드솔 폼(뒤꿈치 > 앞) · 앞 25~35% 부터 바닥이 휘어 오르는 포어풋 로커(앞코 들림) ·
  // 뒤꿈치 밑을 크게 깎아 올린 리어 로커(힐 베벨) · 밑으로 갈수록 벌어지는 미드솔 · 바닥 고무는 뒤꿈치·앞쪽만(가운데는 폼 노출) ·
  // 니트(메시) 갑피 · 힐 카운터 · 뒤로 젖혀진 뒤꿈치 탭 · 반사 포인트. 모양 특징만 쓰고 특정 브랜드 디자인·로고는 따라 하지 않는다.
  // 모델 신발은 길이 21cm(실제 29cm 의 0.73배)라 실측을 그대로 줄이면 얇아 보여 맥스 쿠션 쪽으로 잡았다. 사용자가 보낸 맥스 스택 레이싱화 사진:
  // 미드솔이 신발 높이의 절반 가까이 · 바닥 전체가 배처럼 휘어 앞뒤가 크게 들림 · 낮고 날렵한 갑피 · 두 겹 미드솔(밑층이 밝다) · 뒤꿈치 폼이 갑피 뒤로 튀어나옴 ·
  // (위·바닥 사진) 미드솔이 갑피보다 사방으로 넓고 가운데(아치)가 잘록 · 바닥은 밝은 폼에 가로 홈이 촘촘하고 가운데 세로 홈 · 미드솔 윗선이 뒤꿈치·앞코에서 올라간다.
  // 원래 밑창 위로만 칠하면 갑피가 줄어들어서, 바닥을 STACK 만큼 아래로 늘리고 캐릭터를 그만큼 들어 올린다(옷을 다 지은 뒤 — 옷은 들기 전 좌표로 짓는다)
  // 그림은 신발 메시의 삼각형마다 UV 자리에 그 점의 3D 위치(발 기준 높이·앞뒤·좌우)로 색을 정해 칠한다(텍스처 굽기) — 경계가 메시와 상관없이 매끈하다.
  // 끈은 발등 가운데에 사다리 끈으로 새로 칠한다(원래 그림 밝기를 쓰면 검은 혀가 얼룩처럼 남았다). 밑창 무늬(육각 트레드)는 밝기만 살린다(달리면 발바닥이 보인다)
  const SHOES = {
    female: { upper: '#dfe2ea', upperDark: '#8a90a0', lace: '#f7f7f4', midsole: '#f5f2ea', midsoleLine: '#cfc9bb', midsoleBase: '#c9cde0', accent: '#c6f432', shade: '#aab0bf' },
    male: { upper: '#545963', upperDark: '#202328', lace: '#e9eaec', midsole: '#2a2d33', midsoleLine: '#c9c3b2', midsoleBase: '#e7e2d4', accent: '#ff6a1a', shade: '#9aa0ae' }, // 회색 메시 갑피 · 검은 미드솔 · 크림 밑층
  };
  const STACK = 0.012; // 바닥을 아래로 늘린 만큼(캐릭터를 그만큼 든다)
  function runningShoes(c) {
    const shoe = meshes.find((o) => /Shoes_\d+_CLOTH/.test([o.material].flat()[0].name));
    const srcMap = shoe && [shoe.material].flat().find((m) => m.map)?.map;
    if (!shoe || !srcMap?.image || typeof document === 'undefined') return;
    const g = shoe.geometry, pa = g.attributes.position, uv = g.attributes.uv, idx = g.index.array, toLocal = shoe.matrixWorld.clone().invert();
    const used = [...new Set(idx)], W = new Map();
    for (const i of used) W.set(i, new THREE.Vector3().fromBufferAttribute(pa, i).applyMatrix4(shoe.matrixWorld));
    // 발마다 틀: 앞(dir) = 발목뼈→발가락뼈 수평, 옆(side) = 발의 왼쪽. t = 뒤꿈치 0 ~ 앞코 1, h = 바닥에서 높이, x = 발 가운데선에서 옆으로
    const feet = ['left', 'right'].map((sd) => {
      const ankle = RB(`${sd}Foot`), toe = RB(`${sd}Toes`) ?? ankle.clone().addScaledVector(facing, 0.12);
      const dir = toe.clone().sub(ankle).setY(0).normalize();
      return { ankle, dir, side: new THREE.Vector3().crossVectors(UP, dir), lo: Infinity, hi: -Infinity, ground: Infinity, xl: Infinity, xh: -Infinity };
    });
    const footOf = new Map();
    for (const [i, p] of W) {
      const f = feet.reduce((a, b) => (p.clone().sub(a.ankle).setY(0).length() <= p.clone().sub(b.ankle).setY(0).length() ? a : b));
      footOf.set(i, f);
      const a = p.clone().sub(f.ankle).dot(f.dir), x = p.clone().sub(f.ankle).dot(f.side);
      f.lo = Math.min(f.lo, a); f.hi = Math.max(f.hi, a); f.ground = Math.min(f.ground, p.y); f.xl = Math.min(f.xl, x); f.xh = Math.max(f.xh, x);
    }
    const local = (f, p) => {
      const d = p.clone().sub(f.ankle);
      return { t: (d.dot(f.dir) - f.lo) / (f.hi - f.lo), h: p.y - f.ground, x: d.dot(f.side) - (f.xl + f.xh) / 2 };
    };
    // 모양: 스택(바닥을 아래로 STACK 늘림) · 포어풋 로커(앞 40% 를 위로 최대 22mm — 발구름이 굴러가게 앞코가 들린다, 사용자 지적 "러닝화는 앞이 들려 있다") ·
    // 리어 로커(뒤 25% 의 아랫부분을 위로 최대 18mm — "뒤에도 마찬가지") · 미드솔 벌어짐(바닥 쪽을 옆으로 최대 5mm, 뒤꿈치는 뒤로 최대 8mm)
    for (const [i, p] of W) {
      const f = footOf.get(i), { t, h, x } = local(f, p);
      if (h < 0.03) p.y -= STACK * (1 - h / 0.03);
      if (t > 0.6) p.y += 0.022 * ((t - 0.6) / 0.4) ** 2;
      if (t < 0.25) p.y += 0.018 * ((0.25 - t) / 0.25) ** 2 * (1 - ease(h / 0.05));
      if (h < 0.03) { // 미드솔이 갑피보다 넓게 — 뒤꿈치·앞발은 넓고 아치(가운데)는 잘록
        const k = 1 - h / 0.03, waist = 1 - 0.5 * Math.exp(-(((t - 0.45) / 0.12) ** 2));
        p.addScaledVector(f.side, Math.sign(x) * 0.008 * k * waist);
        if (t < 0.15) p.addScaledVector(f.dir, -0.008 * k * (1 - t / 0.15));
      }
      pa.setXYZ(i, ...p.clone().applyMatrix4(toLocal).toArray());
    }
    pa.needsUpdate = true;
    for (const f of feet) f.ground -= STACK; // 높이는 늘어난 바닥에서 잰다
    // 그림 굽기
    const R = 1024, cv = document.createElement('canvas');
    cv.width = cv.height = R;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(srcMap.image, 0, 0, R, R);
    const img = ctx.getImageData(0, 0, R, R), src = img.data.slice(), out = img.data, painted = new Uint8Array(R * R);
    const rgb = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16)); // sRGB 그대로(그림은 sRGB 텍스처 — THREE.Color 는 선형으로 바꿔 어두워진다)
    const C = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, rgb(v)]));
    const mix = (a, b, k) => a.map((v, j) => v + (b[j] - v) * k);
    const A = new THREE.Vector3(), B = new THREE.Vector3(), Cc = new THREE.Vector3(), n = new THREE.Vector3(), p = new THREE.Vector3();
    const colorAt = (f, q, ny, px) => {
      const { t, h, x } = local(f, q), lum = (src[px] + src[px + 1] + src[px + 2]) / 765;
      const hm = STACK + 0.036 - 0.01 * ease((t - 0.2) / 0.6) + 0.006 * (1 - ease(t / 0.15)) + 0.005 * ease((t - 0.86) / 0.14); // 미드솔 윗선: 뒤꿈치 48mm(뒤로 갈수록 더 올라감) → 앞 38mm(드롭 10mm), 앞코에서 감싸 올라간다
      if (ny < -0.6) { // 바닥: 밝은 폼 + 가로 홈 + 가운데 세로 홈
        if (Math.abs(x) < 0.0035 && t > 0.3 && t < 0.62) return C.upperDark;
        return Math.sin(t * Math.PI * 46) > 0.55 ? C.midsoleLine : C.midsoleBase;
      }
      if (h < hm * 0.34) return C.midsoleBase; // 두 겹 미드솔의 밑층
      if (h < hm) return C.midsole; // 윗층 폼
      if (t < 0.035 && Math.abs(x) < 0.007 && h > hm + 0.012 && h < 0.062) return [226, 230, 236]; // 뒤꿈치 반사 포인트
      if (t < 0.1 - 0.05 * ease((h - hm) / 0.035) && h < hm + 0.035) return C.accent; // 힐 카운터(위로 갈수록 좁아지는 뒤꿈치 컵)
      if (ny > 0.5 && t > 0.42 && t < 0.82 && h > 0.045) { // 발등: 사다리 끈 + 양옆 끈구멍 줄
        const ax = Math.abs(x);
        if (ax < 0.014) return ((t - 0.42) / 0.055) % 1 < 0.38 ? C.lace : C.upperDark;
        if (ax < 0.019) return C.upperDark;
      }
      const knit = 0.94 + 0.06 * (Math.sin(q.x * 1700) * Math.sin(q.y * 1700) * Math.sin(q.z * 1700) > 0 ? 1 : 0); // 니트 결(약 2mm)
      return C.upper.map((v) => v * knit);
    };
    for (let tri = 0; tri < idx.length; tri += 3) {
      const ia = idx[tri], ib = idx[tri + 1], ic = idx[tri + 2], f = footOf.get(ia);
      A.copy(W.get(ia)); B.copy(W.get(ib)); Cc.copy(W.get(ic));
      n.subVectors(B, A).cross(p.subVectors(Cc, A)).normalize();
      const ua = [uv.getX(ia) * R, uv.getY(ia) * R], ub = [uv.getX(ib) * R, uv.getY(ib) * R], uc = [uv.getX(ic) * R, uv.getY(ic) * R];
      const den = (ub[1] - uc[1]) * (ua[0] - uc[0]) + (uc[0] - ub[0]) * (ua[1] - uc[1]);
      if (Math.abs(den) < 1e-9) continue;
      const x0 = Math.max(0, Math.floor(Math.min(ua[0], ub[0], uc[0]))), x1 = Math.min(R - 1, Math.ceil(Math.max(ua[0], ub[0], uc[0])));
      const y0 = Math.max(0, Math.floor(Math.min(ua[1], ub[1], uc[1]))), y1 = Math.min(R - 1, Math.ceil(Math.max(ua[1], ub[1], uc[1])));
      for (let y = y0; y <= y1; y++) for (let xx = x0; xx <= x1; xx++) {
        const sx = xx + 0.5, sy = y + 0.5;
        const w0 = ((ub[1] - uc[1]) * (sx - uc[0]) + (uc[0] - ub[0]) * (sy - uc[1])) / den, w1 = ((uc[1] - ua[1]) * (sx - uc[0]) + (ua[0] - uc[0]) * (sy - uc[1])) / den, w2 = 1 - w0 - w1;
        if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
        p.set(0, 0, 0).addScaledVector(A, w0).addScaledVector(B, w1).addScaledVector(Cc, w2);
        const px = (y * R + xx) * 4, col = colorAt(f, p, n.y, px);
        out[px] = col[0]; out[px + 1] = col[1]; out[px + 2] = col[2]; out[px + 3] = 255;
        painted[y * R + xx] = 1;
      }
    }
    for (let it = 0; it < 3; it++) { // 섬 가장자리 바깥으로 3px 번지게(이음매에서 원래 그림 색이 새지 않게)
      const add = [];
      for (let y = 1; y < R - 1; y++) for (let xx = 1; xx < R - 1; xx++) {
        const k = y * R + xx;
        if (painted[k]) continue;
        const nb = [k - 1, k + 1, k - R, k + R].find((j) => painted[j] === 1);
        if (nb !== undefined) add.push([k, nb]);
      }
      for (const [k, j] of add) { out.set(out.subarray(j * 4, j * 4 + 4), k * 4); painted[k] = 2; }
      for (const [k] of add) painted[k] = 1;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.flipY = srcMap.flipY;
    tex.colorSpace = srcMap.colorSpace;
    tex.wrapS = srcMap.wrapS; tex.wrapT = srcMap.wrapT;
    tex.anisotropy = 4;
    shoe.material = dress([shoe.material].flat(), '#ffffff', c.shade, tex);
    // 뒤꿈치 당김 탭: 힐 칼라 뒤 위에서 뒤로 살짝 젖힌 고리(mm 틀)
    const footBones = { left: vrm.humanoid.getRawBoneNode('leftFoot'), right: vrm.humanoid.getRawBoneNode('rightFoot') };
    feet.forEach((f, k) => {
      let top = null, topH = -1;
      for (const [i, q] of W) if (footOf.get(i) === f) { const l = local(f, q); if (l.t < 0.06 && l.h > topH) { topH = l.h; top = q; } }
      if (!top) return;
      const back = f.dir.clone().negate(), at = top.clone().addScaledVector(back, 0.002).addScaledVector(UP, -0.006);
      const tab = new THREE.Group();
      tab.add(wear(new THREE.BoxGeometry(14, 24, 2.6).translate(0, 9, 0).rotateX(-0.6), dress(CLOTH, c.accent, c.shade))); // 뒤로 젖혀진 아킬레스 탭
      attach(footBones[k ? 'right' : 'left'], frameOf(at, f.side, UP, f.dir), tab); // 오른손 틀(옆 × 위 = 앞) — 뒤집힌 틀이면 면이 안쪽을 향해 안 보인다
    });
  }
  runningShoes(SHOES[CHAR]);

  // 옷(계절): 두 모델 모두 속옷만 입은 몸이라 옷을 전부 피부 껍질로 짓는다(원래 옷에 기대지 않는다 — 어떤 모델이든 같게)
  // 디자인 = 2025~26 러닝복 흐름에서 여러 브랜드가 함께 쓰는 요소만(특정 브랜드 디자인·로고는 따라 하지 않는다, 사용자 요청 2026-11-05):
  // 크롭 싱글렛·짧은 스플릿 쇼츠·바이크 쇼츠·하프집 하이넥 + 옆선 배색·소매 줄·가슴 띠·어깨 요크·반사띠, 올블랙 대신 어스톤 + 네온 포인트
  const HEM = BM.hips.y - 0.02;
  const WEAR = {
    female: {
      summer: () => { // 크롭 싱글렛(오프화이트 · 라임 바이어스·옆선) + 짧은 스플릿 쇼츠(차콜 · 라임 옆선)
        tankTop({ color: '#f4f1ea', shade: '#cfcac0', trim: '#c6f432', trimShade: '#93b81f', hem: BM.hips.y + 0.15 });
        sidePanel(OUTER, '#c6f432', '#93b81f', 0.2);
        legStripe(splitShorts({ hem: BM.knee + 0.23, color: '#2b2b2b', shade: '#1a1a1a' }), '#c6f432', '#93b81f', 0.1);
        socks(0.06);
      },
      mild: () => { // 몸에 붙는 긴팔(세이지 · 크림 소매 줄) + 바이크 쇼츠(테라코타 · 밑단 반사띠)
        top({ sleeve: WRIST - 0.008, hem: HEM, neck: -0.09, off: 0.0055, color: '#8a9a7b', shade: '#66745a' });
        crewNeck({ color: '#8a9a7b', shade: '#66745a', rib: '#7d8d6e', ribShade: '#5b6950' });
        sleeveStripe(OUTER, '#ede6da', '#c4bba9');
        const hem = BM.knee + 0.15;
        reflectBand(bottom({ hem, color: '#c77d5e', shade: '#9a5a40' }), hem + 0.015);
        socks(0.085);
      },
      winter: () => { // 하프집 하이넥(모카 · 블러시 어깨 요크) + 풀 타이츠(발목 반사띠)
        reflectBand(bottom({ hem: BM.ankle + 0.03, off: 0.002, color: '#1e1e24', shade: '#111115' }), BM.ankle + 0.075);
        top({ sleeve: WRIST - 0.008, hem: HEM, neck: -0.09, off: 0.0065, color: '#5a3e36', shade: '#3e2a24' });
        halfZip({ color: '#5a3e36', shade: '#3e2a24', rib: '#4e352e', ribShade: '#35241f' });
        yoke(OUTER, BM.shoulderY - 0.05, '#d8b7a6', '#a88a7b');
        socks(0.03); // 타이츠 밑으로 — 높이 신으면 발목 반사띠를 덮는다
      },
    },
    male: {
      summer: () => { // 네온 싱글렛(네이비 바이어스) + 짧은 스플릿 쇼츠(네이비 · 흰 옆선)
        tankTop({ color: '#ff6a1a', shade: '#c24c0c', trim: '#1f2a44', trimShade: '#141c2e' });
        legStripe(splitShorts({ hem: BM.knee + 0.19, color: '#1f2a44', shade: '#141c2e' }), '#f4f4f2', '#c9cbd0', 0.1);
        socks(0.085);
      },
      mild: () => { // 몸에 붙는 긴팔(세이지 · 오프화이트 가슴 띠) + 무릎 하프 타이츠 위 쇼츠(슬레이트)
        bottom({ hem: BM.knee - 0.02, off: 0.002, color: '#1e1e24', shade: '#111115' });
        bottom({ hem: BM.knee + 0.17, off: 0.0045, color: '#3a3f4b', shade: '#262a33' });
        top({ sleeve: WRIST - 0.008, hem: HEM, neck: -0.09, off: 0.0065, color: '#7c8f6a', shade: '#5a6a4c' });
        crewNeck({ color: '#7c8f6a', shade: '#5a6a4c', rib: '#6e805d', ribShade: '#4f5e43' });
        chestBand(OUTER, BM.shoulderY - 0.14, BM.shoulderY - 0.08, '#e9e4d8', '#bdb6a5');
        socks(0.085);
      },
      winter: () => { // 하프집 하이넥(딥퍼플 · 레드 어깨 요크) + 풀 타이츠(레드 옆선 · 발목 반사띠)
        const tights = bottom({ hem: BM.ankle + 0.03, off: 0.002, color: '#1e1e24', shade: '#111115' });
        legStripe(tights, '#b3322e', '#7f2320', 0.1);
        reflectBand(tights, BM.ankle + 0.075);
        top({ sleeve: WRIST - 0.008, hem: HEM, neck: -0.09, off: 0.0065, color: '#3b2f4a', shade: '#271f31' });
        halfZip({ color: '#3b2f4a', shade: '#271f31', rib: '#32283f', ribShade: '#211a29' });
        yoke(OUTER, BM.shoulderY - 0.05, '#b3322e', '#7f2320');
        socks(0.03);
      },
    },
  };
  WEAR[CHAR][SEASON]?.();
  // 겉옷(악세사리 jacket·padvest — 체감온도·비로 앱이 고른다, sceneOptions.ts): 계절 옷 위에 걸친다. 색은 안에 입은 옷과 어울리게
  const OUTERWEAR = {
    female: {
      jacket: { color: '#e4ddcf', shade: '#b3aa98', trim: '#3b3f46', trimShade: '#25282d' }, // 스톤 + 차콜 고무단
      padvest: { color: '#eee8dc', shade: '#c2b9a7', trim: '#5a3e36', trimShade: '#3e2a24' }, // 아이보리 + 모카(안에 입은 하프집과 같은 색)
    },
    male: {
      jacket: { color: '#2d5bb0', shade: '#1d3d7a', trim: '#1f2a44', trimShade: '#141c2e' }, // 코발트 + 네이비 고무단
      padvest: { color: '#2b2e35', shade: '#191b20', trim: '#b3322e', trimShade: '#7f2320', zip: '#b3322e' }, // 차콜 + 레드(어깨 요크·타이츠 옆선과 같은 색)
    },
  };
  if (ACC.has('jacket')) windJacket(OUTERWEAR[CHAR].jacket);
  if (ACC.has('padvest')) padVest({ ...OUTERWEAR[CHAR].padvest, base: ACC.has('jacket') ? 0.03 : 0.016 });

  // ---- 악세사리(피부 위): 장갑·마스크·넥워머·조끼 ----
  const faceY = (p) => p.clone().applyMatrix4(HEAD_INV); // 머리 틀(mm)
  if (ACC.has('glove')) { // 겨울 러닝 장갑: 손 + 손목 2cm
    skinShell({ off: 0.0025, color: '#1d1f24', shade: '#0f1013', pick: (p, w) => wsum(w, HANDS) > 0.25 || armT(p) > WRIST - 0.02, edge: (p) => clampArm(p, WRIST - 0.02, 9) });
  }
  if (ACC.has('mask') || ACC.has('buff')) {
    const eye = ['leftEye', 'rightEye'].map((n) => RB(n).applyMatrix4(HEAD_INV)), ey = (eye[0].y + eye[1].y) / 2, ez = eye[0].z;
    if (ACC.has('mask')) { // 황사 마스크(KF94): 콧등부터 턱 밑까지, 볼까지 감싼다
      skinShell({ src: FACES, off: 0.009, color: '#f4f5f7', shade: '#c7cad1', pick: (p) => { const q = faceY(p); return q.y < ey - 16 && q.y > -46 && q.z > ez - 25 && Math.abs(q.x) < 66; } });
    }
    if (ACC.has('buff')) { // 넥워머를 코까지 올려 쓴다(추위): 목 전체 + 얼굴 아래쪽을 한 바퀴
      skinShell({ src: FACES, off: 0.012, color: '#3a404c', shade: '#232831', pick: (p) => { const q = faceY(p); return q.y < ey - 14 && q.y > -60 && Math.abs(q.x) < 92; } });
      skinShell({ off: 0.012, color: '#3a404c', shade: '#232831', pick: (p, w) => wsum(w, /Neck|Head/) > 0.4 && faceY(p).y < ey - 14 && p.y > BM.shoulderY - 0.01 });
    }
  }
  if (ACC.has('vest')) { // LSD 조끼: 등판 + 어깨끈 + 앞끈, 가슴에 물병(소프트 플라스크) 두 개 — 피부가 아니라 몸통 가장 바깥 옷 위에
    // 실제 러닝 조끼처럼: 등판 → 어깨 위로 넘어오는 어깨끈 → 앞끈(물병 포켓), 앞끈과 등판은 겨드랑이 밑 옆구리 끈 두 줄로, 두 앞끈은 가슴 끈으로 잇는다.
    // 무늬는 '안쪽까지 거리(m)'로 그리고 경계를 따라 잘라 끝단이 매끈하다(예전엔 삼각형째 넣고 빼서 가장자리가 찢어진 듯 들쭉날쭉).
    // 끝단엔 4mm 짙은 테두리(바이어스 마감) — 같은 무늬를 4mm 넓혀 조금 안쪽에 깐다
    const T = BM.shoulderY - BM.hips.y; // 골반 ~ 어깨관절 높이(m) — 높이 y 는 이 비율(0 = 골반, 1 = 어깨관절)
    const vest = (grow) => (p) => {
      const x = lat(p), y = (p.y - BM.hips.y) / T, zr = p.clone().sub(BM.hips).dot(facing) - BM.chestZ; // zr + = 몸 앞쪽
      const band = (c, hw) => (hw - Math.abs(y - c)) * T, and = Math.min, or = Math.max;
      const strap = 0.0275 - Math.abs(x - 0.0725); // 어깨끈·앞끈(좌우 4.5~10cm)
      const f = or(
        and(strap, (y - 0.5) * T, zr + 0.01), // 앞끈
        and(strap, (y - 0.85) * T), // 어깨 위를 넘는 끈
        and(0.115 - x, (y - 0.28) * T, (0.9 - y) * T, 0.01 - zr), // 등판
        and(or(band(0.45, 0.03), band(0.62, 0.03)), or(x - 0.06, -zr)), // 옆구리 끈 두 줄(앞 가운데는 비움)
        and(band(0.78, 0.022), 0.075 - x, zr + 0.01), // 가슴 끈
      );
      return and(f, (1.13 - y) * T) + grow; // 높은 목깃을 타고 턱까지 오르지 않게 어깨 높이에서 끊는다
    };
    clipShell({ src: OUTER, field: vest(0.004), off: 0.0066, color: '#2b313c', shade: '#1b2028' }); // 테두리
    clipShell({ src: OUTER, field: vest(0), off: 0.008, color: '#56627a', shade: '#38414f' }); // 청회색 — 검은 후드·흰 티 어디서나 보이게
    const chestBone = vrm.humanoid.getRawBoneNode('upperChest') ?? vrm.humanoid.getRawBoneNode('chest');
    for (const sgn of [1, -1]) {
      const at = BM.hips.clone().addScaledVector(UP, BM.shoulderY - BM.hips.y - 0.13).addScaledVector(ACROSS, sgn * 0.075);
      let zf = 0; // 그 높이·옆자리의 바깥 옷 앞면
      for (const skin of OUTER) for (let i = 0, a = skin.geometry.attributes.position, v = new THREE.Vector3(); i < a.count; i++) {
        v.fromBufferAttribute(a, i).applyMatrix4(skin.matrixWorld);
        if (Math.abs(v.y - at.y) < 0.03 && Math.abs(v.clone().sub(at).dot(ACROSS)) < 0.02) zf = Math.max(zf, v.clone().sub(BM.hips).dot(facing));
      }
      at.addScaledVector(facing, zf - at.clone().sub(BM.hips).dot(facing) + 0.008 + 0.014); // 조끼 겉면 + 포켓 두께 절반
      // 가슴 포켓(조끼 끈 위, 위가 트인 주머니) 안에 물병을 꽂는다 — 물병은 윗부분·마개만 포켓 위로 나온다(mm 틀)
      const kit = new THREE.Group();
      kit.add(wear(new THREE.BoxGeometry(60, 92, 28).translate(0, -18, 0), dress(CLOTH, '#48536a', '#2e3644'))); // 포켓
      kit.add(wear(new THREE.BoxGeometry(62, 7, 30).translate(0, 25, 0), dress(CLOTH, '#1b1e23', '#101215'))); // 포켓 입구 고무단
      kit.add(wear(new THREE.CapsuleGeometry(21, 62, 6, 14).scale(1, 1, 0.5).translate(0, 14, 0), dress(CLOTH, '#9fd0ff', '#6b9fd6'))); // 소프트 플라스크(납작, 아래는 포켓 속)
      kit.add(wear(new THREE.CylinderGeometry(9, 9, 16, 12).translate(0, 64, 0), dress(CLOTH, '#f2f2f2', '#c8c8c8'))); // 마개
      kit.rotation.x = -0.12;
      attach(chestBone, frameOf(at, ACROSS, UP, facing), kit);
    }
  }
  applyTuck();
  // 먹선(MToon 외곽선 — 몸·옷 둘레의 검은 테): 기본은 뺀다(사용자 요청 "인체에 먹선이 있는데 빼는 건 가능해?"). 외곽선 재질만 숨긴다.
  // 얼굴·머리카락은 남긴다 — 얼굴 테까지 빼면 턱선이 목과 한 덩어리가 돼 얼굴 모양이 무너졌다(사용자 지적 "얼굴은 왜 저 모양이")
  if (!OPT.ol) vrm.scene.traverse((o) => { if (o.isMesh) [o.material].flat().forEach((m) => { if (m.isOutline && !/Face|Hair/.test(m.name)) m.visible = false; }); });
  vrm.scene.position.y += STACK; // 러닝화 바닥을 늘린 만큼 든다(옷·장신구를 다 지은 뒤 — 그 전엔 원래 좌표로 짓는다)
  vrm.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // ---- 배경: 수변 산책로 ----
  // 러닝머신 트릭: 캐릭터는 제자리에서 뛰고 세상이 뒤로 흐른다. 새로 만들지 않고 한 칸 무늬를 이어 붙여 돌려 쓴다
  //  - 바닥·풀·석축·물: 이음매 없는 타일 무늬를 깔고 무늬만 미끄러뜨린다(UV 오프셋)
  //  - 가로등·건물: 정해진 개수만 만들고, 뒤로 빠진 것을 앞쪽 끝으로 옮겨 재활용한다
  // world 는 캐릭터와 같은 방향 → 로컬 +Z 가 달리는 방향, -X 가 카메라 반대편(천·가로등 쪽)
  // 시간: 해 높이(°)마다 열쇠 장면(밤 ↔ 노을 ↔ 낮)을 두고 그 사이를 섞는다(아래 applyTime).
  // 바닥·풀·석축 무늬는 낮 색으로 한 번 그리고 재질 색(tint)을 곱해 어둡게·따뜻하게 만든다
  const DAY = { path: ['#a19f98', '#7f7d77'], grass: ['#5f8f4e', '#4f7d42'], wall: '#8c8a84' };
  const LAMP = ['#ffd09a', 40]; // 가로등 빛 색(3300K 안팎 LED)·세기
  const ENV_KEYS = [
    { e: -12, sky: ['#03060f', '#0a1430', '#16224a', '#2a2948'], fog: ['#141d38', 14, 60], tint: '#3a4152', water: [[0.02, 0.05, 0.11], [0.05, 0.10, 0.19]], key: ['#a8b8ff', 0.8], sun: ['#ff9a5a', 0], lamp: 1, stars: 1, sparkle: 0, shadow: 0.8 },
    { e: -4, sky: ['#141d3e', '#3b3c6a', '#9a5f7c', '#ee8f6a'], fog: ['#4e4566', 18, 80], tint: '#76718a', water: [[0.07, 0.08, 0.16], [0.22, 0.18, 0.28]], key: ['#b8a8e0', 0.75], sun: ['#ff8a50', 0], lamp: 1, stars: 0.35, sparkle: 0, shadow: 0.7 },
    { e: 3, sky: ['#3a5a98', '#8a9cc4', '#f0b07c', '#ffd49c'], fog: ['#e2bea2', 22, 100], tint: '#eed6c2', water: [[0.14, 0.24, 0.36], [0.62, 0.50, 0.42]], key: ['#ffe2c6', 0.85], sun: ['#ffa860', 2.4], lamp: 0.3, stars: 0, sparkle: 0.5, shadow: 0.5 },
    { e: 15, sky: ['#4f8ad8', '#8cbbe8', '#cfe2f4', '#f2ebe0'], fog: ['#d3dde8', 25, 110], tint: '#fff4e8', water: [[0.16, 0.32, 0.48], [0.44, 0.60, 0.76]], key: ['#eef3ff', 0.9], sun: ['#ffe2bc', 2.9], lamp: 0, stars: 0, sparkle: 0.7, shadow: 0.45 },
    { e: 40, sky: ['#5b9be0', '#80b4ea', '#9cc8f0', '#e6f2fb'], fog: ['#d6e6f3', 25, 110], tint: '#ffffff', water: [[0.16, 0.34, 0.50], [0.42, 0.63, 0.80]], key: ['#eef3ff', 0.9], sun: ['#fff1d6', 3.0], lamp: 0, stars: 0, sparkle: 0.7, shadow: 0.45 },
  ];
  function envAt(deg) {
    const next = ENV_KEYS.findIndex((k) => k.e > deg), i = Math.max(1, next < 0 ? ENV_KEYS.length : next) - 1; // 마지막보다 높으면 마지막
    const a = ENV_KEYS[i], b = ENV_KEYS[Math.min(i + 1, ENV_KEYS.length - 1)];
    const x = a === b ? 0 : Math.min(1, Math.max(0, (deg - a.e) / (b.e - a.e)));
    const num = (p, q) => p + (q - p) * x, col = (p, q) => new THREE.Color(p).lerp(new THREE.Color(q), x);
    const mix = (p, q) => (typeof p === 'number' ? num(p, q) : typeof p === 'string' ? col(p, q) : p.map((v, j) => mix(v, q[j])));
    return Object.fromEntries(Object.keys(a).map((key) => [key, mix(a[key], b[key])]));
  }
  const world = new THREE.Group();
  world.rotation.y = FACING;
  scene.add(world);
  const mod = (a, b) => ((a % b) + b) % b;
  let seed = 7; // 무늬가 매번 같게 시드 고정
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  const speckle = (g, w, h, n, rgb, a) => {
    for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${rgb},${rand() * a})`; g.fillRect(rand() * w, rand() * h, 2, 2); }
  };
  const lines = (g, pts) => { g.beginPath(); for (const [x0, y0, x1, y1] of pts) { g.moveTo(x0, y0); g.lineTo(x1, y1); } g.stroke(); };

  // 하늘: 세상에 고정된 돔이라 보는 방향마다 색이 다르다(예전엔 화면에 붙인 평면 그림이라 어디를 봐도 같았다)
  // 바탕 = 해 높이별 4단 그라데이션(머리 위 → 지평선, ENV_KEYS) 위에
  //  · 낮: 해 둘레가 밝다(미 산란)
  //  · 동틀 녘·해질 녘(해 -11° ~ +14°): 해 쪽 지평선이 주황 → 해가 더 내려가면 붉게
  //  · 반대편(해 -7° ~ +5°): 지평선 위로 지구 그림자(짙은 남색 띠)가 올라오고 그 위에 분홍 띠(비너스 띠)
  //  · 밤: 별, 맑은 날엔 구름 몇 조각(노을이면 구름도 물든다). 흐리면 위 효과가 잿빛에 묻힌다
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      c0: { value: new THREE.Color() }, c1: { value: new THREE.Color() }, c2: { value: new THREE.Color() }, c3: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, sunEl: { value: 0 },
      stars: { value: 0 }, clouds: { value: 0 }, cover: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z = gl_Position.w * 0.99999; // 가장 먼 곳
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 c0, c1, c2, c3, sunDir, sunCol;
      uniform float sunEl, stars, clouds, cover;
      varying vec3 vDir;
      float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
      float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p) { return 0.5 * n2(p) + 0.25 * n2(p * 2.03 + 7.1) + 0.125 * n2(p * 4.1 + 3.3) + 0.0625 * n2(p * 8.3); }
      void main() {
        vec3 d = normalize(vDir);
        float el = asin(clamp(d.y, -1.0, 1.0)), t = 1.0 - clamp(el / radians(60.0), 0.0, 1.0); // 0 = 머리 위, 1 = 지평선
        vec3 col = t < 0.5 ? mix(c0, c1, t / 0.5) : t < 0.8 ? mix(c1, c2, (t - 0.5) / 0.3) : mix(c2, c3, (t - 0.8) / 0.2);
        float sd = degrees(sunEl), clear = 1.0 - cover, cosA = dot(d, sunDir);
        // 수평으로 해 쪽 1, 반대 -1. 1 로 묶는다 — GPU 반올림으로 1 을 살짝 넘으면 아래 pow 의 밑이 음수가 돼 NaN(해 방위·반대 방위에
        // 세로로 검은 점선이 생겼고, 심도가 그 점을 흐림 원 크기의 검은 동그라미로 키웠다)
        float cH = clamp(dot(normalize(d.xz + 1e-5), normalize(sunDir.xz + 1e-5)), -1.0, 1.0);
        float day = smoothstep(-4.0, 6.0, sd);
        col += sunCol * clear * day * (0.22 * pow(max(cosA, 0.0), 6.0) + 0.6 * pow(max(cosA, 0.0), 140.0));
        float tw = smoothstep(-11.0, -2.0, sd) * (1.0 - smoothstep(5.0, 14.0, sd));
        vec3 warm = mix(vec3(0.72, 0.10, 0.04), vec3(1.0, 0.48, 0.16), smoothstep(-6.0, 5.0, sd));
        col = mix(col, warm, clear * tw * exp(-max(el, 0.0) / 0.16) * pow(0.5 + 0.5 * cH, 2.5) * 0.85);
        float bv = smoothstep(-7.0, -2.0, sd) * (1.0 - smoothstep(1.0, 5.0, sd)) * clear, anti = pow(0.5 - 0.5 * cH, 2.0);
        float sh = radians(mix(2.0, 9.0, smoothstep(0.0, -6.0, sd))); // 해가 질수록 지구 그림자가 올라온다
        col = mix(col, vec3(0.06, 0.07, 0.15), bv * anti * (1.0 - smoothstep(sh * 0.6, sh, el)) * 0.6);
        col = mix(col, vec3(0.55, 0.24, 0.30), bv * anti * smoothstep(sh * 0.8, sh * 1.3, el) * (1.0 - smoothstep(sh * 1.6, sh * 3.2, el)) * 0.55);
        if (stars > 0.0 && el > 0.02) {
          float s = h3(floor(d * 300.0));
          col += vec3(smoothstep(0.9965, 1.0, s) * 3.0) * stars * smoothstep(0.02, 0.25, el);
        }
        if (clouds > 0.0 && el > 0.0) {
          float cl = smoothstep(0.58, 0.8, fbm(d.xz / (d.y + 0.12) * 1.1 + 3.7)) * clouds * smoothstep(0.0, 0.12, el);
          vec3 cc = mix(vec3(1.0), warm * 1.15, tw * 0.75) * (0.18 + 0.82 * max(day, 0.0));
          col = mix(col, cc, cl * 0.75);
        }
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(170, 48, 24), skyMat);
  skyDome.renderOrder = -1;
  skyDome.frustumCulled = false;
  world.add(skyDome); // 그림 모드의 노멀 패스에서 세상과 함께 숨는다
  for (let i = 0; i < 438; i++) rand(); // 예전 별·구름 자리가 쓰던 만큼 난수를 넘긴다 → 뒤의 건물·무늬가 전과 같다
  scene.fog = new THREE.Fog('#d6e6f3', 25, 110);
  // 빛·그림자: 화면 속 광원이 캐릭터를 비추고(명암·자기 그림자) 바닥에 그림자를 떨군다.
  // 낮은 하늘의 해(역광), 밤은 가까운 가로등들(가로등 만드는 곳에서). light 는 채움 빛(낮 하늘·땅 반사, 밤 달빛)으로만 남긴다.
  // 캐릭터가 제자리라 그림자도 발밑에서 같이 뛴다. 바닥은 빛을 안 받는 재질이라 그림자만 받는 투명 판을 산책로·풀밭 위에 깐다(천 쪽은 수면이 낮아 비운다)
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const shadowAim = new THREE.Object3D(); // 그림자 빛이 겨누는 곳: 캐릭터 허리
  shadowAim.position.set(0, 0.8, 0);
  scene.add(shadowAim);
  function shadowLight(l, size) {
    l.castShadow = true;
    l.target = shadowAim;
    l.shadow.mapSize.set(size, size);
    l.shadow.bias = -0.0005;
    l.shadow.normalBias = 0.02;
    scene.add(l);
    return l;
  }
  // 해: 하늘에 그린 해와 같은 방위에서 비춘다. 방위·높이·색·세기는 시간이 정한다(applyTime). 해가 낮으면 그림자가 길어 틀을 넓게 잡는다
  const sun = shadowLight(new THREE.DirectionalLight('#ffffff', 0), 2048);
  Object.assign(sun.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 0.5, far: 14 });
  vrm.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); // 팔이 몸통에 드리우는 그림자까지
  const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(5, 8).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.45, depthWrite: false }));
  shadowCatcher.position.set(1.25, 0.003, 0); // x: -1.25(천 둑) ~ 3.75
  shadowCatcher.receiveShadow = true;
  world.add(shadowCatcher);

  // 바닥 띠와 석축: 무늬 한 칸 길이(tile)마다 반복, UV 오프셋으로 흐른다
  const LEN = 90;
  const scrolling = []; // [텍스처, 한 칸 길이(m), 오프셋 축]
  const groundMats = []; // 시간에 따라 색을 곱해 어둡게
  function ground(x0, x1, y, tex, tile) {
    tex.repeat.set(1, LEN / tile);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, LEN).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex }));
    groundMats.push(m.material);
    m.position.set((x0 + x1) / 2, y, 0);
    world.add(m);
    scrolling.push([tex, tile, 'y']);
  }
  function wall(x, y0, y1, tex, tile) { // 카메라 쪽(+X)을 본다
    tex.repeat.set(LEN / tile, 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(LEN, y1 - y0).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex }));
    groundMats.push(m.material);
    m.position.set(x, (y0 + y1) / 2, 0);
    world.add(m);
    scrolling.push([tex, tile, 'x']);
  }
  const pavers = () => canvasTex(256, 256, (g, w, h) => { // 보도블록 2×4
    g.fillStyle = DAY.path[0]; g.fillRect(0, 0, w, h); speckle(g, w, h, 500, '255,255,255', 0.06);
    g.strokeStyle = DAY.path[1]; g.lineWidth = 5;
    lines(g, [[0, 0, w, 0], [0, h / 4, w, h / 4], [0, h / 2, w, h / 2], [0, h * 0.75, w, h * 0.75], [0, h, w, h], [0, 0, 0, h], [w / 2, 0, w / 2, h], [w, 0, w, h]]);
  });
  const grass = (c) => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = c; g.fillRect(0, 0, w, h); speckle(g, w, h, 700, '0,0,0', 0.25); speckle(g, w, h, 300, '210,235,190', 0.12);
  });
  const stone = () => canvasTex(256, 64, (g, w, h) => { // 엇갈린 석축
    g.fillStyle = DAY.wall; g.fillRect(0, 0, w, h); speckle(g, w, h, 300, '0,0,0', 0.25);
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 3;
    lines(g, [[0, 0, w, 0], [0, h / 2, w, h / 2], [0, h, w, h]]);
    for (let x = 0; x < w; x += w / 4) lines(g, [[x, 0, x, h / 2], [x + w / 8, h / 2, x + w / 8, h]]);
  });
  ground(1.3, 10, 0, grass(DAY.grass[0]), 3);        // 카메라 쪽 풀밭
  ground(-1.25, 1.3, 0, pavers(), 2.5);              // 산책로 — 바로 뒤가 천
  wall(-1.25, -0.3, 0, stone(), 3);                  // 이쪽 석축
  wall(-4.3, -0.3, 0.05, stone(), 3);                // 건너편 석축
  ground(-14, -4.3, 0.05, grass(DAY.grass[1]), 3);    // 건너편 둔치
  ground(-70, -14, 0.04, grass(DAY.grass[1]), 6);     // 먼 땅

  // 천: 잔물결이 세상과 함께 흐르고, 밤엔 가로등이 물 위에 끊어진 빛 기둥으로 비친다
  const LAMP_GAP = 9, LAMP_N = 12, LAMP_X = -4.9;
  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      scroll: { value: 0 }, time: { value: 0 }, gap: { value: LAMP_GAP },
      deep: { value: new THREE.Vector3() }, light: { value: new THREE.Vector3() }, lamp: { value: 0 }, sparkle: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vP;
      void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform float scroll, time, gap, lamp, sparkle;
      uniform vec3 deep, light;
      varying vec3 vP;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float z = vP.z + scroll; // 세상과 함께 흐르는 좌표
        float rip = vnoise(vec2(vP.x * 3.0, (z + time * 0.3) * 1.2)) * 0.6 + vnoise(vec2(vP.x * 9.0, (z + time * 0.6) * 3.5)) * 0.4;
        vec3 col = mix(deep, light, rip);
        float d = mod(z + gap * 0.5, gap) - gap * 0.5; // 가장 가까운 가로등까지
        float broken = smoothstep(0.45, 0.75, vnoise(vec2(vP.x * 6.0 + time * 0.5, z * 10.0)));
        col += vec3(1.0, 0.72, 0.38) * exp(-d * d / 0.08) * broken * (0.35 + 0.65 * smoothstep(1.5, -1.5, vP.x)) * lamp;
        col += step(0.86, vnoise(vec2(vP.x * 14.0 + time * 0.8, z * 6.0 - time))) * sparkle; // 낮 햇빛 반짝임
        gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0);
      }
    `,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3.05, LEN).rotateX(-Math.PI / 2), waterMat);
  water.position.set(-2.775, -0.25, 0); // 낮은 카메라에서도 보이게 수면을 둑 바로 아래로
  world.add(water);

  // 가로등 12개를 9m 간격으로 돌려 쓴다(기하는 한 벌만 만들어 공유)
  // 실제 LED 가로등처럼: 납작한 헤드 아래 렌즈만 빛나고, 번짐은 광원 바로 둘레에서 빨리 사라지는 작은 빛무리.
  // 바닥 불빛은 점광원 조도 — 높이 h, 거리 r 에서 E ∝ (1 + (r/h)²)^-1.5 — 로 경계 없이 넓게 퍼진다. 눈 오는 밤엔 렌즈 아래 빛기둥이 은은하다
  const LAMP_H = 3.48, POOL_R = 6;
  const radial = (size, f) => canvasTex(size, size, (g, w) => { // 가운데에서 가장자리(r=1)까지 f(r) 을 알파로
    const img = g.createImageData(w, w);
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(255 * f(Math.hypot(x + 0.5 - w / 2, y + 0.5 - w / 2) / (w / 2)));
      }
    }
    g.putImageData(img, 0, 0);
  });
  const flare = radial(128, (r) => (1 / (1 + (r / 0.07) ** 2)) * Math.max(0, 1 - r) ** 2);
  const poolTex = radial(128, (r) => (1 + ((r * POOL_R) / LAMP_H) ** 2) ** -1.5 * (1 - Math.min(1, Math.max(0, (r - 0.8) / 0.2))));
  for (const t of [flare, poolTex]) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  const glow = canvasTex(64, 64, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
  glow.wrapS = glow.wrapT = THREE.ClampToEdgeWrapping;
  const postGeo = new THREE.CylinderGeometry(0.05, 0.07, 3.6, 8), armGeo = new THREE.BoxGeometry(0.6, 0.05, 0.05);
  const headGeo = new THREE.BoxGeometry(0.5, 0.07, 0.2), lensGeo = new THREE.PlaneGeometry(0.4, 0.14).rotateX(Math.PI / 2); // 렌즈는 아래를 본다
  const poolGeo = new THREE.PlaneGeometry(POOL_R * 2, POOL_R * 2).rotateX(-Math.PI / 2);
  const beamGeo = new THREE.CylinderGeometry(0.1, 2.2, LAMP_H, 24, 1, true).translate(0, -LAMP_H / 2, 0); // 꼭대기 = 렌즈
  const postMat = new THREE.MeshBasicMaterial({ color: '#4a4f58' }); // 기둥·헤드·렌즈 색, 빛무리·바닥 불빛·빛기둥 세기는 시간이 정한다(켜짐 0~1)
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#c9ccd2' });
  const haloMat = new THREE.SpriteMaterial({ map: flare, color: LAMP[0], blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: LAMP[0], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  // 빛기둥: 표면이 눈을 정면으로 볼수록(가운데) 진하고 가장자리로 갈수록 옅게 → 부피가 있는 빛처럼. 아래로 갈수록 흐려진다
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(LAMP[0]) }, strength: { value: 0 }, fogNear: { value: 14 }, fogFar: { value: 60 } },
    vertexShader: /* glsl */`
      varying vec3 vN, vV;
      varying float vH, vD;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vH = -position.y / ${LAMP_H.toFixed(2)};
        vD = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 color;
      uniform float strength, fogNear, fogFar;
      varying vec3 vN, vV;
      varying float vH, vD;
      void main() {
        float face = pow(abs(dot(vN, vV)), 2.0), fall = pow(max(1.0 - vH, 0.0), 1.6), fog = 1.0 - smoothstep(fogNear, fogFar, vD);
        gl_FragColor = vec4(color * strength * face * fall * fog, 1.0);
      }
    `,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const lamps = [];
  for (let i = 0; i < LAMP_N; i++) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(postGeo, postMat); post.position.y = 1.8;
    const arm = new THREE.Mesh(armGeo, postMat); arm.position.set(0.3, 3.55, 0);
    const head = new THREE.Mesh(headGeo, postMat); head.position.set(0.62, 3.52, 0);
    const lens = new THREE.Mesh(lensGeo, bulbMat); lens.position.set(0.62, LAMP_H, 0);
    const halo = new THREE.Sprite(haloMat); halo.position.set(0.62, LAMP_H - 0.02, 0); halo.scale.setScalar(0.9);
    const pool = new THREE.Mesh(poolGeo, poolMat); pool.position.set(0.62, 0.07, 0);
    const beam = new THREE.Mesh(beamGeo, beamMat); beam.position.set(0.62, LAMP_H - 0.02, 0);
    g.add(post, arm, head, lens, halo, pool, beam);
    g.position.x = LAMP_X;
    world.add(g);
    lamps.push(g);
  }
  // 우리 쪽 가로등: 카메라 뒤라 화면엔 안 보이고, 빛·그림자와 바닥에 번지는 불빛만 보인다. 건너편과 반 칸 엇갈려 선다
  const NEAR_LAMP_X = 3.5, BULB = { x: LAMP_X + 0.62, y: LAMP_H };
  const nearPools = Array.from({ length: LAMP_N }, () => {
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.position.set(NEAR_LAMP_X - 0.62, 0.07, 0); // 헤드는 길 쪽으로 나와 있다
    world.add(pool);
    return pool;
  });
  // 가로등 빛: 건너편 2 + 우리 쪽 2(가장 가까운 것들). 멀어지는 쪽은 옅게 넘겨줘서 가로등을 지나도 빛이 튀지 않는다
  const lampLights = [0, 1, 2, 3].map(() => {
    const l = shadowLight(new THREE.SpotLight(LAMP[0], 0, 0, 0.6, 0.5, 2), 1024);
    Object.assign(l.shadow.camera, { near: 1, far: 14 });
    return l;
  });

  // 건너편 건물 18채를 7m 간격으로 돌려 쓴다(낮=유리창, 밤=불 켜진 창)
  const BLD_GAP = 7, BLD_N = 18;
  const windowsTex = (wall, lit, p) => canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    g.fillStyle = lit;
    for (let y = 6; y < h - 6; y += 12) for (let x = 5; x < w - 5; x += 10) if (rand() < p) g.fillRect(x, y, 5, 7);
  });
  const winDay = windowsTex('#aebdd0', '#6c84a3', 1), winNight = windowsTex('#0c1426', '#ffd58a', 0.3);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const blds = [];
  for (let i = 0; i < BLD_N; i++) {
    const w = 5 + rand() * 6, h = 6 + rand() * 12;
    const [day, night] = [winDay, winNight].map((t) => {
      const c = t.clone();
      c.repeat.set(Math.round(w / 3), Math.round(h / 6));
      c.needsUpdate = true;
      return c;
    });
    const m = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ map: day }));
    m.userData = { day, night };
    m.scale.set(w, h, w);
    m.position.set(-45 - rand() * 15, h / 2, 0); // 멀리 두어 하늘을 가리지 않게
    world.add(m);
    blds.push(m);
  }

  // 해·달: 무한히 멀어서 흐르지 않는다
  const orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, fog: false, depthWrite: false }));
  world.add(orb);

  // ---- 눈·비: 세상에 고정된 알갱이가 떨어지고(눈 0.8~1.3 m/s, 비 7~9 m/s) 땅과 같이 뒤로 흐른다 ----
  // 러너·카메라가 앞으로 달리니 화면에선 뒤로 비스듬히 내린다(기울기 = 달리는 속도 : 낙하 속도). 멈추면 똑바로.
  // 가까운 알갱이는 빠르고 먼 것은 느리다(원근). 셔터 동안 움직인 만큼 늘여 그려 빠른 것은 줄로 보인다(비는 긴 빗줄기)
  // 상자(m): 러너 둘레, 카메라 쪽(+x)까지. rim = 잉크 테두리, day·night = 가로등 빛이 없을 때 색(시간이 섞는다)
  const SNOW = { x: [-8, 6], y: 5, z: 20 };
  const PRECIP = {
    snow: { n: 1000, fall: [0.8, 0.5], radius: 0.01, shutter: 1 / 100, sway: 0.12, rim: 0.8, alpha: 1, maxLen: 48, day: '#ffffff', night: '#5d6680' },
    rain: { n: 1400, fall: [7, 2], radius: 0.0035, shutter: 1 / 60, sway: 0, rim: 0, alpha: 0.5, maxLen: 90, day: '#c3cfdd', night: '#4a5266' },
  };
  const PR = PRECIP[WX.precip];
  let stepSnow = null, snowBase = null;
  if (PR) {
    const pos = new Float32Array(PR.n * 3), fall = new Float32Array(PR.n), sway = new Float32Array(PR.n);
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < PR.n; i++) {
      pos.set([SNOW.x[0] + rnd() * (SNOW.x[1] - SNOW.x[0]), rnd() * SNOW.y, (rnd() - 0.5) * SNOW.z], i * 3);
      fall[i] = PR.fall[0] + PR.fall[1] * rnd();
      sway[i] = rnd() * Math.PI * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('fall', new THREE.BufferAttribute(fall, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        runV: { value: 0 }, shutter: { value: PR.shutter }, radius: { value: PR.radius }, res: { value: new THREE.Vector2(W, H) },
        rimK: { value: PR.rim }, alpha: { value: PR.alpha }, maxLen: { value: PR.maxLen },
        base: { value: new THREE.Color('#ffffff') }, // 가로등 빛이 없을 때 눈 색(밤은 어둑한 푸른빛) — 시간이 정한다
        lampColor: { value: new THREE.Color(LAMP[0]) },
        lampPos: { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) }, lampPow: { value: [0, 0, 0, 0] },
      },
      vertexShader: /* glsl */`
        attribute float fall;
        uniform float runV, shutter, radius, maxLen;
        uniform vec2 res;
        uniform vec3 base, lampColor, lampPos[4];
        uniform float lampPow[4];
        varying vec2 vDir;
        varying vec3 vCol;
        varying float vLen, vR, vFade, vSize;
        void main() {
          // 가로등 빛: 렌즈 아래쪽으로만, 거리 제곱에 반비례
          vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
          float lit = 0.0;
          for (int i = 0; i < 4; i++) {
            vec3 d = wp - lampPos[i];
            lit += lampPow[i] * smoothstep(-0.2, 0.6, -d.y / length(d)) * 5.0 / (dot(d, d) + 1.2);
          }
          vCol = min(base + lampColor * lit, vec3(1.3));
          vec3 vel = vec3(0.0, -fall, -runV); // world 로컬 m/s(+z 가 달리는 방향, 땅과 눈은 -z 로 흐른다)
          vec4 c0 = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vec4 c1 = projectionMatrix * modelViewMatrix * vec4(position - vel * shutter, 1.0);
          vec2 d = (c0.xy / c0.w - c1.xy / c1.w) * res * 0.5; // 셔터 동안 화면에서 움직인 거리(px)
          vLen = min(length(d), maxLen);
          vDir = vLen > 0.01 ? normalize(d) : vec2(0.0, -1.0);
          vR = clamp(radius * projectionMatrix[1][1] * res.y * 0.5 / c0.w, 0.7, 6.0);
          vFade = smoothstep(0.35, 1.0, c0.w); // 카메라에 붙은 눈은 지운다
          vSize = vLen + 2.0 * vR + 4.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position - vel * shutter * 0.5, 1.0); // 줄 가운데
          gl_PointSize = vSize;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float rimK, alpha;
        varying vec2 vDir;
        varying vec3 vCol;
        varying float vLen, vR, vFade, vSize;
        const vec3 INK = vec3(0.020, 0.004, 0.029); // 후처리 잉크색(짙은 자주)의 선형값
        void main() {
          vec2 q = (gl_PointCoord - 0.5) * vSize;
          q.y = -q.y; // gl_PointCoord 는 y 가 아래로
          float t = clamp(dot(q, vDir) / max(vLen, 0.001) + 0.5, 0.0, 1.0);
          float dist = length(q - vDir * vLen * (t - 0.5)); // 줄(선분)까지 거리
          float core = 1.0 - smoothstep(vR - 0.8, vR + 0.4, dist);
          float rim = (1.0 - smoothstep(vR + 0.4, vR + 1.6, dist)) * rimK;
          float a = 1.0 - (1.0 - rim) * (1.0 - core);
          if (a * vFade * alpha < 0.12) discard; // 옅은 가장자리는 버린다(깊이를 남기므로)
          gl_FragColor = vec4((INK * rim * (1.0 - core) + vCol * core) / a, a * vFade * alpha);
        }
      `,
      transparent: true,
      depthWrite: true, // 심도가 알갱이마다 제 거리로 흐리게(옅은 가장자리는 위에서 버린다)
    });
    snowBase = mat.uniforms.base.value;
    const flakes = new THREE.Points(geo, mat);
    flakes.frustumCulled = false;
    world.add(flakes);
    stepSnow = (dt, dz, t) => {
      if (dt <= 0) return;
      mat.uniforms.runV.value += (dz / dt - mat.uniforms.runV.value) * Math.min(1, dt * 8); // 땅이 흐르는 속도 = 달리는 속도
      lampLights.forEach((l, i) => { mat.uniforms.lampPos.value[i].copy(l.position); mat.uniforms.lampPow.value[i] = l.intensity / LAMP[1]; });
      for (let i = 0, k = 0; i < PR.n; i++, k += 3) {
        pos[k] = SNOW.x[0] + mod(pos[k] - SNOW.x[0] + PR.sway * Math.sin(sway[i] + t * 1.3) * dt, SNOW.x[1] - SNOW.x[0]); // 살랑
        pos[k + 1] = mod(pos[k + 1] - fall[i] * dt, SNOW.y);
        pos[k + 2] = mod(pos[k + 2] - dz + SNOW.z / 2, SNOW.z) - SNOW.z / 2;
      }
      geo.attributes.position.needsUpdate = true;
    };
  }

  // ---- 입김: 추운 날 내쉰 숨의 수증기가 찬 공기에서 작은 물방울이 되어 '빛을 흩어서' 보인다 ----
  // 그래서 늘 같은 흰 공이 아니다(예전엔 동그란 흰 점 3개가 한꺼번에 나와 인위적이었다):
  // ① 빛: 가로등·해에서 오는 빛이 김을 지나 카메라로 앞쪽 산란할 때(역광) 가장 밝다(헤니-그린스타인 g=0.6). 가로등은 눈송이처럼
  //    렌즈 아래 원뿔 + 거리 제곱 감쇠. 빛이 없으면 하늘빛(밤엔 어둑한 푸른빛)만 받아 거의 안 보인다
  // ② 모양: 0.3초 동안 입에서 줄기로 뿜어져(초속 1m 안팎, 살짝 아래로) 공기 저항에 금방 서고, 섞이며 커지고(√t) 옅어진다.
  //    한 덩이는 연기 결(노이즈) — 둥근 테두리가 안 보인다
  // ③ 공기에 남는다: 달리면 땅과 같이 뒤로 흘러 얼굴 옆을 스쳐 간다
  // 호흡: 달릴 땐 2:2(양발 한 주기에 한 번), 말할 땐 0.7초마다 짧게, 서 있으면 3초마다
  const BREATH = { n: 160, rate: 46, burst: 0.3, life: [1.5, 2.3], alpha: 0.26 };
  let stepBreath = null, breathAmb = null;
  if (WX.cold) {
    const B = BREATH.n, quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    const center = new Float32Array(B * 3), look = new Float32Array(B * 3); // look = 크기(m)·진하기·씨앗
    geo.setAttribute('center', new THREE.InstancedBufferAttribute(center, 3));
    geo.setAttribute('look', new THREE.InstancedBufferAttribute(look, 3));
    geo.instanceCount = B;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        amb: { value: new THREE.Color('#d8dde5') }, lampColor: { value: new THREE.Color(LAMP[0]) },
        lampPos: { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) }, lampPow: { value: [0, 0, 0, 0] },
        sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color(0, 0, 0) }, time: { value: 0 },
      },
      vertexShader: /* glsl */`
        attribute vec3 center, look;
        uniform vec3 amb, lampColor, lampPos[4], sunDir, sunCol;
        uniform float lampPow[4];
        varying vec2 vUv;
        varying vec3 vCol;
        varying float vA, vSeed;
        float hg(float c) { const float g = 0.6; return 0.25 * (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * c, 1.5); } // 앞쪽 산란
        void main() {
          vec3 wp = (modelMatrix * vec4(center, 1.0)).xyz, toCam = normalize(cameraPosition - wp);
          vec3 lit = amb * 0.55;
          for (int i = 0; i < 4; i++) {
            vec3 d = wp - lampPos[i];
            float cone = smoothstep(-0.2, 0.6, -d.y / length(d));
            lit += lampColor * lampPow[i] * cone * 11.0 / (dot(d, d) + 1.2) * hg(dot(normalize(d), toCam));
          }
          lit += sunCol * hg(dot(-sunDir, toCam)) * 0.9;
          vCol = min(lit, vec3(1.4));
          vUv = uv;
          vA = look.y;
          vSeed = look.z;
          vec4 mv = modelViewMatrix * vec4(center, 1.0);
          float r = vSeed * 6.2832; // 덩이마다 돌려 결이 겹치지 않게
          vec2 q = mat2(cos(r), sin(r), -sin(r), cos(r)) * position.xy;
          mv.xy += q * look.x;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */`
        uniform float time;
        varying vec2 vUv;
        varying vec3 vCol;
        varying float vA, vSeed;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          vec2 p = vUv - 0.5;
          float r = length(p) * 2.0;
          if (r > 1.0) discard;
          vec2 o = vec2(vSeed * 17.0, vSeed * 31.0) + vec2(0.0, time * 0.25); // 천천히 일렁이는 결
          float f = 0.55 * n(p * 3.0 + o) + 0.3 * n(p * 6.5 + o * 1.7) + 0.15 * n(p * 13.0 - o);
          float d = smoothstep(0.25, 0.85, f) * pow(1.0 - r * r, 1.6);
          float a = d * vA;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vCol, a);
        }
      `,
      transparent: true,
      depthWrite: false,
    });
    const cloud = new THREE.Mesh(geo, mat);
    cloud.frustumCulled = false;
    world.add(cloud);
    breathAmb = mat.uniforms.amb.value;
    const P = Array.from({ length: B }, () => ({ age: 99, life: 2, v: new THREE.Vector3(), p: new THREE.Vector3(), g: 1, seed: Math.random() }));
    const mouth = headBone.worldToLocal(new THREE.Vector3(0, 8, 112).applyMatrix4(HEAD)); // 입 앞(머리 틀 mm) → 머리뼈 기준
    let next = 0, lastBeat = -9, lastCycle = 0, burstUntil = -1, burstRate = 0, carry = 0;
    const tmp = new THREE.Vector3();
    stepBreath = (dt, dz, t) => {
      const cycle = Math.floor(phase / (Math.PI * 2)), talkNow = reading && speaking;
      const exhale = speed > 0.3 ? cycle !== lastCycle : t - lastBeat > (talkNow ? 0.7 : 3);
      lastCycle = cycle;
      if (exhale) { lastBeat = t; burstUntil = t + (talkNow ? 0.18 : BREATH.burst); burstRate = BREATH.rate * (talkNow ? 0.6 : 1); }
      if (t < burstUntil) { // 뿜는 동안 덩이를 흘려보낸다
        carry += burstRate * dt;
        const fwd = new THREE.Vector3(0, 0, 1); // 얼굴 쪽(달리는 방향)
        const side = new THREE.Vector3().crossVectors(Y_AXIS, fwd);
        for (; carry >= 1; carry--) {
          const q = P[next];
          next = (next + 1) % B;
          world.worldToLocal(headBone.localToWorld(q.p.copy(mouth)));
          q.v.copy(fwd).multiplyScalar(0.8 + 0.5 * Math.random()).addScaledVector(side, (Math.random() - 0.5) * 0.3).add(tmp.set(0, -0.22 + (Math.random() - 0.5) * 0.2, 0));
          q.age = Math.random() * dt;
          q.life = BREATH.life[0] + Math.random() * (BREATH.life[1] - BREATH.life[0]);
          q.g = 0.8 + 0.4 * Math.random();
          q.seed = Math.random();
        }
      }
      for (let i = 0; i < B; i++) {
        const q = P[i];
        q.age += dt;
        if (q.age >= q.life) { look[i * 3 + 1] = 0; continue; }
        const drag = Math.exp(-dt * 3.2); // 공기 저항: 뿜은 기세가 0.3초 안에 선다
        q.v.multiplyScalar(drag);
        q.v.y += 0.05 * dt; // 아주 살짝 뜬다(숨이 주변보다 따뜻하다)
        q.v.x += Math.sin(q.seed * 40 + q.age * 3.1) * 0.25 * dt; // 섞이며 일렁임
        q.p.addScaledVector(q.v, dt);
        q.p.z -= dz; // 공기에 남는다 → 땅과 같이 뒤로
        const u = q.age / q.life;
        center.set([q.p.x, q.p.y, q.p.z], i * 3);
        look[i * 3] = (0.035 + 0.3 * Math.sqrt(q.age)) * q.g; // 섞이며 커진다
        look[i * 3 + 1] = BREATH.alpha * Math.min(1, q.age / 0.06) * Math.exp(-1.4 * q.age) * (1 - u) ** 0.7; // 마르며 옅어진다
        look[i * 3 + 2] = q.seed;
      }
      geo.attributes.center.needsUpdate = true;
      geo.attributes.look.needsUpdate = true;
      lampLights.forEach((l, k) => { mat.uniforms.lampPos.value[k].copy(l.position); mat.uniforms.lampPow.value[k] = l.visible ? l.intensity / LAMP[1] : 0; });
      mat.uniforms.sunDir.value.copy(sun.position).normalize();
      mat.uniforms.sunCol.value.copy(sun.color).multiplyScalar(sun.visible ? sun.intensity * 0.6 : 0);
      mat.uniforms.time.value = t;
    };
  }

  // ---- 시간: 해가 6시에 달리는 앞쪽에서 떠 12시에 건너편(남쪽) 하늘 55° 까지 오르고 18시에 뒤쪽으로 진다 ----
  // 해 높이로 하늘·안개·바닥 밝기·물빛·건물 창·가로등(켜짐)·해/달 원반·그림자 진하기를 이어서 바꾼다
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  // 해 위치(NOAA 근사식): 서울(37.57°N 126.98°E, KST). 날짜(1월 1일부터 며칠째)·시각(시) → 고도(라디안)·방위(북 0, 시계 방향)
  // 달리는 방향 = 정북, 등 = 정남 → 아침 해는 오른쪽(동, 천·건너편 쪽)에서 떠서 정오엔 등 뒤 남쪽 하늘(하지 76° · 동지 29°), 저녁엔 왼쪽(서)으로 진다
  const LAT = 37.57, LON = 126.98, TZ = 9;
  function sunAt(day, h) {
    const g = ((2 * Math.PI) / 365) * (day - 1 + (h - 12) / 24);
    const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g)); // 균시차(분)
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g); // 적위
    const ha = ((((h * 60 + eqt + 4 * LON - 60 * TZ) / 4) - 180) * Math.PI) / 180, phi = (LAT * Math.PI) / 180; // 시간각
    const elev = Math.asin(Math.min(1, Math.max(-1, Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha))));
    const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) + Math.PI;
    return { elev, az };
  }
  let lampOn = 0;
  function applyTime(h) {
    const { elev, az } = sunAt(OPT.dy, h), deg = (elev * 180) / Math.PI;
    const env = envAt(deg), night = Math.min(1, Math.max(0, -deg / 10)), c = WX.cloud ?? 0;
    // 구름: 하늘을 잿빛으로 덮고 별·해·달을 가린다. 비·눈이면 안개가 가까워진다
    const gray = (dayHex, nightHex) => new THREE.Color(dayHex).lerp(new THREE.Color(nightHex), night);
    const overcast = [['#8e98a6', '#0c0f16'], ['#a8b1bc', '#141822'], ['#c3c9d0', '#1c2130'], ['#d3d7dc', '#262a36']].map(([d, n]) => gray(d, n));
    env.sky.forEach((col, i) => skyMat.uniforms[`c${i}`].value.copy(col).lerp(overcast[i], c));
    Object.assign(skyMat.uniforms.stars, { value: env.stars * (1 - c) });
    skyMat.uniforms.clouds.value = (1 - night) * (1 - c * 0.6) * 0.6;
    skyMat.uniforms.cover.value = c;
    skyMat.uniforms.sunEl.value = elev;
    const seeK = 1 - 0.3 * c - (WX.precip ? 0.25 : 0);
    scene.fog.color.copy(env.fog[0]).lerp(gray('#aab3be', '#1a1e29'), c);
    scene.fog.near = env.fog[1] * seeK;
    scene.fog.far = env.fog[2] * seeK;
    env.fog[1] *= seeK;
    env.fog[2] *= seeK;
    env.sun[1] *= 1 - 0.85 * c; // 구름 뒤 해: 그림자가 흐려지고 빛이 고르게 퍼진다
    env.key[1] *= 1 + 0.25 * c;
    env.shadow *= 1 - 0.75 * c * (1 - night);
    env.sparkle *= 1 - c;
    if (WX.wet) env.tint.multiplyScalar(0.72); // 젖은 바닥은 어둡다
    Object.assign(beamMat.uniforms, { fogNear: { value: env.fog[1] }, fogFar: { value: env.fog[2] } });
    light.color.copy(env.key[0]);
    light.intensity = env.key[1];
    // 해 빛: 너무 낮으면 그림자가 화면 밖까지 늘어나 빛의 높이만 8° 아래로 안 내린다
    const horiz = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az)), le = Math.max(elev, (8 * Math.PI) / 180); // world 로컬: +z 북(달리는 쪽), -x 동
    skyMat.uniforms.sunDir.value.copy(horiz).multiplyScalar(Math.cos(elev)).setY(Math.sin(elev)).applyAxisAngle(Y_AXIS, FACING);
    sun.position.copy(horiz).multiplyScalar(Math.cos(le)).setY(Math.sin(le)).applyAxisAngle(Y_AXIS, FACING).multiplyScalar(6);
    sun.color.copy(env.sun[0]);
    sun.intensity = env.sun[1];
    skyMat.uniforms.sunCol.value.copy(env.sun[0]).multiplyScalar(Math.min(1, env.sun[1] / 2.5));
    sun.visible = env.sun[1] > 0.01;
    // 해·달 원반(무한히 멀어서 흐르지 않는다). 구름이 덮으면 안 보인다
    orb.visible = c < 0.5;
    if (deg > -2) {
      orb.position.copy(horiz).multiplyScalar(Math.cos(elev)).setY(Math.sin(elev)).multiplyScalar(150);
      orb.material.color.copy(env.sun[0]).lerp(new THREE.Color('#fff6dc'), Math.min(1, Math.max(0, deg / 25)));
      orb.scale.setScalar(16);
    } else {
      orb.position.set(-120, 30, -85);
      orb.material.color.set('#dfe8ff');
      orb.scale.setScalar(9);
    }
    for (const m of groundMats) m.color.copy(env.tint);
    lensMat?.uniforms.tint.value.copy(env.tint);
    for (const b of blds) {
      b.material.map = night > 0.5 ? b.userData.night : b.userData.day;
      b.material.color.copy(night > 0.5 ? new THREE.Color('#ffffff') : env.tint);
    }
    waterMat.uniforms.deep.value.set(...env.water[0]);
    waterMat.uniforms.light.value.set(...env.water[1]);
    waterMat.uniforms.lamp.value = env.lamp * 0.9;
    waterMat.uniforms.sparkle.value = env.sparkle;
    lampOn = env.lamp;
    for (const m of [haloMat, poolMat, beamMat]) m.visible = lampOn > 0.01; // 꺼진 빛무리·불빛·빛기둥은 아예 안 그린다(투명이어도 화면을 덮는 판이라 무겁다)
    haloMat.opacity = lampOn;
    poolMat.opacity = 0.32 * lampOn;
    beamMat.uniforms.strength.value = (WX.precip ? 0.07 : 0.03) * lampOn; // 눈·비 오는 공기에선 빛기둥이 더 보인다
    bulbMat.color.set('#c9ccd2').lerp(new THREE.Color('#fff6e8'), lampOn);
    postMat.color.set('#4a4f58').lerp(new THREE.Color('#262b34'), night);
    shadowCatcher.material.opacity = env.shadow;
    snowBase?.set(PR.day).lerp(new THREE.Color(PR.night), night);
    breathAmb?.set('#d8dde5').lerp(new THREE.Color('#1a2030'), night).multiplyScalar(1 - 0.25 * c); // 김이 받는 하늘빛(밤엔 어둑)
  }
  applyTime(OPT.tm);

  let scrollZ = 0;
  function updateWorld(t, dz) {
    scrollZ += dz; // 디딤발이 뒤로 간 만큼(아래 다리 계산) — 감속하면 같이 느려진다
    for (const [tex, tile, axis] of scrolling) tex.offset[axis] = -scrollZ / tile;
    lamps.forEach((g, i) => { g.position.z = mod(i * LAMP_GAP - scrollZ, LAMP_GAP * LAMP_N) - LAMP_GAP * LAMP_N / 2; });
    nearPools.forEach((m, i) => { m.position.z = mod((i + 0.5) * LAMP_GAP - scrollZ, LAMP_GAP * LAMP_N) - LAMP_GAP * LAMP_N / 2; });
    // 밤: 양쪽에서 가장 가까운 가로등 두 개씩이 비춘다. 멀어질수록 옅게 넘겨줘서 가로등을 지나도 빛·그림자가 튀지 않는다
    const nearest = (list) => list.map((m) => m.position.z).sort((a, b) => Math.abs(a) - Math.abs(b)).slice(0, 2);
    [...nearest(lamps).map((z) => [BULB.x, z]), ...nearest(nearPools).map((z) => [NEAR_LAMP_X, z])].forEach(([x, z], i) => {
      const l = lampLights[i], w = Math.max(0, 1 - Math.abs(z) / LAMP_GAP);
      world.localToWorld(l.position.set(x, BULB.y, z));
      l.intensity = LAMP[1] * w * lampOn;
      l.shadow.intensity = w;
      l.visible = lampOn > 0.01; // 낮엔 꺼서 그림자 계산도 쉰다
    });
    blds.forEach((m, i) => { m.position.z = mod(i * BLD_GAP - scrollZ, BLD_GAP * BLD_N) - BLD_GAP * BLD_N / 2; });
    waterMat.uniforms.scroll.value = scrollZ;
    waterMat.uniforms.time.value = t;
  }

  // VRM0 은 정규화 뼈의 X·Z 축이 VRM1 과 반대다(모델이 180° 돌아 있음)
  const flip = isV0 ? -1 : 1;
  const bone = (name) => vrm.humanoid.getNormalizedBoneNode(name);
  const rot = (name, x, y, z) => bone(name)?.rotation.set(x * flip, y, z * flip);
  const hips = bone('hips');
  const hipsRestY = hips.position.y, hipsRestX = hips.position.x;

  // ---- 다리: 디딤발은 땅에 붙이고(2관절 IK), 스윙은 실제 러닝 관절 곡선으로. 땅은 디딤발이 뒤로 간 만큼만 흘린다 ----
  // 좌표는 world 로컬(+Z 가 달리는 방향). 각도는 '아래가 0, 뒤로 돌수록 +' — 정규화 뼈 X 회전과 같은 부호
  // 목표(조깅 대표값): 착지 무릎 ~18°·허벅지 앞 ~20°, 디딤 중간 무릎 ~45°, 이륙 무릎 ~22°·허벅지 뒤 ~15°(고관절 신전),
  // 스윙 무릎 최대 95~110°, 허벅지 최대 앞 38~45°, 골반 오르내림 5~6cm, 골반 회전 ±5°, 어깨는 반대로
  // 걸음 값 S 는 러닝 타입·페이스·케이던스·주법(컨트롤러) + 인터벌의 걷기 구간을 섞어 매 프레임 정한다(updateGait)
  // 달리기: 한 발이 주기의 40% 를 딛는다(한 걸음의 20% 공중 — 더 늘리면 떠다녀 보인다).
  // 걷기: 62% 를 딛어 두 발이 같이 닿는 구간이 생기고, 무릎을 거의 편 채 엉덩이는 디딤 한가운데에서 가장 높다(뒤집힌 진자)
  const RUN_FORM = { duty: 0.4, dutyMin: 0.27, kneeStrike: 0.31, kneePush: 0.26, elbow: 1.45, stepX: 0.04, armIn: 0.35, extFlight: 0.06, extPeak: 0.13 };
  // stepX = 착지 때 발목이 몸 중앙에서 떨어진 거리(m, 걸음 폭 8cm). 쉬는 자세 그대로면 발이 고관절 바로 밑(여자 ±7.8cm)에 떨어져 넓었다.
  // armIn = 팔이 가장 앞일 때 어깨를 안쪽으로 돌리는 양(rad) — 손이 어깨선에서 몸 중앙 쪽으로 온다
  // kneePush 0.26(이륙 무릎 15°) + extFlight(이륙 뒤 허벅지가 잠깐 더 뒤로, extPeak 에서 최대): 허벅지 최대 뒤 각 이지 12°→17°·레이스 16°→22°.
  // 기준: 절대각 허벅지는 이륙 때 ~29° 뒤·최대 신전은 체공 중(Clark 2020, 3.1~10m/s — 이지 2.6m/s 는 그보다 작다).
  // 신전을 공중에서 더 키우면(0.2) 발이 뒤→앞으로 급히 꺾여 발목 가속이 1.6배 — 이륙 무릎을 펴는 쪽이 떨림 비용이 거의 없다 // 빠른 페이스는 덜 딛고 더 난다(0.3 = 한 걸음의 40% 공중)
  const WALK = { duty: 0.62, kneeStrike: 0.05, kneePush: 0.2, elbow: 0.28, armIn: 0.12, drop: 0.01, knee: 1.05, thigh: 0.5, arm: 0.3, lean: 0.03, strike: -0.3, pace: 760, spm: 114, bob: 0.022, sway: 0.02, stepX: 0.055 };
  // 걷기(인터벌 회복·멈출 때) — 보통 걷기 관절 범위에 맞춘다: 무릎은 스윙 초반 ~60° 접힐 때 허벅지가 이미 ~15° 앞(그래서 발이 뒤로 높이 안 차인다),
  // 엉덩이 최대 굽힘 30~35°, 어깨 앞뒤 합 ~35°(arm 0.3 = ±17°), 팔꿈치는 거의 펴서(쉬는 굽힘 ~10°, 앞으로 올 때 조금 더) 늘어뜨린다,
  // 골반은 디딤발 쪽으로 ~2cm 옮겨 간다(sway), 걸음 폭 ~11cm(stepX). 회복 걷기 1.3m/s·114보 → 한 걸음 ~68cm
  // (예전엔 달리기 팔(팔꿈치 90°·몸에서 벌림)에 달리기 스윙 곡선 그대로라 뒷발이 높이 차이고 골반이 가운데 고정 — 로봇 같았다)
  const STRIKES = { rear: -0.22, mid: -0.03, fore: 0.24 }; // 착지 때 발끝 각(+ = 발끝이 아래 → 앞꿈치로 닿는다)
  const S = {};
  let walkMix = 0, stopWalk = 0; // stopWalk = 멈추며(다시 출발하며) 걷기로 넘어간 정도
  // 인터벌: 빠르게 run 초 → 걷기 rest 초를 오가고, 1.5초에 걸쳐 바뀐다
  function intervalWalk(t, { run, rest }) {
    const u = mod(t, run + rest), x = 1.5;
    return u < run ? (u < x ? 1 - ease(u / x) : 0) : ease((u - run) / x);
  }
  function updateGait(t) {
    const R = RUNS[OPT.rn], pace = OPT.pc || R.pace, spm = OPT.cd || R.spm;
    const w0 = R.walk ? intervalWalk(t, R.walk) : 0;
    walkMix = Math.max(w0, stopWalk);
    const w = walkMix, m = (a, b) => a + (b - a) * w;
    S.speedBase = 1000 / pace + (1000 / WALK.pace - 1000 / pace) * w0; // 멈춤과 상관없이 지금 달리려던 속도
    Object.assign(S, {
      kneeStrike: m(RUN_FORM.kneeStrike, WALK.kneeStrike), kneePush: m(RUN_FORM.kneePush, WALK.kneePush),
      elbow: m(RUN_FORM.elbow, WALK.elbow), armIn: m(RUN_FORM.armIn, WALK.armIn), drop: m(R.drop, WALK.drop), knee: m(R.knee, WALK.knee), thigh: m(R.thigh, WALK.thigh),
      arm: m(R.arm, WALK.arm), lean: m(R.lean, WALK.lean), strike: m(STRIKES[OPT.st], WALK.strike),
      speed: m(1000 / pace, 1000 / WALK.pace), cadence: m(spm, WALK.spm) / 120, // 속도(m/s), 주기(양발 한 번, Hz)
    });
  }
  // 착지 탄성: 공중 시간·위아래 폭(5cm 안팎)은 그대로 두고 '모양'만 스프링으로 —
  // 디딤 동안 다리가 스프링처럼 눌렸다 튕겨 올리고(반 사인), 공중에선 중력 포물선. 이륙 속도가 포물선으로 그대로 이어진다
  const G = 9.81, BOUNCE = 1.0; // 실제 중력 그대로(공중 시간이 페이스에 따라 늘면 튕김도 그만큼)
  const CONTACT_LIFT = 0.026; // 착지·이륙 순간 엉덩이 높이(다리 길이 대비)를 전과 같게 → 무릎 각·보폭은 그대로
  // 곡선은 한 걸음 시간 T=1 기준 모양을 2차 푸리에로 근사해 둔다 → 착지·이륙 순간의 꺾임(가속도 튐 = 화면이 틱틱 끊겨 보임) 없이
  // '바닥은 부드럽게 눌리고 꼭대기는 조금 빨리 넘어가는' 비대칭만 남는다. 꼭대기 가속 ≈ 1.16g(3차는 1.4g 로 얼굴이 톡 튀었다)
  // 높이는 T² 에 비례(이륙 속도 ∝ T, 눌림 ∝ 속도 × 디딤 시간)
  const BOUNCE_SHAPES = new Map(); // 딛는 비율(0.005 단위)마다 한 번만 만든다
  const bounceShape = (duty) => {
    const key = Math.round(duty * 200);
    if (!BOUNCE_SHAPES.has(key)) BOUNCE_SHAPES.set(key, fourier(key / 200));
    return BOUNCE_SHAPES.get(key);
  };
  function fourier(duty) {
    const s = 2 * duty, v0 = (G * (1 - s)) / 2, N = 400; // s = 한 걸음 중 딛는 비율, v0 = 이륙·착지 속도
    const f = (u) => (u < s ? -((v0 * s) / Math.PI) * Math.sin((Math.PI * u) / s) : v0 * (u - s) - (G * (u - s) ** 2) / 2);
    return [0, 1, 2].map((k) => {
      let a = 0, b = 0;
      for (let i = 0; i < N; i++) {
        const w = 2 * Math.PI * k * (i / N), y = f(i / N);
        a += y * Math.cos(w);
        b += y * Math.sin(w);
      }
      return [(a * (k ? 2 : 1)) / N, (b * 2) / N];
    });
  }
  function bounce(p, freq) {
    const T = 1 / (2 * freq), u = mod(p / Math.PI, 1); // 한 걸음 시간, 걸음 안 위치(0 = 착지)
    let y = 0;
    bounceShape(S.dutyRun).forEach(([a, b], k) => { y += a * Math.cos(2 * Math.PI * k * u) + b * Math.sin(2 * Math.PI * k * u); });
    return BOUNCE * T * T * y;
  }
  // (착지 순간 상체·머리 잔떨림은 넣지 않는다 — 걸음마다 끊겨 시작해 얼굴이 틱틱 튄다. 탄성은 위 곡선 모양으로만)
  const body = new THREE.Object3D(); // 다리 계산 기준 틀: 달리는 방향 + 브리핑 때 카메라 쪽으로 돈 만큼(캐릭터와 같이 돈다)
  body.rotation.y = FACING;
  scene.add(body);
  body.updateMatrixWorld();
  const toChar = (v) => body.worldToLocal(v);
  const jointAt = (name) => toChar(bone(name).getWorldPosition(new THREE.Vector3()));
  world.updateMatrixWorld();
  const LEGS = ['left', 'right'].map((side) => {
    const hip = jointAt(`${side}UpperLeg`), knee = jointAt(`${side}LowerLeg`), ankle = jointAt(`${side}Foot`);
    const seg = (a, b) => ({ len: Math.hypot(b.y - a.y, b.z - a.z), ang: Math.atan2(a.z - b.z, a.y - b.y) });
    // 발 구르기의 받침점(발목 기준): 앞꿈치 = 발가락 뼈 자리, 뒤꿈치 = 발목 뒤 같은 높이
    const toes = bone(`${side}Toes`) ? jointAt(`${side}Toes`) : null;
    const ball = toes ? { z: toes.z - ankle.z, y: toes.y - ankle.y } : { z: 0.12, y: -0.07 };
    // 골반 회전을 허벅지가 정확히 되받도록 Z→Y→X 순서로 돌린다(다리는 늘 진행 방향 평면에서 움직인다)
    bone(`${side}UpperLeg`).rotation.order = 'ZYX';
    return {
      side, thigh: seg(hip, knee), shin: seg(knee, ankle), ball, heel: { z: -0.4 * ball.z, y: ball.y },
      x: ankle.x, ankleY: ankle.y, hipY: hip.y, hipZ: hip.z, z: 0, u: 0, stance: false, wasStance: false, add: 0, shift: 0, hipXLand: 0,
    };
  });
  const LEG = LEGS[0].thigh.len + LEGS[0].shin.len;

  // 발 구르기: 뒤꿈치로 닿고(발끝 듦) → 발바닥 → 뒤꿈치를 들며 앞꿈치로 차고 나간다.
  // 닿아 있는 받침점(뒤꿈치·앞꿈치)은 땅에 박힌 채 돌아서 구르는 동안에도 안 미끄러진다
  const PUSH = 0.95; // 차고 나갈 때 발끝을 편 각(라디안, + = 발끝이 아래). 착지 각은 주법(S.strike)
  function rollOffset(leg, pitch) { // 발이 pitch 만큼 굴렀을 때 발목 위치(평평할 때 발목 기준 z, y)
    const o = pitch < 0 ? leg.heel : leg.ball, c = Math.cos(pitch), sn = Math.sin(pitch);
    return { z: o.z - o.z * c - o.y * sn, y: o.y + o.z * sn - o.y * c };
  }

  // 보폭: 착지·이륙 순간 엉덩이 높이에서 무릎을 S.kneeStrike·S.kneePush 만큼 굽혀 닿는 앞뒤 거리(발바닥 평평 기준 발목)를
  // 페이스·케이던스가 요구하는 보폭(속도 × 딛는 시간)에 맞춰 늘이거나 줄인다(stride). 다리가 안 닿는 데까진 안 늘린다
  const { thigh: T0, shin: S0 } = LEGS[0];
  const legSpan = (knee) => Math.sqrt(T0.len ** 2 + S0.len ** 2 + 2 * T0.len * S0.len * Math.cos(knee)); // 고관절~발목 거리
  const across = (knee, o) => Math.sqrt(Math.max(legSpan(knee) ** 2 - (hipEdge - o.y) ** 2, 0));
  // 걷기: 걸음 안 위치 u(0 = 착지)에서 엉덩이 높이 — 한 발 디딤 한가운데가 가장 높고(서 있는 높이), 두 발 디딤에서 낮다.
  // 가장 높은 곳을 0 으로 둔다 — 서 있는 높이보다 위로 올리면 다리가 못 닿아 무릎이 쫙 펴진 채 발이 2.7cm 떴다
  const walkBob = (u) => WALK.bob * (Math.cos(2 * Math.PI * (u - WALK.duty)) - 1);
  let hipEdge = 0, strikeRoll, pushRoll, FRONT = 0, BACK = 0, stride = 1;
  function tuneGait() {
    hipEdge = LEGS[0].hipY - LEGS[0].ankleY - LEG * (S.drop - CONTACT_LIFT * (1 - walkMix)) + walkMix * walkBob(0); // 착지 순간 엉덩이 높이
    strikeRoll = rollOffset(LEGS[0], S.strike);
    pushRoll = rollOffset(LEGS[0], PUSH);
    const front = across(S.kneeStrike, strikeRoll) - strikeRoll.z, back = across(S.kneePush, pushRoll) + pushRoll.z;
    // 고른 페이스에 맞추기: 먼저 덜 딛고 더 난다(딛는 비율 0.4 → 최소 0.27 — 실제로 빠를수록 접지가 짧다, 레이스 접지 ≈ 0.18초),
    // 그래도 모자라면 보폭을 늘린다(무릎이 0.2rad 넘게 펴지기 전까지). 느리면 보폭을 줄인다.
    // (예전엔 보폭부터 7% 늘려 이륙 때 무릎이 8° 까지 펴졌다 — 일자 다리 근처에선 발이 조금만 움직여도 무릎이 크게 튀어 다리가 덜덜 떨렸다)
    const nat = front + back, need = (duty) => (S.speed * duty) / S.cadence / nat;
    const most = Math.min((across(0.2, strikeRoll) - strikeRoll.z) / front, (across(0.2, pushRoll) + pushRoll.z) / back);
    const reach = Math.min(most, 1);
    S.dutyRun = Math.min(RUN_FORM.duty, Math.max(RUN_FORM.dutyMin, (reach * nat * S.cadence) / S.speed));
    if (need(S.dutyRun) > most) S.dutyRun = Math.max(0.2, (most * nat * S.cadence) / S.speed); // 아주 빠르면(3분대) 단거리 선수처럼 더 짧게 딛는다
    S.duty = S.dutyRun + (WALK.duty - S.dutyRun) * walkMix;
    stride = Math.min(most, Math.max(0.5, need(S.duty)));
    FRONT = front * stride; // 착지: 엉덩이 앞
    BACK = back * stride; // 이륙: 엉덩이 뒤
  }

  // 디딤 t(0=착지, 1=이륙): 평평 기준 발목 z 는 땅과 같은 속도로 앞→뒤. ax·ay = 구르기로 발목이 비켜나는 양
  function stanceFoot(leg, t, amp) {
    const pitch = amp * (t < 0.18 ? S.strike * (1 - ease(t / 0.18)) : t < 0.5 ? 0 : PUSH * ((t - 0.5) / 0.5) ** 2);
    const o = rollOffset(leg, pitch);
    return { z: amp * (FRONT - (FRONT + BACK) * t), ax: o.z, ay: o.y, pitch, toes: -Math.max(0, pitch) };
  }

  // 2관절 IK: 고관절(hip)에서 발목 목표(tz, ty)로. 무릎은 앞으로 굽는다. 반환 = 허벅지·정강이의 세상 기준 각(A, B)
  function reachLeg(leg, hip, tz, ty) {
    const { thigh, shin } = leg;
    let dz = tz - hip.z, dy = ty - hip.y, d = Math.hypot(dz, dy);
    const fit = Math.min(Math.max(d, Math.abs(thigh.len - shin.len) + 0.01), (thigh.len + shin.len) * 0.999) / d; // 안 닿으면 그 방향으로 최대한
    dz *= fit; dy *= fit; d *= fit;
    const bend = Math.acos(Math.min(Math.max((thigh.len ** 2 + d * d - shin.len ** 2) / (2 * thigh.len * d), -1), 1));
    const A = Math.atan2(-dz, -dy) - bend; // 허벅지는 목표선보다 앞으로
    const kz = -thigh.len * Math.sin(A), ky = -thigh.len * Math.cos(A); // 무릎(엉덩이 기준)
    return { A, B: Math.atan2(kz - dz, ky - dy) };
  }

  // 다리 뼈에 넣기. ankle = 정강이 기준 발목 굽힘(+ = 발끝 아래). pelvis = 골반 회전(되받아 다리를 진행 방향에 둔다)
  let pelvis = { yaw: 0, roll: 0 };
  function setLeg(leg, A, B, ankle, toes) {
    const a = A - leg.thigh.ang;
    rot(`${leg.side}UpperLeg`, a, -pelvis.yaw, -pelvis.roll + leg.add); // Z 가 바깥 회전이라 다리 평면째 기운다
    rot(`${leg.side}LowerLeg`, B - leg.shin.ang - a, 0, 0);
    rot(`${leg.side}Foot`, ankle, 0, -leg.add); // 다리가 기운 만큼 발바닥을 되세워 평평하게 딛는다
    rot(`${leg.side}Toes`, toes, 0, 0);
  }

  // 스윙 s(0=이륙, 1=착지): 관절 곡선. 무릎은 40% 에서 가장 접히고(뒤꿈치 차올림), 허벅지는 85% 에서 가장 앞(무릎 몰기),
  // 끝에서 살짝 뒤로 끌어 내리며 착지 자세로 이어진다. 시작·끝은 이륙·착지 IK 자세와 정확히 같다
  // 이륙·착지 자세는 '그 순간의 엉덩이 높이'(dyOff·dyOn = 지금과의 차이)로 푼다 — 지금 높이로 풀면 엉덩이가 오르내리는 만큼
  // 발을 땅에 붙인 채 다리가 쫙 펴졌다 굽어(이륙·착지마다 무릎이 한 프레임에 0.2rad 튐) 달릴 때 다리가 덜덜 떨려 보였다
  // (양끝 '빠르기'까지 디딤 다리와 맞추는 3차 곡선은 시험해 봤지만 무릎이 뒤로 꺾이고 발 흔들림이 커져 뺐다 — 2026-11-04 측정)
  // u = 이 다리의 걸음 안 위치, dyAt(du) = 지금부터 du(걸음 단위) 뒤 엉덩이 높이 - 지금
  function swingLeg(leg, hip, s, amp, u, dyAt) {
    const ikAt = (t, next) => { // next = 다음 디딤(착지 쪽)
      const f = stanceFoot(leg, t, amp), ik = reachLeg(leg, { z: hip.z, y: hip.y + dyAt((next ? 1 : 0) + S.duty * t - u) }, leg.hipZ + f.z + f.ax, leg.ankleY + f.ay);
      return { ...ik, pitch: f.pitch, toes: f.toes, ank: f.pitch - (ik.B - leg.shin.ang) };
    };
    const off = ikAt(1, false), on = ikAt(0, true);
    const lift = S.thigh * amp * stride ** 0.6, peak = S.knee * amp; // 보폭이 길면 허벅지를 더 든다
    // 관절 곡선(모양의 기준): 무릎은 40% 에서 가장 접히고, 허벅지는 85% 에서 가장 앞
    const early = (t) => ease(t) + ((1 - (1 - Math.min(Math.max(t, 0), 1)) ** 2) - ease(t)) * walkMix; // 걷기: 허벅지가 이륙 직후부터 앞으로 나간다
    // 차고 나간 뒤에도 허벅지가 잠깐 더 뒤로(공중에서 가장 뒤 — Clark 2020: 이륙 때 허벅지 ~29° 뒤, 최대 신전은 체공 중).
    // 예전엔 이륙 순간이 가장 뒤였고 곧장 앞으로 와서 허벅지가 엉덩이 뒤로 거의 안 넘어가 보였다. 걷기는 이륙 직후 바로 앞으로
    const EP = RUN_FORM.extPeak, EXT = RUN_FORM.extFlight * amp * (1 - walkMix), extB = (x) => (x / EP) * Math.exp(1 - x / EP); // EP 에서 최대
    const flexAt = (x) => (x < 0.85 ? -off.A + (lift + off.A) * early(x / 0.85) - EXT * extB(x) : lift + (-on.A - lift) * ease((x - 0.85) / 0.15));
    const kneeAt = (x) => (x < 0.4 ? off.B - off.A + (peak - off.B + off.A) * ease(x / 0.4) : peak + (on.B - on.A - peak) * ease((x - 0.4) / 0.6));
    // 발 궤적: 관절 곡선은 양끝에서 멈췄다 출발해서, 발이 땅을 떠나는·닿는 순간 '속도'가 뚝 끊겼다(달릴 때 다리 덜덜).
    // 그래서 발목 자리를 한 줄의 매끈한 궤적(에르미트)으로 그리고 무릎은 IK 로 따라가게 한다 —
    // 지나는 점 = 이륙 자리 → 뒤꿈치 차올림(관절 곡선 40%) → 무릎 몰기(85%) → 착지 자리, 양끝 속도 = 디딤발 속도
    // (이륙 직후엔 차고 나간 기세로 떠오르고, 착지 직전엔 땅 속도로 뒤로 당기며 닿는다)
    // 궤적은 '엉덩이 기준'으로 그린다 — 땅 기준이면 엉덩이가 아직 떠 있는데 발을 땅까지 뻗게 돼 착지·이륙마다 무릎이 쫙 펴졌다
    const hy = (x) => dyAt(S.duty + x * (1 - S.duty) - u); // 스윙 x 지점 엉덩이 높이(지금과의 차이)
    const E = 0.02, kS = (1 - S.duty) / S.duty / E; // 디딤 t 기울기 → 스윙 s 기울기
    const foot = (t, x) => { const f = stanceFoot(leg, t, amp); return new THREE.Vector2(leg.hipZ + f.z + f.ax - hip.z, leg.ankleY + f.ay - hip.y - hy(x)); };
    const fk = (x) => { const A = -flexAt(x), B = A + kneeAt(x); return new THREE.Vector2(-leg.thigh.len * Math.sin(A) - leg.shin.len * Math.sin(B), -leg.thigh.len * Math.cos(A) - leg.shin.len * Math.cos(B)); };
    const hv = (x) => (hy(x + E) - hy(x - E)) / (2 * E); // 엉덩이 오르내림 속도(스윙 s 당)
    const K = [0, EP, 0.4, 0.85, 1], Pk = [foot(1, 0), fk(EP), fk(0.4), fk(0.85), foot(0, 1)]; // EP = 공중 최대 신전
    const T0 = foot(1, 0).sub(foot(1 - E, 0)).multiplyScalar(kS), T3 = foot(E, 1).sub(foot(0, 1)).multiplyScalar(kS);
    // 이어 붙이는 건 앞뒤 속도(땅 속도 맞추기)만. 위아래는 착지·이륙 순간 끊기는 게 맞다(발이 땅에 '쿵' 멈추는 충격) —
    // 위아래까지 이으면 엉덩이가 떠 있는 동안 발을 더 아래로 뻗어 다리가 닿는 거리를 넘고 무릎이 쫙 펴졌다
    T0.y = 0; T3.y = 0;
    const dfk = (x) => fk(x + E).sub(fk(x - E)).divideScalar(2 * E); // 중간 점은 관절 곡선의 실제 속도 그대로(앞으로 넘쳐 나가지 않게)
    const Tk = [T0, dfk(K[1]), dfk(K[2]), dfk(K[3]), T3];
    let seg = 0;
    while (seg < K.length - 2 && s >= K[seg + 1]) seg++;
    const h = K[seg + 1] - K[seg], x = Math.min(Math.max((s - K[seg]) / h, 0), 1), x2 = x * x, x3 = x2 * x;
    const at = Pk[seg].clone().multiplyScalar(2 * x3 - 3 * x2 + 1).addScaledVector(Tk[seg], (x3 - 2 * x2 + x) * h)
      .addScaledVector(Pk[seg + 1], -2 * x3 + 3 * x2).addScaledVector(Tk[seg + 1], (x3 - x2) * h);
    at.x += hip.z;
    at.y = Math.max(at.y + hip.y, Math.min(Pk[0].y + hip.y + hy(0), Pk[4].y + hip.y + hy(1))); // 땅 밑으로는 안 내려간다
    const ik = reachLeg(leg, hip, at.x, at.y);
    // 발목: 차고 나간 뒤 발끝을 편 채(20°) 따라오다가, 착지 전에 발끝을 들어 뒤꿈치부터 닿을 준비
    const mid = 0.35 * amp;
    const ankle = s < 0.3 ? off.ank + (mid - off.ank) * ease(s / 0.3) : mid + (on.ank - mid) * ease((s - 0.3) / 0.7);
    let A = ik.A, B = ik.B, ank = ankle;
    let toe = off.toes * (1 - ease(s / 0.3)) + on.toes * ease((s - 0.7) / 0.3); // 앞꿈치 착지면 발가락을 편 채 닿는다(디딤 시작과 같게)
    const r = 1 - ease(amp / 0.35); // 거의 서 있으면 공중 다리도 쉬는 자세(발을 엉덩이 밑 땅에)로 → 서서 발을 들썩이지 않는다
    if (r > 0) {
      const rest = reachLeg(leg, hip, leg.hipZ, leg.ankleY);
      A += (rest.A - A) * r;
      B += (rest.B - B) * r;
      ank += (-(rest.B - leg.shin.ang) - ank) * r;
      toe *= 1 - r;
    }
    setLeg(leg, A, B, ank, toe);
  }

  // 땅이 이번에 흐를 거리: 같은 발이 계속 딛고 있으면 그 발이 뒤로 간 만큼(정확히 붙는다), 체공 중엔 보폭 속도로
  function groundStep(dt, amp, freq) {
    const leg = LEGS.find((l) => l.stance && l.wasStance);
    return leg ? leg.prevZ - leg.z : ((FRONT + BACK) * amp * freq / S.duty) * dt;
  }

  // 달리기 자세와 서 있는 자세를 amp(0=서 있음, 1=달리기)로 섞는다
  function pose(p, amp, t, lean, freq) {
    const s = Math.cos(p); // 팔·몸통: 왼발 착지(p=0)에 왼팔이 가장 뒤, 오른팔이 가장 앞
    const mix = (name, idle, run) => rot(name, ...idle.map((v, i) => v + (run[i] - v) * amp));
    const breathe = 0.02 * Math.sin(t * 2.4) * (1 - amp);
    const legU = (i) => mod(p / (2 * Math.PI) + i / 2, 1);
    const bump = (i) => (legU(i) < S.duty ? Math.sin(Math.PI * legU(i) / S.duty) : 0); // 그 다리가 딛는 동안 0→1→0

    // 골반: 디딤 중간에 가장 낮고 체공에 가장 높다. 앞으로 나가는 다리 쪽 엉덩이가 앞으로 돌고(Y+ = 왼쪽으로 돈다),
    // 디딤발 반대쪽(스윙 쪽)이 살짝 처진다(Z+ = 왼쪽이 올라간다)
    const hipLift = (pp) => (1 - walkMix) * (bounce(pp, freq) + LEG * CONTACT_LIFT) + walkMix * walkBob(mod(pp / Math.PI, 1)); // 달리기 튕김 ↔ 걷기 진자
    const lift = hipLift(p);
    hips.position.y = hipsRestY + (lift - LEG * S.drop) * amp;
    hips.position.x = hipsRestX + flip * WALK.sway * walkMix * amp * Math.cos(p - Math.PI * S.duty); // 걷기: 왼발 디딤 중간(+)에 왼쪽으로
    const roll = 0.06 * (bump(0) - bump(1));
    pelvis = { yaw: -0.09 * s * amp, roll: roll * amp };
    rot('hips', 0, pelvis.yaw, pelvis.roll);
    LEGS.forEach((leg, i) => {
      const u = legU(i), hip = jointAt(`${leg.side}UpperLeg`);
      leg.prevZ = leg.z; leg.wasStance = leg.stance; leg.u = u;
      leg.stance = u < S.duty;
      // 다리를 고관절에서 몸 중앙 쪽으로 모으는 각(rad): 발목이 중앙에서 stepX 에 닿게. 달릴 때만(서 있기·걷기는 원래 폭).
      // 디딤 중엔 착지 순간 실제로 비켜난 거리(shift)를 붙잡고, 엉덩이가 오르내리는 만큼 각을 다시 풀어 발을 제자리에 둔다
      // (각을 고정하면 엉덩이 튕김에 발이 옆으로 3.5mm 씩 끌렸다. 멈추며 걷기로 넘어가도 딛은 발은 그대로)
      if (leg.stance) {
        const f = stanceFoot(leg, u / S.duty, amp), dy = Math.max(0.3, hip.y - (leg.ankleY + f.ay));
        if (!leg.wasStance) { leg.shift = dy * Math.sin(leg.add); leg.hipXLand = hip.x; }
        leg.add = Math.asin(Math.min(0.5, Math.max(-0.5, (leg.shift + leg.hipXLand - hip.x) / dy))); // 골반이 옆으로 옮겨 간 만큼 되받아 발은 제자리
        const { A, B } = reachLeg(leg, hip, leg.hipZ + f.z + f.ax, leg.ankleY + f.ay);
        setLeg(leg, A, B, f.pitch - (B - leg.shin.ang), f.toes);
        leg.z = f.z;
      } else {
        const stepX = RUN_FORM.stepX + (WALK.stepX - RUN_FORM.stepX) * walkMix;
        leg.add = Math.atan2(Math.sign(leg.x) * stepX - leg.x, leg.hipY - leg.ankleY) * amp; // 공중 다리는 고정 각(발이 높이 들리면 덜 모인다 — 무릎끼리 안 부딪게)
        swingLeg(leg, hip, (u - S.duty) / (1 - S.duty), amp, u, (du) => (hipLift(p + du * 2 * Math.PI) - lift) * amp); // 이륙·착지 순간 엉덩이 높이로 푼다
      }
    });

    // 팔: 다리와 반대로 흔든다. 팔꿈치는 앞으로 올 때 더 접고 뒤로 갈 때 조금 편다
    // 앞으로 올수록 어깨를 안쪽으로 돌려 손이 몸 중앙 쪽으로 온다(중앙선은 넘지 않게) — 예전엔 어깨선 그대로 앞뒤로만 흔들었다
    const fwdL = 0.5 - 0.5 * s, fwdR = 0.5 + 0.5 * s; // 팔이 앞으로 나온 정도(1 = 가장 앞)
    const armBias = 0.15 - 0.12 * walkMix, armOut = 1.25 + 0.13 * walkMix, elbowFwd = 0.3 - 0.12 * walkMix; // 걷기: 팔을 몸 옆에 늘어뜨린다
    mix('leftUpperArm', [0.05, 0, -1.4], [armBias + S.arm * s, -S.armIn * fwdL, -armOut]);
    mix('rightUpperArm', [0.05, 0, 1.4], [armBias - S.arm * s, S.armIn * fwdR, armOut]);
    mix('leftLowerArm', [0, -0.35, 0], [0, -(S.elbow + elbowFwd * Math.max(0, -s)), 0]);
    mix('rightLowerArm', [0, 0.35, 0], [0, S.elbow + elbowFwd * Math.max(0, s), 0]);

    // 몸통: 어깨는 골반과 반대로 돈다(오른팔이 앞이면 오른어깨도 앞), 골반이 기운 만큼 되세운다. 머리는 되받아 정면을 본다
    // lean: 브레이크·출발 때 관성으로 상체가 쏠리는 양. 머리는 반쯤 되받아 시선을 유지한다
    mix('spine', [0.02 + breathe + lean, 0.15 * headLook, 0], [S.lean + lean, 0.1 * s + 0.15 * headLook, -roll]);
    mix('chest', [breathe, 0.2 * headLook, 0], [0, 0.1 * s + 0.2 * headLook, 0]);
    mix('head', [-lean * 0.6 + talk.nod, 0.65 * headLook, talk.tilt], [-0.08 - lean * 0.6, -0.11 * s + 0.65 * headLook, 0]); // 고개 65%·가슴 20%·허리 15% 로 나눠 돈다
  }

  // ---- 연출: 달리다 → 클릭하면 감속해 서고 카메라가 얼굴로 → 브리핑 → 카메라가 되감기며 다시 출발 ----
  const lerpCam = (a, b, x) => Object.fromEntries(Object.keys(a).map((key) => [key, a[key] + (b[key] - a[key]) * x]));
  // mode: run(달린다) 또는 hold(서 있다 — 컨트롤러로 연 정지 화면). 브리핑 중에도 러너는 멈추지 않는다
  let mode = OPT.mv ? 'run' : 'hold', speed = OPT.mv ? 1 : 0, phase = 0;
  let headLook = 0; // 고개가 카메라 쪽으로 돈 양(rad) — 브리핑을 읽는 동안 카메라를 본다
  // 사용자 카메라(컨트롤러): 앵글 = 위아래(0° 눈높이 ~ 89° 바로 위), 포지션 = 러너 둘레 방향, 디스턴스 = 거리. 몸 가운데를 본다
  const CAM_LOOK = 0.9;
  function userCam() {
    if (OPT.el < 0) { // 0 아래: 거리는 그대로 두고 카메라 높이만 바닥(-30 = 지면 3cm)까지 내린다 → 올려다보는 로우앵글
      return { yaw: (OPT.az * Math.PI) / 180, dist: OPT.ds, h: Math.max(0.03, CAM_LOOK * (1 + OPT.el / 30)), look: CAM_LOOK, fov: 34, roll: 0 };
    }
    const e = (Math.min(OPT.el, 89) * Math.PI) / 180;
    return { yaw: (OPT.az * Math.PI) / 180, dist: OPT.ds * Math.cos(e), h: CAM_LOOK + OPT.ds * Math.sin(e), look: CAM_LOOK, fov: 34, roll: 0 };
  }
  // ---- 브리핑 연출(사용자 결정 2026-11-05) ----
  // 1. 카메라는 길에 서 있고, 러너가 멀리서 카메라 쪽으로 달려온다
  // 2. 러너가 다가오면 카메라맨도 뛰기 시작해 러너 5m 앞에서 뒤돌아 찍으며 같이 달린다 → 자리를 잡으면 onReadyToTalk() (앱이 문장별 TTS·자막)
  // 3. finish(): 다 읽으면 카메라맨이 서서히 멈추고, 옆을 지나 멀어지는 러너를 계속 바라보며 살짝 내려간다
  // camAnchor = 카메라가 '같이 뛰는 자리'보다 앞(+)·뒤(-)에 있는 거리(m), camRun = 카메라맨 속도 ÷ 러너 속도
  // 5m 앞에서 옆으로 2.2m 비켜 선다(멈출 때 러너가 옆을 지나간다). 망원(화각 22°)이라 5m 에서도 러너가 화면을 채운다 — 30° 면 얼굴이 작았다
  const LEAD = { yaw: 0.45, dist: 5, h: 1.35, look: 1.05, fov: 22, roll: 0 };
  const APPROACH_M = 12, CATCH_M = 3, STOP_CAM_SEC = 2.4;
  let camAnchor = STORY && OPT.mv ? APPROACH_M : 0, camRun = 0, stopT = -1, reading = false;
  let camFrom = STORY ? LEAD : userCam(), camTo = camFrom, camT0 = 0, camDur = 1;
  const camAt = (t) => lerpCam(camFrom, camTo, ease((t - camT0) / camDur));
  function moveCam(to, t, dur) { camFrom = camAt(t); camTo = to; camT0 = t; camDur = dur; }

  // 주먹: 네 손가락을 끝까지 말아 쥐고 엄지는 검지·중지 가운데 마디 위에 얹는다(손가락에 붙인다 — 힘줘 쥐지는 않는다)
  // (T포즈 손바닥이 아래 → 왼손은 -Z, 오른손은 +Z 로 말아 쥔다. 엄지 Y·Z 는 좌우 반대)
  // 예전엔 엄지 뿌리(three-vrm 이름 ThumbMetacarpal — VRM0 의 thumbProximal)를 안 돌려 엄지가 주먹 밖으로 삐죽 나와 덜렁거렸다.
  // 사용자 모델(VRoid Studio 2.x)로 바꾼 뒤 옛 값으론 엄지가 앞으로 쭉 뻗어 '손가락으로 가리키는' 손이 됐다(사용자 지적 2026-11-05) →
  // 후보 각도를 달리는 자세 같은 프레임으로 찍어 비교해 엄지가 주먹 안쪽으로 감기는 값으로 다시 잡았다(뿌리를 손바닥 쪽으로 크게 틀고 마디를 감는다)
  for (const side of ['left', 'right']) {
    const k = side === 'left' ? -1 : 1, m = -k;
    for (const f of ['Index', 'Middle', 'Ring', 'Little']) {
      rot(`${side}${f}Proximal`, 0, 0, 1.45 * k);
      rot(`${side}${f}Intermediate`, 0, 0, 1.45 * k);
      rot(`${side}${f}Distal`, 0, 0, 1.05 * k);
    }
    rot(`${side}ThumbMetacarpal`, 0.9, 1.2 * m, -0.2 * m);
    rot(`${side}ThumbProximal`, 0.6, 0, -0.9 * m);
    rot(`${side}ThumbDistal`, 0.4, 0, -0.8 * m);
  }

  // ---- 브리핑 진행(앱이 부른다) ----
  // setSpeech(): 지금 문장을 말하는 중인지 · 마지막 문장인지(입모양·웃음)
  // finish(): 다 읽었다 — 카메라맨이 서서히 멈춘다(위 '브리핑 연출' 3)
  let lineIsLast = false, speaking = false;
  function setSpeech(next) {
    speaking = Boolean(next.speaking);
    lineIsLast = Boolean(next.last);
  }
  function finish() {
    if (stopT >= 0) return;
    const t = clock.getElapsedTime();
    reading = false;
    speaking = false;
    stopT = t;
    // 서면서 살짝 내려 지나가는 러너를 올려다본다. 화각을 넓혀야 옆을 지날 때 몸이 화면을 꽉 채우지 않는다
    moveCam({ ...LEAD, h: 0.75, look: CAM_LOOK, fov: 38 }, t, STOP_CAM_SEC + 1.2);
  }

  // 표정: 브리핑 땐 웃는 얼굴(마지막 '출발!'은 더 활짝), 이지런은 달릴 때도 편하게 살짝 웃는다
  // 고개: 말소리 크기에 맞춰 살짝 끄덕이고, 천천히 갸웃한다
  let smile = 0;
  const talk = { nod: 0, tilt: 0 };
  function mouth(t, dt) {
    let v = 0;
    // 기기 TTS 는 소리 크기를 읽을 수 없어서, 말하는 동안 입을 말하는 흉내로 움직인다
    if (speaking) v = Math.max(0, 0.3 + 0.5 * Math.sin(t * 15) * Math.sin(t * 4.7));
    const target = reading ? (lineIsLast ? 0.6 : 0.4) : OPT.rn === 'easy' || OPT.rn === 'lsd' ? 0.15 : 0;
    const k = Math.min(1, dt * 4);
    smile += (target - smile) * k;
    const em = vrm.expressionManager;
    em.setValue('happy', smile);
    // VRoid 'happy' 는 입 모양을 웃는 만큼 덜어 낸다(override blend) → 말할 땐 그만큼 크게 벌린다
    const open = Math.min(1, v * (1 + 1.5 * smile));
    em.setValue('aa', open);
    em.setValue('oh', open * 0.35);
    em.setValue('blink', (t % 3.2) < 0.12 ? 1 : 0);
    talk.nod += ((reading ? 0.07 * v : 0) - talk.nod) * Math.min(1, dt * 10);
    talk.tilt += ((reading ? 0.06 * Math.sin(t * 0.8) : 0) - talk.tilt) * k;
  }

  // ---- 페인터리 후처리 ----
  const rtColor = new THREE.WebGLRenderTarget(W, H, {
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(W, H),
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, // 심도: 단계별로 미리 흐린 그림(점 사이 빈틈 메우기)
  });
  const rtNormal = new THREE.WebGLRenderTarget(W, H);
  // 노멀 패스 재질. 얼굴은 정면 노멀로 고정한다(얼굴은 명암 없이 평평하게 칠한다)
  const normalMat = new THREE.MeshNormalMaterial();
  const faceNormalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 0.5, 1) });
  const pickNormal = (m) => (/FACE|EYE|Face_/.test(m.name) ? faceNormalMat : normalMat);
  const normalSwaps = [];
  vrm.scene.traverse((o) => {
    if (!o.isMesh) return;
    const swap = Array.isArray(o.material) ? o.material.map(pickNormal) : pickNormal(o.material);
    normalSwaps.push({ mesh: o, color: o.material, normal: swap });
  });

  const post = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: rtColor.texture },
      tDepth: { value: rtColor.depthTexture },
      tNormal: { value: rtNormal.texture },
      res: { value: new THREE.Vector2(W, H) },
      near: { value: camera.near },
      far: { value: camera.far },
      stepT: { value: 0 },
      fx: { value: FX ? 1 : 0 },
      lightDir: { value: new THREE.Vector3() },
      paperTop: { value: new THREE.Vector3(...(WX.paperTop ?? [0.95, 0.93, 0.96])) },
      paperBottom: { value: new THREE.Vector3(...(WX.paperBottom ?? [0.93, 0.90, 0.93])) },
      env: { value: 1 },
      dof: { value: 0 }, focusZ: { value: 3 }, cocK: { value: 0 }, maxCoc: { value: 16 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */`
      #include <packing>
      uniform sampler2D tColor, tDepth, tNormal;
      uniform vec2 res;
      uniform float near, far, stepT, fx, env;
      uniform vec3 lightDir; // 뷰 공간
      uniform vec3 paperTop, paperBottom;
      uniform float dof, focusZ, cocK, maxCoc;
      varying vec2 vUv;

      const vec3 INK = vec3(0.17, 0.08, 0.20);       // 검정 대신 짙은 자주
      const vec3 WARM_RIM = vec3(1.0, 0.48, 0.28);
      const vec3 COOL_RIM = vec3(0.36, 0.52, 1.0);

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      vec3 toSRGB(vec3 c) {
        return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      }
      float rawDepth(vec2 uv) { return texture2D(tDepth, uv).x; }
      bool isBg(vec2 uv) { return rawDepth(uv) >= 0.99999; }
      float linDepth(vec2 uv) { return -perspectiveDepthToViewZ(rawDepth(uv), near, far); }
      vec3 nrm(vec2 uv) { return texture2D(tNormal, uv).xyz * 2.0 - 1.0; }

      // 심도: 깊이마다 흐림 원(px). 하늘은 무한히 멀다. z = 시선 깊이(m), 하늘은 아주 멀게
      float zAt(vec2 uv) { float d = rawDepth(uv); return d >= 0.99999 ? 1e6 : -perspectiveDepthToViewZ(d, near, far); }
      float cocOf(float z) { return clamp(abs(cocK * (1.0 - focusZ / z)), 0.0, maxCoc); }
      // 모으기: 둘레 64점(황금각 나선)을 보고, 그 점의 흐림 원이 이 픽셀까지 닿으면 섞는다.
      // 뒤쪽 점은 앞쪽 위로 번지지 않는다(초점 맞은 러너 위로 배경이 번지면 안 된다) — 앞쪽 흐림은 뒤로 번진다.
      // 점 사이가 비면 작은 밝은 점(눈송이)·가는 물체(가로등 기둥)가 점묘처럼 자글자글 깨진다(검은 기둥의 정체) →
      // 각 점은 점 간격만큼 미리 흐린 단계(밉맵)에서 읽고, 나선은 픽셀마다 살짝 돌려 무늬가 안 생기게 한다
      vec3 dofColor(vec2 uv) {
        float zc = zAt(uv), cc = cocOf(zc);
        vec3 acc = texture2D(tColor, uv).rgb;
        float ws = 1.0;
        float spin = 6.2832 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        for (int i = 0; i < 64; i++) {
          float r = sqrt((float(i) + 0.5) / 64.0) * maxCoc, a = float(i) * 2.39996 + spin;
          vec2 su = uv + vec2(cos(a), sin(a)) * r / res;
          float zs = zAt(su), cs = cocOf(zs);
          float reach = zs > zc + 0.05 ? min(cs, cc) : cs;
          float w = clamp(reach - r + 1.0, 0.0, 1.0);
          if (w <= 0.0) continue;
          // 흐림 단계는 직접 고른다(textureLod). 자동(texture2D)이면 픽셀마다 돌린 나선 때문에 이웃 차이가 커서
          // GPU 가 아주 흐린 단계를 골라 러너 색까지 섞여 윤곽 둘레에 후광이 생겼다. 점 간격 ≈ 흐림 원 × √(π/64)
          acc += textureLod(tColor, su, clamp(log2(max(reach, 1.0) * 0.22), 0.0, 1.5)).rgb * w;
          ws += w;
        }
        return acc / ws;
      }

      // 종이: 거의 빈 바탕 + 아주 옅은 얼룩
      vec3 paper(vec2 uv, vec2 frag) {
        vec3 c = mix(paperBottom, paperTop, uv.y);
        return c * (0.975 + 0.05 * vnoise(frag / 260.0));
      }

      // 캐릭터: 채도를 올리고 명도를 몇 단으로 눌러 '면'으로 칠한다.
      // 그림자는 딱 끊기는 경계에 보라·남색으로, 빛 쪽 가장자리엔 따뜻한 림, 그림자 쪽엔 차가운 림
      vec3 paint(vec2 uv, vec2 frag) {
        vec3 c = toSRGB(texture2D(tColor, uv).rgb);
        float L = dot(c, vec3(0.299, 0.587, 0.114));
        c = clamp(mix(vec3(L), c, 1.35), 0.0, 1.0);
        float Lq = (floor(L * 4.0) + 0.6) / 4.0;
        c *= mix(1.0, Lq / max(L, 0.03), 0.55);
        vec3 n = normalize(nrm(uv));
        // 얼굴(정면 노멀 고정)은 어느 각도에서 봐도 밝게 둔다 — 아래에서 보면 보라로 덮이던 문제
        float ndl = n.z > 0.999 ? 1.0 : dot(n, lightDir);
        // 붓으로 칠한 듯 울퉁불퉁한 명암 경계
        float sh = step(ndl, 0.12 + (vnoise(frag / 14.0) - 0.5) * 0.22);
        c = mix(c, c * vec3(0.52, 0.44, 0.82) + vec3(0.03, 0.0, 0.07), sh);
        float fres = 1.0 - n.z;
        c = mix(c, WARM_RIM, smoothstep(0.75, 0.92, fres) * (1.0 - sh) * 0.5);
        return mix(c, COOL_RIM, smoothstep(0.75, 0.92, fres) * sh * 0.5);
      }

      // 끊기는 스케치 선: 가장자리를 찾되 저주파 노이즈로 군데군데 비운다
      float sketch(vec2 uv, vec2 frag) {
        vec2 px = 1.0 / res;
        bool bgC = isBg(uv);
        if (bgC) return 0.0;
        float dc = linDepth(uv);
        vec3 nc = nrm(uv);
        float ed = 0.0, en = 0.0, sil = 0.0;
        for (int i = 0; i < 4; i++) {
          vec2 dir = i == 0 ? vec2(1, 0) : i == 1 ? vec2(-1, 0) : i == 2 ? vec2(0, 1) : vec2(0, -1);
          ed += abs(linDepth(uv + dir * px) - dc);
          en += 1.0 - dot(nc, nrm(uv + dir * px));
          if (isBg(uv + dir * px * 1.6)) sil = 1.0;
        }
        float e = max(sil * 0.9, max(smoothstep(0.05, 0.12, ed / dc), smoothstep(0.5, 0.9, en)));
        float keep = smoothstep(0.42, 0.55, vnoise(frag / 22.0 + vec2(stepT * 3.1, 0.0)));
        return e * keep;
      }

      void main() {
        vec2 frag = vUv * res;
        // 원본 모드: 캐릭터는 VRoid 그대로(눈은 3D 장면에 있다)
        if (fx < 0.5) {
          vec3 col = isBg(vUv) && env < 0.5 ? paper(vUv, frag) : toSRGB(dof > 0.5 ? dofColor(vUv) : texture2D(tColor, vUv).rgb);
          gl_FragColor = vec4(col, 1.0);
          return;
        }
        vec3 col = isBg(vUv) ? paper(vUv, frag) : paint(vUv, frag);
        col = mix(col, INK, sketch(vUv, frag) * 0.9);
        col *= 0.97 + 0.03 * hash(floor(frag / 2.0) + stepT); // 종이 결
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
  const postScene = new THREE.Scene();
  postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
  const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // ---- 루프 ----
  let lastStep = -1;
  const focusAt = new THREE.Vector3();
  function frame() {
    const t = clock.getElapsedTime();
    // 원본은 매 프레임, 페인터리는 12fps 로 끊는다. 끊을 땐 땅도 같은 박자로 끊어야 디딤발이 안 미끄러진다
    const st = FX ? Math.floor(t / STEP) * STEP : t;

    // 연출 모드면 연출 카메라, 아니면 고른 각도에서 천천히 다가간다(컷 모드면 컷마다 다시 시작)
    let cam, push = 0;
    if (STORY) cam = camAt(t);
    else {
      const cut = Math.floor(t / CUT_SEC);
      cam = CAMERAS[CAM === 'cuts' ? CUTS[cut % CUTS.length] : CAM];
      push = 0.05 * Math.min((CAM === 'cuts' ? t - cut * CUT_SEC : t) / 8, 1);
    }
    const d = cam.dist * (1 - push) * k;
    const yaw = FACING + cam.yaw + 0.015 * Math.sin(t * 0.7);
    if (camera.fov !== cam.fov) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
    camera.position.set(Math.sin(yaw) * d, cam.h * k, Math.cos(yaw) * d);
    if (STORY) camera.position.add(new THREE.Vector3(Math.sin(FACING), 0, Math.cos(FACING)).multiplyScalar(camAnchor)); // 카메라맨이 러너보다 앞·뒤에 있는 만큼
    camera.lookAt(0, cam.look * k, 0);
    camera.rotateZ(cam.roll);
    camera.updateMatrixWorld();
    post.uniforms.lightDir.value.copy(light.position).transformDirection(camera.matrixWorldInverse);

    let dz = 0;
    if (st !== lastStep) {
      const dt = lastStep < 0 ? 0 : Math.min(st - lastStep, 0.1);
      lastStep = st;
      if (mode === 'hold') speed = 0;
      // 서 있을 땐(hold) 걷기 자세로 넘어가 두 발이 다 디딘 순간 박자를 세운다
      stopWalk = 1 - ease((speed - 0.3) / 0.45);
      updateGait(st);
      tuneGait();
      const amp = Math.min(1, (speed * S.speedBase) / S.speed); // 실제 속도 = 달리던 속도 × speed → 걷기 보폭으로 환산
      const freq = S.cadence * (0.5 + 0.5 * Math.min(1, amp / 0.5));
      const settled = mode === 'hold' && LEGS.every((l) => l.stance);
      if (!settled) phase += dt * Math.PI * 2 * freq;
      // 브리핑을 읽는 동안 고개를 카메라 쪽으로(최대 43°)
      const camRel = STORY ? camAt(t).yaw : 0;
      headLook += (Math.max(-0.75, Math.min(0.75, camRel)) * (reading ? 1 : 0) - headLook) * Math.min(1, dt * 3);
      vrm.scene.rotation.y = baseYaw;
      body.rotation.y = FACING;
      body.updateMatrixWorld();
      pose(phase, amp, st, 0, freq);
      dz = settled ? 0 : groundStep(dt, amp, freq);
      if (STORY && OPT.mv) {
        // 다가올수록 카메라맨이 점점 빨리 뛰어 5m 앞 자리에 붙는다 / 다 읽으면 서서히 멈춘다(러너가 옆을 지나 멀어진다)
        camRun = stopT < 0 ? Math.min(1, Math.max(0, 1 - camAnchor / CATCH_M)) : 1 - ease((t - stopT) / STOP_CAM_SEC);
        camAnchor -= dz * (1 - camRun);
        if (!reading && stopT < 0 && camAnchor < 0.5) { reading = true; onReadyToTalk?.(); }
      }
      stepSnow?.(dt, dz, st);
      mouth(st, dt);
      const n = FX ? 5 : 1; // 12fps 로 끊을 땐 흔들림 물리를 잘게 나눠 돌린다
      for (let i = 0; i < n; i++) vrm.update(dt / n);
      stepBreath?.(dt, dz, st);
      post.uniforms.stepT.value = st;
    }

    updateWorld(t, dz);
    if (OPT.df) { // 심도: 초점 = 얼굴(눈 높이)까지 시선 방향 깊이. 렌즈 = 세로 36mm 센서 기준(화각 34° → 59mm)
      const N = STOPS[OPT.df], half = (camera.fov * Math.PI) / 360, f = 0.018 / Math.tan(half);
      const S1 = Math.max(0.3, -headBone.getWorldPosition(focusAt).applyMatrix4(camera.matrixWorldInverse).z);
      post.uniforms.dof.value = 1;
      post.uniforms.focusZ.value = S1;
      post.uniforms.cocK.value = (f / (2 * N * (S1 - f) * Math.tan(half))) * H; // 무한히 먼 곳의 흐림 원(px)
    } else post.uniforms.dof.value = 0;
    renderer.setRenderTarget(rtColor);
    renderer.render(scene, camera);
    if (FX) {
      world.visible = false;
      for (const s of normalSwaps) s.mesh.material = s.normal;
      renderer.setRenderTarget(rtNormal);
      renderer.render(scene, camera);
      for (const s of normalSwaps) s.mesh.material = s.color;
      world.visible = true;
    }
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
    if (!disposed) raf = requestAnimationFrame(frame);
  }
  updateGait(0);
  tuneGait();
  frame();

  // 위 frame() 이 첫 프레임을 이미 그렸다(모델 로드 → 첫 렌더까지가 '준비 완료').
  function dispose() {
    if (disposed && raf === -1) return
    disposed = true
    cancelAnimationFrame(raf)
    raf = -1
    VRMUtils.deepDispose(scene)
    rtColor.dispose()
    rtNormal.dispose()
    post.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
  }
  if (disposed) {
    dispose()
    throw new DOMException('aborted', 'AbortError')
  }
  signal?.addEventListener('abort', dispose)

  return { setSpeech, finish, dispose }
}
