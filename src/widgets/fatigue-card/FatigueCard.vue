<script setup lang="ts">
defineProps<{ warning: string }>()
</script>

<template>
  <section class="panel fatigue">
    <div class="section-heading">
      <h2>피로 경고</h2>
    </div>
    <p>{{ warning }}</p>
  </section>
</template>
