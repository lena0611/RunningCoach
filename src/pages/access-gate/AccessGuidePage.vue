<script setup lang="ts">
import SectionCard from '@/shared/ui/SectionCard.vue'
import PageLayout from '@/shared/ui/PageLayout.vue'
import SectionHeader from '@/shared/ui/SectionHeader.vue'
</script>

<template>
  <PageLayout variant="narrow">
    <SectionCard>
      <SectionHeader title="PaceLAB은 iOS 앱에서 사용합니다" />
      <p>
        이 정적 웹은 GitHub Pages에 배포되지만, 실제 러닝 기록과 코칭 기능은 iOS 하이브리드 앱의
        네이티브 브리지 또는 로컬 개발 환경에서만 열립니다.
      </p>
      <p class="helper">개발 중에는 localhost로 접속하고, 실사용은 Xcode로 설치한 iPhone 앱에서 실행하세요.</p>
    </SectionCard>
  </PageLayout>
</template>
