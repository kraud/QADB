<script setup lang="ts">
import type { AttemptRow, QuestionWithStats } from '#shared/types/qadb'
import { CATEGORY_COLOR, DIFFICULTY_COLOR, DIFFICULTY_LABEL, IMPORTANCE_COLOR, IMPORTANCE_LABEL, type Category } from '#shared/enums'
import { renderMarkdown } from '~/utils/markdown'

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
const blurred = ref(true)
</script>

<template>
  <div class="practice-card">
    <p class="q-label">Question</p>
    <h1 class="q">{{ question.question }}</h1>

    <div
      class="practice-meta"
      :class="{ blurred }"
      role="button"
      tabindex="0"
      :aria-pressed="!blurred"
      aria-label="Toggle question metadata visibility"
      @click="blurred = !blurred"
      @keydown.enter.prevent="blurred = !blurred"
      @keydown.space.prevent="blurred = !blurred"
    >
      <div class="meta-row">
        <svg class="meta-ic" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M232,208a8,8,0,0,1-8,8H32a8,8,0,0,1-8-8V48a8,8,0,0,1,16,0v94.37L90.73,98a8,8,0,0,1,10.07-.38l58.81,44.11L218.73,90a8,8,0,1,1,10.54,12l-64,56a8,8,0,0,1-10.07.38L96.39,114.29,40,163.63V200H224A8,8,0,0,1,232,208Z" /></svg>
        <span class="meta-label">Importance</span>
        <Badge :tone="blurred ? 'neutral' : 'imp'" :color="blurred ? undefined : IMPORTANCE_COLOR[question.importance as keyof typeof IMPORTANCE_COLOR]">{{ IMPORTANCE_LABEL[question.importance as keyof typeof IMPORTANCE_LABEL] }}</Badge>
      </div>
      <div class="meta-row">
        <svg class="meta-ic" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M183.89,153.34a57.6,57.6,0,0,1-46.56,46.55A8.75,8.75,0,0,1,136,200a8,8,0,0,1-1.32-15.89c16.57-2.79,30.63-16.85,33.44-33.45a8,8,0,0,1,15.78,2.68ZM216,144a88,88,0,0,1-176,0c0-27.92,11-56.47,32.66-84.85a8,8,0,0,1,11.93-.89l24.12,23.41,22-60.41a8,8,0,0,1,12.63-3.41C165.21,36,216,84.55,216,144Zm-16,0c0-46.09-35.79-85.92-58.21-106.33L119.52,98.74a8,8,0,0,1-13.09,3L80.06,76.16C64.09,99.21,56,122,56,144a72,72,0,0,0,144,0Z" /></svg>
        <span class="meta-label">Difficulty</span>
        <Badge :tone="blurred ? 'neutral' : 'diff'" :color="blurred ? undefined : DIFFICULTY_COLOR[question.difficulty as keyof typeof DIFFICULTY_COLOR]">{{ DIFFICULTY_LABEL[question.difficulty as keyof typeof DIFFICULTY_LABEL] }}</Badge>
      </div>
      <div class="meta-row">
        <svg class="meta-ic" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M160,56H64A16,16,0,0,0,48,72V224a8,8,0,0,0,12.65,6.51L112,193.83l51.36,36.68A8,8,0,0,0,176,224V72A16,16,0,0,0,160,56Zm0,152.46-43.36-31a8,8,0,0,0-9.3,0L64,208.45V72h96ZM208,40V192a8,8,0,0,1-16,0V40H88a8,8,0,0,1,0-16H192A16,16,0,0,1,208,40Z" /></svg>
        <span class="meta-label">Categories</span>
        <span class="meta-cats">
          <Badge v-for="c in question.category" :key="c" :tone="blurred ? 'neutral' : 'cat'" :color="blurred ? undefined : CATEGORY_COLOR[c as Category]">{{ c }}</Badge>
        </span>
      </div>
    </div>

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
        <div class="answer-text md" v-html="renderMarkdown(question.answer_summary)"></div>
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
