export function useApi() {
  // `useRequestFetch` forwards the incoming request (cookies) during SSR,
  // which the global `$fetch` does not — needed for server-side data fetching.
  const requestFetch = useRequestFetch()

  async function api<T = unknown>(url: string, opts?: Parameters<typeof requestFetch>[1]): Promise<T> {
    try {
      return (await requestFetch(url, opts)) as T
    } catch (err: unknown) {
      if ((err as { statusCode?: number } | null)?.statusCode === 401) {
        usePracticeStore().clear()
        await navigateTo('/login?expired=1', { redirectCode: 302 })
      }
      throw err
    }
  }

  return api
}
