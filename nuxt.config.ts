// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['nuxt-auth-utils', '@pinia/nuxt'],

  app: {
    head: {
      title: 'Q&A-DB',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
    },
  },

  components: [
    { path: '~/components', pathPrefix: false },
  ],

  css: ['~/assets/tokens.css'],

  runtimeConfig: {
    tursoUrl: '',
    tursoToken: '',
    opencodeApiKey: '',
    // Chat completions endpoint behind "Format with AI"; override with NUXT_OPENCODE_URL.
    opencodeUrl: 'https://opencode.ai/zen/go/v1/chat/completions',
    sessionPassword: '',
    public: {
      // Closed unless NUXT_PUBLIC_REGISTRATION_OPEN=true. Public, as the login page reads it too.
      registrationOpen: false,
    },
    session: {
      // nuxt-auth-utils' own default; the type requires it. NUXT_SESSION_PASSWORD sets the value.
      password: '',
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
