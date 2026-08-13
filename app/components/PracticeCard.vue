<script setup lang="ts">
import type { AttemptRow, QuestionWithStats } from '#shared/types/qadb'

type Q = QuestionWithStats & { attempts: AttemptRow[] }

const props = defineProps<{
  question: Q
  index: number
  total: number
  modeLabel: string
  nextLabel: string
  revealed: boolean
  grading: boolean
}>()

const emit = defineEmits<{
  (e: 'reveal'): void
  (e: 'grade', correct: boolean): void
  (e: 'mastered', v: boolean): void
  (e: 'next'): void
}>()

const progress = computed(() => Math.round((props.index / props.total) * 100))
</script>

<template>
  <div class="practice-card">
    <p class="q-label">Question</p>
    <h1 class="q">{{ question.question }}</h1>

    <div class="practice-mastered">
      <Switch
        :model-value="question.mastered === 1"
        size="sm"
        aria-label="Mark as mastered"
        @update:model-value="emit('mastered', $event)"
      />
      <span style="font-size: 13px; color: var(--muted)">{{ question.mastered === 1 ? 'Marked as mastered' : 'Mark as mastered' }}</span>
    </div>

    <div class="answer-reveal">
      <Btn v-if="!revealed" size="lg" @click="emit('reveal')">Show answer</Btn>
      <div v-else class="answer-body">
        <div class="answer-text">{{ question.answer_summary }}</div>
        <div class="grade-row">
          <Btn variant="success" :disabled="grading" @click="emit('grade', true)">Correct</Btn>
          <Btn variant="error" :disabled="grading" @click="emit('grade', false)">Incorrect</Btn>
        </div>
        <p class="grade-note">Only Correct / Incorrect records an attempt. Skipping with Next records nothing.</p>
      </div>
    </div>

    <div class="practice-next">
      <span></span>
      <Btn variant="secondary" @click="emit('next')">{{ nextLabel }}</Btn>
    </div>
  </div>
</template>
