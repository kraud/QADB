<script setup lang="ts">
const props = defineProps<{ open: boolean; attemptCount: number; questionId: string | null }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirmed', id: string): void
}>()

function confirm() {
  if (props.questionId) emit('confirmed', props.questionId)
}
</script>

<template>
  <Modal :open="open" role="alertdialog" aria-label="Delete question" max-width="440px" @close="emit('close')">
    <div class="modal-head"><h2>Delete question?</h2></div>
    <div class="confirm-body">
      <p>This also deletes its practice history <strong>({{ attemptCount }} attempts)</strong>. This can't be undone.</p>
    </div>
    <div class="modal-foot" style="padding-top: 8px">
      <Btn variant="secondary" @click="emit('close')">Cancel</Btn>
      <Btn variant="error" @click="confirm">Delete</Btn>
    </div>
  </Modal>
</template>
