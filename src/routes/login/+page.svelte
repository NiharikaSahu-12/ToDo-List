<script lang="ts">
  import { enhance } from '$app/forms';
  import { Check, ListTodo, Sparkles } from '@lucide/svelte';
  import type { ActionData } from './$types';
  import '../../lib/styles/auth.css';

  let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
  <title>Sign in · Daymark</title>
  <meta name="description" content="Sign in to your Daymark task workspace." />
</svelte:head>

<main class="auth-shell">
  <section class="auth-story">
    <a href="/" class="brand"><span class="brand-mark"><ListTodo size={21} /></span> daymark</a>
    <div class="story-copy">
      <div class="eyebrow"><Sparkles size={15} /> A calmer way to get things done</div>
      <h1>Make room for what <span>matters.</span></h1>
      <p>Bring your tasks into focus, turn big plans into small steps, and finish the day feeling good about your progress.</p>
      <div class="story-note"><span class="check-bubble"><Check size={14} /></span> Your work, organized around you.</div>
    </div>
    <div class="story-footer">A little more clarity, every day.</div>
  </section>

  <section class="auth-panel">
    <div class="auth-card">
      <div class="mobile-brand"><span class="brand-mark"><ListTodo size={21} /></span> daymark</div>
      <div class="auth-heading">
        <p class="eyebrow">WELCOME BACK</p>
        <h2>Sign in to your workspace</h2>
        <p>Pick up right where you left off.</p>
      </div>
      {#if form?.message}<p class="form-message" role="alert">{form.message}</p>{/if}

      <form method="POST" action="?/login" use:enhance class="auth-form">
        <label for="email">Email address</label>
        <input id="email" name="email" type="email" autocomplete="email" required value={form?.email ?? ''} placeholder="you@example.com" />
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required minlength="8" placeholder="At least 8 characters" />
        <button class="primary-button" type="submit">Sign in <span aria-hidden="true">→</span></button>
      </form>
      <div class="divider"><span>or continue with</span></div>
      <form method="POST" action="?/google" use:enhance>
        <button class="google-button" type="submit"><span class="google-g">G</span> Continue with Google</button>
      </form>
      <p class="auth-switch">New to Daymark? <a href="/signup">Create an account</a></p>
      <p class="privacy-note">Your tasks are private and only visible to you.</p>
    </div>
  </section>
</main>
