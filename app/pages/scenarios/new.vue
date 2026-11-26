<template>
  <div class="detail-wrap">
    <NuxtLink class="back-link" to="/scenarios">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6" /></svg>
      Back to scenarios
    </NuxtLink>

    <div class="content-head">
      <div>
        <h1>New scenario</h1>
        <p class="sub">A scenario holds a set of questions and the attributes that describe them.</p>
      </div>
    </div>

    <ScenarioForm />
  </div>
</template>
