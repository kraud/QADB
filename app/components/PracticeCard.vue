<script setup lang="ts">
import type { Scenario } from '#shared/scenario/types'
import type { AttemptRow, QuestionWithStats } from '#shared/types/qadb'
import { renderMarkdown } from '~/utils/markdown'

type Q = QuestionWithStats & { attempts: AttemptRow[] }

const props = defineProps<{
  question: Q
  scenario: Scenario
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
      v-if="scenario.attributes.length"
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
      <div v-for="attribute in scenario.attributes" :key="attribute.id" class="meta-row">
        <svg class="meta-ic" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M160,56H64A16,16,0,0,0,48,72V224a8,8,0,0,0,12.65,6.51L112,193.83l51.36,36.68A8,8,0,0,0,176,224V72A16,16,0,0,0,160,56Zm0,152.46-43.36-31a8,8,0,0,0-9.3,0L64,208.45V72h96ZM208,40V192a8,8,0,0,1-16,0V40H88a8,8,0,0,1,0-16H192A16,16,0,0,1,208,40Z" /></svg>
        <span class="meta-label">{{ attribute.name }}</span>
        <AttributeBadges :scenario="{ attributes: [attribute] }" :values="question.values" :blurred="blurred" />
      </div>
    </div>

    <div class="practice-mastered">
      <Switch
        :model-value="question.mastered === 1"
        size="sm"
        :disabled="grading"
        aria-label="Mark as mastered"
        @update:model-value="emit('mastered', $event)"
      />
      <span style="font-size: 13px; color: var(--muted)">{{ question.mastered === 1 ? 'Marked as mastered' : 'Mark as mastered' }}</span>
    </div>

    <div class="answer-reveal">
      <Btn v-if="!revealed" size="lg" @click="emit('reveal')">Show answer</Btn>
      <div v-else class="answer-body">
        <div class="answer-text md" v-html="renderMarkdown(question.answer)"></div>
        <div class="grade-row">
          <Btn variant="success" :disabled="grading" @click="emit('grade', true)">Correct</Btn>
          <Btn variant="error" :disabled="grading" @click="emit('grade', false)">Incorrect</Btn>
        </div>
        <p class="grade-note">Only Correct / Incorrect records an attempt. Skipping with Next records nothing.</p>
      </div>
    </div>

    <div class="practice-next">
      <span></span>
      <Btn variant="secondary" :disabled="grading" @click="emit('next')">{{ nextLabel }}</Btn>
    </div>
  </div>
</template>
