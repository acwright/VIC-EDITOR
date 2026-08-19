<script setup lang="ts">
import { RouterView, useRouter } from 'vue-router'
import { capturePendingShare } from '@/domain/share'

// A share link (`#p=…`) is read and stripped once, before the manager view
// mounts and offers it (PLAN.md §12 Decision 18). Links point at the app root,
// but a hash pasted onto any other route is honored too.
const router = useRouter()
if (capturePendingShare() && router.currentRoute.value.path !== '/') {
  router.replace('/')
}
</script>

<template>
  <RouterView />
</template>
