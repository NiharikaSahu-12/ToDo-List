<script lang="ts">
  import { page } from '$app/state';
  import { AlertTriangle, Home, RefreshCw } from '@lucide/svelte';

</script>

<svelte:head><title>{page.status} · Daymark</title></svelte:head>

<main class="error-page">
  <div class="error-card">
    <span class="error-icon"><AlertTriangle size={23} /></span>
    <p class="eyebrow">SOMETHING WENT WRONG</p>
    <h1>{page.status === 404 ? 'This page wandered off.' : 'We hit a snag.'}</h1>
    <p>{page.status === 404 ? 'The page may have moved, or the link may be out of date.' : 'Your data is safe. Try again, or head back to your workspace.'}</p>
    <div><button onclick={() => location.reload()}><RefreshCw size={15} /> Try again</button><a href="/"><Home size={15} /> Go home</a></div>
  </div>
</main>

<style>
  .error-page{display:grid;min-height:100vh;place-items:center;padding:24px;background:radial-gradient(ellipse at 50% 15%,#ece9ff,#f8f8f6 65%)}
  .error-card{width:min(100%,430px);text-align:center}
  .error-icon{display:grid;width:52px;height:52px;place-items:center;margin:0 auto 20px;border-radius:16px;background:#efedff;color:#6d5efc}
  .eyebrow{color:#786ce5;font-size:10px;font-weight:800;letter-spacing:1.4px}
  h1{margin:11px 0;color:#282631;font:800 28px Manrope,sans-serif;letter-spacing:-1px}
  .error-card>p:last-of-type{color:#85828f;font-size:13px;line-height:1.7}
  .error-card>div{display:flex;justify-content:center;gap:10px;margin-top:24px}
  button,a{display:inline-flex;align-items:center;gap:7px;border:1px solid #e6e3f2;border-radius:8px;padding:10px 13px;background:#fff;color:#514c69;text-decoration:none;font-size:11px;font-weight:700;cursor:pointer}
</style>
