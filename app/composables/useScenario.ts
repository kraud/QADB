import type { ScenarioDetail, ScenarioSummary } from '#shared/types/qadb'
import { LAST_SCENARIO_COOKIE } from '~/utils/scenario-route'

/** One scenario of the user; opening it makes it the last opened one. */
export function useScenario(sid: Ref<string>) {
  const api = useApi()
  const lastOpened = useCookie<string | null>(LAST_SCENARIO_COOKIE, { maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' })

  const { data: scenario, pending, error, refresh } = useAsyncData(
    () => `scenario-${sid.value}`,
    () => api<ScenarioDetail>(`/api/scenarios/${encodeURIComponent(sid.value)}`),
  )

  watch(
    scenario,
    (loaded) => {
      if (loaded) lastOpened.value = loaded.id
    },
    { immediate: true },
  )

  return { scenario, pending, error, refresh }
}

/** The user's scenarios with their question counts, oldest first. */
export function useScenarios() {
  const api = useApi()
  const { data: scenarios, pending, error, refresh } = useAsyncData('scenarios', () =>
    api<ScenarioSummary[]>('/api/scenarios'),
  )
  return { scenarios, pending, error, refresh }
}
