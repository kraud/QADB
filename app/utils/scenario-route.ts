/** The cookie naming the last opened scenario. */
export const LAST_SCENARIO_COOKIE = 'qadb_scenario'

export const contentPath = (sid: string) => `/scenarios/${sid}/content`
export const editScenarioPath = (sid: string) => `/scenarios/${sid}/edit`
export const questionPath = (sid: string, id: string) => `/scenarios/${sid}/questions/${id}`
export const practicePath = (sid: string) => `/scenarios/${sid}/practice`
export const randomPracticePath = (sid: string) => `/scenarios/${sid}/practice/random`

/** Where `/` leads: the last opened scenario, or the only one, otherwise the scenario list. */
export function homePath(scenarios: { id: string }[], lastId?: string): string {
  const target = scenarios.find((scenario) => scenario.id === lastId) ?? (scenarios.length === 1 ? scenarios[0] : undefined)
  return target ? contentPath(target.id) : '/scenarios'
}
