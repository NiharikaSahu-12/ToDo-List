<script lang="ts">
  import { enhance } from '$app/forms';
  import { ListTodo, Sparkles } from '@lucide/svelte';
  import type { ActionData } from './$types';
  import '../../lib/styles/auth.css';

  let { form }: { form: ActionData } = $props();
</script>

<svelte:head><title>Create account · Daymark</title></svelte:head>

<main class="auth-shell">
  <section class="auth-story">
    <a href="/" class="brand"><span class="brand-mark"><ListTodo size={21} /></span> daymark</a>
    <div class="story-copy">
      <div class="eyebrow"><Sparkles size={15} /> A calmer way to get things done</div>
      <h1>Start with a plan. <span>Find your flow.</span></h1>
      <p>A clear, connected workspace for the details you need to remember and the goals you want to reach.</p>
    </div>
    <div class="story-footer">Your next focused day starts here.</div>
  </section>
  <section class="auth-panel">
    <div class="auth-card">
      <div class="mobile-brand"><span class="brand-mark"><ListTodo size={21} /></span> daymark</div>
      <div class="auth-heading">
        <p class="eyebrow">GET STARTED</p>
        <h2>Create your workspace</h2>
        <p>One small step toward a more organized day.</p>
      </div>
      {#if form?.message}<p class:success={form.message.startsWith('Check your email')} class="form-message" role="status">{form.message}</p>{/if}
      <form method="POST" action="?/signup" use:enhance class="auth-form">
        <label for="email">Email address</label>
        <input id="email" name="email" type="email" autocomplete="email" required value={form?.email ?? ''} placeholder="you@example.com" />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="new-password" required minlength="8" placeholder="At least 8 characters" />
        <label for="confirmPassword">Confirm password</label>
        <input id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" required minlength="8" placeholder="Enter your password again" />
        <button class="primary-button" type="submit">Create account <span aria-hidden="true">→</span></button>
      </form>
      <div class="divider"><span>or sign up with</span></div>
      <form method="POST" action="?/google" use:enhance>
        <button class="google-button" type="submit"><span class="google-g">G</span> Continue with Google</button>
      </form>
      <p class="auth-switch">Already have an account? <a href="/login">Sign in</a></p>
      <p class="privacy-note">Your tasks are private and only visible to you.</p>
    </div>
  </section>
</main>
