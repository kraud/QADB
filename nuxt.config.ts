// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['nuxt-auth-utils', '@pinia/nuxt'],

  components: [
    { path: '~/components', pathPrefix: false },
  ],

  css: ['~/assets/tokens.css'],

  runtimeConfig: {
    tursoUrl: '',
    tursoToken: '',
    opencodeApiKey: '',
    sessionPassword: '',
    session: {
      cookie: {
        // h3 defaults cookies to `secure: true`, which browsers reject over http://localhost in dev.
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },

  typescript: {
    strict: true,
  },
})
