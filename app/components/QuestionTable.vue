<script setup lang="ts">
import type { QuestionWithStats } from '#shared/types/qadb'
import { CATEGORY_COLOR, DIFFICULTY_COLOR, DIFFICULTY_LABEL, IMPORTANCE_COLOR, IMPORTANCE_LABEL } from '#shared/enums'
import { rel } from '~/utils/format'

const props = defineProps<{ questions: QuestionWithStats[]; selection: string[] }>()
const emit = defineEmits<{
  (e: 'open', id: string): void
  (e: 'toggle', id: string): void
  (e: 'selectAll', checked: boolean): void
  (e: 'edit', id: string): void
  (e: 'remove', id: string): void
}>()

const visibleIds = computed(() => props.questions.map((q) => q.id))
const selectedCount = computed(() => visibleIds.value.filter((id) => props.selection.includes(id)).length)
const allChecked = computed(() => visibleIds.value.length > 0 && selectedCount.value === visibleIds.value.length)
const indeterminate = computed(() => selectedCount.value > 0 && selectedCount.value < visibleIds.value.length)

function pct(q: QuestionWithStats): string {
  return q.stats.trackRecordPct == null ? '—' : q.stats.trackRecordPct.toFixed(1)
}

function last(q: QuestionWithStats): string {
  return q.stats.lastAnsweredAt == null ? '—' : rel(q.stats.lastAnsweredAt)
}

</script>
<template>
  <div class="table-wrap">
    <table class="qtable">
      <thead>
        <tr>
          <th class="col-check">
            <Checkbox
              :model-value="allChecked"
              :indeterminate="indeterminate"
              aria-label="Select all shown"
              @update:model-value="emit('selectAll', $event)"
            />
          </th>
          <th class="col-q">Question</th>
          <th>Difficulty</th>
          <th>Importance</th>
          <th>Category</th>
          <th class="col-num">Practiced</th>
          <th class="col-num">% correct</th>
          <th class="col-num">Last answered</th>
          <th>Mastered</th>
          <th class="col-act">Link</th>
          <th class="col-act" aria-label="Actions"></th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="q in questions"
          :key="q.id"
          :class="{ 'row-selected': selection.includes(q.id) }"
          @click="emit('open', q.id)"
        >
          <td class="col-check" @click.stop>
            <Checkbox
              :model-value="selection.includes(q.id)"
              :aria-label="`Select question ${q.id}`"
              @update:model-value="emit('toggle', q.id)"
            />
          </td>
          <td class="col-q"><span class="q-cell">{{ q.question }}</span></td>
          <td><Badge tone="diff" :color="DIFFICULTY_COLOR[q.difficulty as keyof typeof DIFFICULTY_COLOR]">{{ DIFFICULTY_LABEL[q.difficulty as keyof typeof DIFFICULTY_LABEL] }}</Badge></td>
          <td><Badge tone="imp" :color="IMPORTANCE_COLOR[q.importance as keyof typeof IMPORTANCE_COLOR]">{{ IMPORTANCE_LABEL[q.importance as keyof typeof IMPORTANCE_LABEL] }}</Badge></td>
          <td><Badge tone="cat" :color="CATEGORY_COLOR[q.category as keyof typeof CATEGORY_COLOR]">{{ q.category }}</Badge></td>
          <td class="col-num">{{ q.stats.attemptCount }}</td>
          <td class="col-num">{{ pct(q) }}</td>
          <td class="col-num">{{ last(q) }}</td>
          <td>
            <span v-if="q.mastered" class="done-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 12l6 6L20 6" /></svg>Done</span>
            <span v-else class="blank">—</span>
          </td>
          <td class="col-act">
            <a v-if="q.link" class="link-ic" :href="q.link" target="_blank" rel="noopener" aria-label="Open original question" @click.stop>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" /></svg>
            </a>
            <span v-else class="link-ic blank" style="cursor: default"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="opacity: .4"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" /></svg></span>
          </td>
          <td class="col-act" @click.stop>
            <button class="btn-icon" :aria-label="`Edit ${q.id}`" @click="emit('edit', q.id)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M17 3l4 4L8 20l-5 1 1-5L17 3z" /></svg>
            </button>
            <button class="btn-icon danger" :aria-label="`Delete ${q.id}`" @click="emit('remove', q.id)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="card-list">
    <div
      v-for="q in questions"
      :key="q.id"
      class="mcard"
      :class="{ selected: selection.includes(q.id) }"
      @click="emit('open', q.id)"
    >
      <div class="row-top">
        <span @click.stop>
          <Checkbox
            :model-value="selection.includes(q.id)"
            :aria-label="`Select question ${q.id}`"
            @update:model-value="emit('toggle', q.id)"
          />
        </span>
        <div class="q">{{ q.question }}</div>
      </div>
      <div class="meta-row">
        <Badge tone="diff" :color="DIFFICULTY_COLOR[q.difficulty as keyof typeof DIFFICULTY_COLOR]">{{ DIFFICULTY_LABEL[q.difficulty as keyof typeof DIFFICULTY_LABEL] }}</Badge>
        <Badge tone="imp" :color="IMPORTANCE_COLOR[q.importance as keyof typeof IMPORTANCE_COLOR]">{{ IMPORTANCE_LABEL[q.importance as keyof typeof IMPORTANCE_LABEL] }}</Badge>
        <Badge tone="cat" :color="CATEGORY_COLOR[q.category as keyof typeof CATEGORY_COLOR]">{{ q.category }}</Badge>
        <Badge v-if="q.mastered" tone="mastered"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 12l6 6L20 6" /></svg>Done</Badge>
      </div>
      <div class="stats">
        <span>{{ q.stats.attemptCount }} practiced</span>
        <span>{{ pct(q) === '—' ? '—' : pct(q) + '% correct' }}</span>
        <span>{{ q.stats.lastAnsweredAt == null ? 'never done' : 'last ' + rel(q.stats.lastAnsweredAt) }}</span>
      </div>
      <div style="display: flex; gap: 8px; margin-top: 10px" @click.stop>
        <Btn variant="secondary" size="sm" @click="emit('edit', q.id)">Edit</Btn>
        <Btn variant="danger" size="sm" @click="emit('remove', q.id)">Delete</Btn>
      </div>
    </div>
  </div>
</template>
