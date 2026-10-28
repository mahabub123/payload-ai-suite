/** Default styles; theme via CSS variables (--ais-*) or replace with your own using classNames. */
export const AI_SUITE_CSS = `
.ais-root{--ais-accent:#2563eb;--ais-accent-fg:#fff;--ais-bg:#fff;--ais-fg:#111827;--ais-muted:#6b7280;--ais-border:#e5e7eb;--ais-soft:#f3f4f6;--ais-radius:12px;--ais-font:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Bengali",sans-serif;--ais-z:2147483000;font-family:var(--ais-font);color:var(--ais-fg);font-size:14px;line-height:1.45}
.ais-root *{box-sizing:border-box}
.ais-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
.ais-btn{font:inherit;cursor:pointer;border-radius:8px;border:1px solid var(--ais-border);background:var(--ais-bg);color:var(--ais-fg);padding:6px 12px}
.ais-btn:focus-visible,.ais-input:focus-visible{outline:2px solid var(--ais-accent);outline-offset:2px}
.ais-btn-primary{background:var(--ais-accent);color:var(--ais-accent-fg);border-color:var(--ais-accent)}
.ais-btn:disabled{opacity:.55;cursor:not-allowed}
.ais-input{font:inherit;border:1px solid var(--ais-border);border-radius:8px;padding:8px 10px;background:var(--ais-bg);color:var(--ais-fg);width:100%}
.ais-launcher{position:fixed;right:20px;bottom:20px;z-index:var(--ais-z);width:56px;height:56px;border-radius:50%;border:0;background:var(--ais-accent);color:var(--ais-accent-fg);box-shadow:0 6px 20px rgba(0,0,0,.2);cursor:pointer;font-size:24px}
.ais-panel{position:fixed;right:20px;bottom:88px;z-index:var(--ais-z);width:min(400px,calc(100vw - 24px));height:min(640px,calc(100vh - 120px));display:flex;flex-direction:column;background:var(--ais-bg);border:1px solid var(--ais-border);border-radius:var(--ais-radius);box-shadow:0 12px 40px rgba(0,0,0,.18);overflow:hidden}
.ais-header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--ais-border)}
.ais-header h2{font-size:15px;margin:0;flex:1}
.ais-notice{font-size:12px;color:var(--ais-muted);background:var(--ais-soft);padding:6px 12px}
.ais-log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px}
.ais-msg{max-width:88%;padding:8px 12px;border-radius:var(--ais-radius);word-wrap:break-word}
.ais-msg p{margin:0 0 6px}.ais-msg p:last-child{margin:0}.ais-msg ul,.ais-msg ol{margin:4px 0;padding-left:20px}
.ais-msg a{color:inherit;text-decoration:underline}
.ais-msg-user{align-self:flex-end;background:var(--ais-accent);color:var(--ais-accent-fg)}
.ais-msg-assistant{align-self:flex-start;background:var(--ais-soft)}
.ais-msg-error{border:1px solid #fca5a5}
.ais-status{font-size:12px;color:var(--ais-muted)}
.ais-form{display:flex;gap:8px;padding:10px;border-top:1px solid var(--ais-border)}
.ais-form textarea{resize:none;min-height:40px;max-height:120px}
.ais-cards{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.ais-card{border:1px solid var(--ais-border);border-radius:10px;background:var(--ais-bg);padding:10px;color:var(--ais-fg)}
.ais-card h3{font-size:14px;margin:0 0 4px}
.ais-products{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px}
.ais-product{display:flex;flex-direction:column;gap:4px;border:1px solid var(--ais-border);border-radius:10px;padding:8px;background:var(--ais-bg);color:inherit;text-decoration:none}
.ais-product img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;background:var(--ais-soft)}
.ais-price{font-weight:600}.ais-compare{color:var(--ais-muted);text-decoration:line-through;margin-left:6px;font-weight:400}
.ais-badge{display:inline-block;font-size:12px;padding:2px 8px;border-radius:999px;background:#dcfce7;color:#166534}
.ais-badge-out{background:#fee2e2;color:#991b1b}.ais-badge-low{background:#fef3c7;color:#92400e}
.ais-row{display:flex;justify-content:space-between;gap:8px}
.ais-actions{display:flex;gap:8px;margin-top:8px}
.ais-slots{display:flex;flex-wrap:wrap;gap:6px}
.ais-feedback{display:flex;gap:4px;margin-top:4px}
.ais-feedback button{border:0;background:none;cursor:pointer;font-size:14px;opacity:.6}.ais-feedback button[aria-pressed=true]{opacity:1}
.ais-search{position:relative}
.ais-dropdown{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:var(--ais-z);background:var(--ais-bg);border:1px solid var(--ais-border);border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.12);list-style:none;margin:0;padding:4px;max-height:420px;overflow-y:auto}
.ais-option{display:flex;gap:8px;align-items:center;padding:6px 8px;border-radius:6px;cursor:pointer}
.ais-option[aria-selected=true]{background:var(--ais-soft)}
.ais-option img{width:40px;height:40px;object-fit:cover;border-radius:4px}
.ais-chart svg{width:100%;height:auto}
.ais-chart table{width:100%;border-collapse:collapse}.ais-chart td,.ais-chart th{border-bottom:1px solid var(--ais-border);padding:4px;text-align:left}
@media (prefers-reduced-motion:no-preference){.ais-panel{animation:ais-in .15s ease-out}@keyframes ais-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}}
`

/** Injects the default stylesheet once (React 19 hoists and de-duplicates by href). */
export const AISuiteStyles = () => (
  <style href="ai-suite-default-styles" precedence="default">
    {AI_SUITE_CSS}
  </style>
)
