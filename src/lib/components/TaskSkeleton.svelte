<div class="skeleton" aria-label="Loading tasks" role="status">
  <div class="heading"><span></span><span></span></div>
  <div class="composer"><span></span><span></span></div>
  <div class="columns">
    {#each [1, 2, 3] as column}
      <section aria-hidden="true">
        <span class="column-heading"></span>
        {#each [1, 2] as card}
          <div class="card"><span></span><span></span><span></span></div>
        {/each}
      </section>
    {/each}
  </div>
</div>

<style>
  .skeleton{display:grid;gap:22px;animation:pulse 1.4s ease-in-out infinite alternate}
  .heading,.composer,.card{display:grid;gap:10px;padding:17px;border:1px solid #eceaf0;border-radius:11px;background:#fff}
  .heading span,.composer span,.column-heading,.card span{display:block;height:12px;border-radius:7px;background:#eeedf2}
  .heading span:first-child{width:180px;height:26px}.heading span:last-child{width:270px}
  .composer span:first-child{width:70%;height:20px}.composer span:last-child{width:40%}
  .columns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
  .columns section{display:grid;align-content:start;gap:10px}.column-heading{width:120px;margin:4px 0}
  .card{min-height:105px}.card span:nth-child(1){width:45%}.card span:nth-child(2){width:83%}.card span:nth-child(3){width:60%}
  @keyframes pulse{to{opacity:.55}}
  @media(max-width:700px){.columns{grid-template-columns:1fr}.columns section:not(:first-child){display:none}}
  @media(prefers-reduced-motion:reduce){.skeleton{animation:none}}
</style>
