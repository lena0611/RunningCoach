-- 런 날씨가 기록 원본이 아니라 추정값인지 표시한다 (#838).
--
-- 날씨(기온·습도)는 기록한 앱이 메타로 넣어줄 때만 있었다. Apple Watch 운동 앱도 워치 단독이면
-- 대부분 빠지고, WorkOutDoors 같은 서드파티는 아예 넣지 않는다(실측 225런 중 79건만 존재).
-- 이제 빈 런은 시작 시각 + 경로 첫 좌표로 과거 날씨(Open-Meteo)를 받아 채운다.
--
-- 왜 컬럼이 필요한가: 코칭 SSOT §기상 입력의 역할 — "관측 신뢰도를 값과 함께 저장하고,
-- 추정값을 실측값과 같은 품질로 표시하지 않는다". 값만 채우면 화면·코치가 추정을 실측처럼 말한다.
--
-- false = 기록 원본(또는 날씨 없음), true = 백필 추정값.
alter table public.run_logs
  add column if not exists weather_estimated boolean not null default false;

comment on column public.run_logs.weather_estimated is
  '기온·습도가 기록 원본이 아니라 과거 날씨 추정값(Open-Meteo, 시작 시각+경로 첫 좌표)인가 (#838). 화면은 "추정"으로 구분 표시, 코치 컨텍스트에도 실어 보낸다.';
