/** Estilos del portal del proveedor y del seller (`sp-*`): los usan el portal con código y el Seller Center. */
export const PORTAL_STYLES = `
.sp-toolbar { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 1.1rem; }
.sp-search {
  flex: 1 1 14rem; min-width: 0; height: 2.75rem; padding: 0 0.9rem;
  border-radius: 12px; border: 1px solid var(--pub-line); background: var(--pub-glass); color: var(--pub-ink); font: inherit;
}
.sp-search::placeholder { color: var(--pub-ink-dim); }
.sp-search:focus-visible { outline: 2px solid var(--pub-a); outline-offset: 1px; }
.sp-download {
  display: inline-flex; align-items: center; gap: 0.4rem; height: 2.75rem; padding: 0 1rem; border-radius: 12px;
  border: 1px solid var(--pub-line); color: var(--pub-ink); text-decoration: none; font-size: 0.85rem; font-weight: 600;
}
.sp-download:hover { border-color: var(--pub-a); }
.sp-chips { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 0.8rem; }
.sp-chip {
  min-height: 2.25rem; padding: 0 0.85rem; border-radius: 999px; border: 1px solid var(--pub-line); background: transparent;
  color: var(--pub-ink-dim); font: inherit; font-size: 0.8rem; cursor: pointer;
}
.sp-chip[aria-pressed="true"] { background: linear-gradient(135deg, var(--pub-a), var(--pub-b)); color: var(--pub-on-accent); border-color: transparent; font-weight: 600; }
.sp-grid { list-style: none; margin: 0.9rem 0 0; padding: 0; display: grid; gap: 0.8rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 19rem), 1fr)); }
.sp-item {
  min-width: 0; padding: 1rem; border-radius: 16px; border: 1px solid var(--pub-line);
  background: linear-gradient(180deg, var(--pub-glass) 0%, var(--pub-glass-2) 100%), rgba(10,13,22,0.72);
}
.sp-item[data-status="OUT"] { border-color: color-mix(in oklab, var(--pub-danger) 60%, transparent); }
.sp-item[data-status="LOW"] { border-color: color-mix(in oklab, #f5b942 60%, transparent); }
/* El estado se distingue por color Y por texto: rojo = sin stock, ámbar = bajo el mínimo, verde = normal. */
.sp-tag { flex-shrink: 0; padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; white-space: nowrap; border: 1px solid transparent; }
.sp-tag[data-status="OUT"] { color: var(--pub-danger); background: color-mix(in oklab, var(--pub-danger) 14%, transparent); border-color: color-mix(in oklab, var(--pub-danger) 40%, transparent); }
.sp-tag[data-status="LOW"] { color: #f5b942; background: color-mix(in oklab, #f5b942 14%, transparent); border-color: color-mix(in oklab, #f5b942 40%, transparent); }
.sp-tag[data-status="OK"] { color: var(--pub-ok); background: color-mix(in oklab, var(--pub-ok) 12%, transparent); border-color: color-mix(in oklab, var(--pub-ok) 35%, transparent); }
.sp-item-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.6rem; }
.sp-item-name { min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
.sp-item-name strong { font-size: 0.98rem; line-height: 1.25; overflow-wrap: anywhere; }
.sp-item-name span { font-size: 0.74rem; color: var(--pub-ink-dim); overflow-wrap: anywhere; }
.sp-stock { margin: 0.7rem 0 0; display: flex; align-items: baseline; gap: 0.4rem; flex-wrap: wrap; }
.sp-stock-value { font-size: 1.9rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
.sp-stock-unit { font-size: 0.82rem; color: var(--pub-ink-dim); }
.sp-note { margin: 0.25rem 0 0; font-size: 0.74rem; color: var(--pub-ink-dim); }
.sp-wh { list-style: none; margin: 0.7rem 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: 0.4rem; }
.sp-wh li { display: inline-flex; gap: 0.4rem; padding: 0.25rem 0.6rem; border-radius: 999px; border: 1px solid var(--pub-line-soft); font-size: 0.75rem; color: var(--pub-ink-dim); }
.sp-wh strong { color: var(--pub-ink); font-variant-numeric: tabular-nums; }
.sp-facts { margin: 0.8rem 0 0; display: grid; gap: 0.35rem; }
.sp-facts div { display: flex; justify-content: space-between; gap: 0.8rem; font-size: 0.8rem; border-top: 1px solid var(--pub-line-soft); padding-top: 0.35rem; }
.sp-facts dt { color: var(--pub-ink-dim); }
.sp-facts dd { margin: 0; text-align: right; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.sp-empty { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; padding: 1.2rem 0; color: var(--pub-ink-dim); text-align: center; }
.sp-kpis { margin: 1.1rem 0 0; display: grid; gap: 0.6rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr)); }
.sp-kpis div { min-width: 0; padding: 0.7rem 0.85rem; border-radius: 12px; border: 1px solid var(--pub-line-soft); background: var(--pub-glass); }
.sp-kpis div[data-strong="true"] { border-color: var(--pub-a); }
.sp-kpis dt { font-size: 0.72rem; color: var(--pub-ink-dim); }
.sp-kpis dd { margin: 0.2rem 0 0; font-size: 1.25rem; font-weight: 700; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.sp-table-wrap { margin-top: 1rem; overflow-x: auto; }
.sp-table { width: 100%; min-width: 40rem; border-collapse: collapse; font-size: 0.82rem; }
.sp-table th { text-align: left; padding: 0.4rem 0.6rem; color: var(--pub-ink-dim); font-weight: 600; font-size: 0.74rem; border-bottom: 1px solid var(--pub-line); white-space: nowrap; }
.sp-table td { padding: 0.5rem 0.6rem; border-top: 1px solid var(--pub-line-soft); vertical-align: top; }
.sp-table .num { text-align: right; font-variant-numeric: tabular-nums; }
`;
