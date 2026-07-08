<template>
   <button
      type="button"
      role="switch"
      :aria-checked="model"
      class="cms-switch"
      :class="{ 'is-on': model }"
      @click="model = !model"
   />
</template>

<script setup lang="ts">
const model = defineModel<boolean>()
</script>
