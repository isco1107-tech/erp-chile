/** Visual/keyboard checks against real UI components with explicit local fixtures.
 * No database, auth bypass, or external service calls. Run: node scripts/verify-design.mjs
 */
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const output = resolve(root, '.next/design-review');
await mkdir(output, { recursive: true });
const source = `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CircleDollarSign, TrendingUp, Wallet, Boxes, Orbit, Search } from 'lucide-react';
import { OperationsOverview } from '@/components/dashboard/OperationsOverview';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { KpiCard } from '@/components/ui/KpiCard';
import { SidebarNav } from '@/components/shared/SidebarNav';
import { MobileNavProvider, MobileNavToggle, MobileNavDrawer, MobileNavBackdrop } from '@/components/shared/MobileNav';
import { WorkspaceBreadcrumb } from '@/components/shared/WorkspaceBreadcrumb';
import { WorkspaceTheme } from '@/components/shared/WorkspaceTheme';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import LoginPage from '@/app/login/page';
const groups = [
 {label:'Principal',links:[{href:'/dashboard',label:'Centro de operaciones',icon:'home',exact:true},{href:'/dashboard/pos',label:'Punto de Venta',icon:'pos'},{href:'/dashboard/messaging',label:'Mensajería',icon:'messaging'}]},
 {label:'Inventario',links:[{href:'/dashboard/products',label:'Catálogo de Productos',icon:'products'},{href:'/dashboard/inventory',label:'Inventario',icon:'inventory'}]},
 {label:'Ventas',links:[{href:'/dashboard/sales',label:'Ventas & Facturación',icon:'sales'},{href:'/dashboard/contacts',label:'Clientes & Proveedores',icon:'contacts'}]},
 {label:'Finanzas',links:[{href:'/dashboard/treasury/cxc',label:'Cuentas por Cobrar',icon:'cxc'},{href:'/dashboard/treasury/cxp',label:'Cuentas por Pagar',icon:'cxp'},{href:'/dashboard/treasury/cashflow',label:'Flujo de Caja',icon:'cashflow'}]},
 {label:'Producción',links:[{href:'/dashboard/candidates',label:'Candidatas & Staff',icon:'candidates'},{href:'/dashboard/candidates/compliance',label:'Cumplimiento',icon:'candidates'}]},
 {label:'Configuración',links:[{href:'/dashboard/settings',label:'Configuración',icon:'settings'}]}
];
const buckets = ['oct','nov','dic','ene','feb','mar','abr','may','jun','jul','ago','sep'].map((label,i)=>({key:label,label,netSales:[32,44,38,55,48,62,56,74,67,83,73,92][i]*100000,costOfSales:[20,26,23,34,29,36,33,45,39,48,42,51][i]*100000}));
function Preview(){
 const [open,setOpen]=useState(false);
 return <WorkspaceTheme><div className="theme-saas-light min-h-screen"><MobileNavProvider><MobileNavBackdrop/><MobileNavDrawer><aside className="aether-sidebar flex h-full flex-col bg-sidebar"><div className="p-6"><div className="flex items-center gap-3 text-white"><Orbit className="size-9 text-[#d7e9b4]"/><span className="font-semibold tracking-widest">AETHER <small className="font-normal">ERP</small></span></div><div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white">Estudio Horizonte<p className="mt-1 text-xs text-sidebar-foreground">Espacio de trabajo · Ejemplo</p></div></div><SidebarNav groups={groups}/><div className="border-t border-white/10 p-5 text-xs text-sidebar-foreground">Vista de diseño · Datos de ejemplo</div></aside></MobileNavDrawer>
 <div className="min-h-screen lg:pl-[260px]"><header className="sticky top-0 z-10 flex h-[72px] items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur-md lg:px-8"><MobileNavToggle/><WorkspaceBreadcrumb groups={groups}/><div className="flex-1"/><button onClick={()=>setOpen(true)} className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2.5 text-xs text-muted-foreground"><Search className="size-4"/>Buscar en tu espacio</button><span className="flex size-9 items-center justify-center rounded-full bg-accent text-xs text-accent-foreground">FH</span></header>
 <main className="mx-auto max-w-[1600px] space-y-7 px-4 py-6 sm:px-6 lg:p-8">
 <OperationsOverview greeting="Buenos días, Francisco" companyName="Estudio Horizonte" date="9 de septiembre de 2026" moduleCount={8} alertCount={2} action={{href:'/dashboard/sales/new',label:'Nueva venta'}}/>
 <div id="operational-priorities" className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/25 bg-warning-soft/40 p-4 text-xs"><span className="font-semibold text-warning">POR RESOLVER</span><a href="/dashboard/inventory" className="rounded-full border border-border bg-card px-3 py-2">3 productos bajo stock mínimo</a><a href="/dashboard/treasury/cxc" className="rounded-full border border-border bg-card px-3 py-2">2 cuentas por cobrar vencidas</a></div>
 <section><h2 className="aether-section-label mb-3">El negocio en cifras</h2><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-4"><KpiCard label="Ventas netas del mes" value="$9.200.000" icon={CircleDollarSign} trend="+26,0%" trendDirection="up"/><KpiCard label="Margen bruto" value="44,6%" icon={TrendingUp} tone="success"/><KpiCard label="Cuentas por cobrar" value="$1.850.000" icon={Wallet} tone="warning"/><KpiCard label="Valor de bodega" value="$12.450.000" icon={Boxes} tone="info"/></div></section>
 <DashboardCharts monthlyBuckets={buckets} mixData={[{name:'Facturas',value:42,color:'var(--chart-1)'},{name:'Boletas',value:26,color:'var(--chart-2)'},{name:'Notas de crédito',value:4,color:'var(--chart-3)'}]} currentMonthDocCount={72}/>
 <div className="max-w-xs"><Select defaultValue="month"><SelectTrigger aria-label="Período de prueba"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="month">Este mes</SelectItem><SelectItem value="year">Este año</SelectItem></SelectContent></Select></div>
 <p className="text-xs text-muted-foreground">Vista de diseño con datos de ejemplo. No representa información de una empresa real.</p>
 </main></div></MobileNavProvider><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Tu espacio de trabajo</DialogTitle><DialogDescription>Verificación del tema compartido del diálogo.</DialogDescription><button onClick={()=>setOpen(false)}>Cerrar vista</button></DialogContent></Dialog></div></WorkspaceTheme>;
}
createRoot(document.getElementById('root')).render(location.pathname === '/login' ? <LoginPage/> : <Preview/>);
`;

console.log('Building isolated component preview...');
await build({
  stdin: { contents: source, resolveDir: root, loader: 'tsx' },
  bundle: true, write: true, outfile: resolve(output, 'app.js'), platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'local-next-adapters', setup(builder) {
    builder.onResolve({ filter: /^next\/(link|navigation)$/ }, ({ path }) => ({ path, namespace: 'preview' }));
    builder.onLoad({ filter: /.*/, namespace: 'preview' }, ({ path }) => ({
      contents: path === 'next/link'
        ? 'import React from "react"; export default function Link({prefetch, ...props}) {return React.createElement("a",props)}'
        : 'export const usePathname = () => location.pathname; export const useRouter = () => ({push: (href) => location.assign(href), refresh: () => {}});',
      resolveDir: root, loader: 'js',
    }));
  } }],
});
console.log('Compiling application styles...');
const css = await postcss([tailwind()]).process(await readFile(resolve(root, 'src/app/globals.css'), 'utf8'), { from: resolve(root, 'src/app/globals.css') });
await writeFile(resolve(output, 'style.css'), css.css);
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/app.js' || req.url === '/style.css') {
      res.setHeader('Content-Type', req.url.endsWith('.js') ? 'text/javascript' : 'text/css');
      res.end(await readFile(resolve(output, req.url.slice(1))));
    } else if (req.url?.startsWith('/branding/') && !req.url.includes('..')) {
      res.setHeader('Content-Type', 'image/png');
      res.end(await readFile(resolve(root, 'public', req.url.slice(1))));
    } else {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"><style>body{font-family:Arial,sans-serif}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
    }
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const errors = [];
try {
  console.log('Checking responsive layout and keyboard interactions...');
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, reducedMotion: 'reduce' });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/dashboard`);
  await page.getByRole('heading', { name: 'Centro de operaciones' }).waitFor();
  await page.screenshot({ path: resolve(output, 'dashboard-desktop.png'), fullPage: true });
  assert.equal(await page.locator('[aria-current="page"]').count(), 2);
  await page.getByRole('button', { name: '6m', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: '6m', exact: true }).getAttribute('aria-pressed'), 'true');
  assert.match(await page.getByText('Ventas netas y costo PMP').textContent(), /6 meses/);
  await page.getByRole('button', { name: 'Buscar en tu espacio' }).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('dialog').evaluate((el) => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Este año' }).click();
  assert.match(await page.getByRole('combobox').textContent(), /year/);
  await page.goto(`${base}/dashboard/candidates/compliance`);
  assert.equal(await page.locator('nav[aria-label="Navegación principal"] [aria-current="page"]').count(), 1);
  assert.equal(await page.locator('nav[aria-label="Navegación principal"] [aria-current="page"]').getAttribute('href'), '/dashboard/candidates/compliance');
  await page.goto(`${base}/dashboard`);
  await page.setViewportSize({ width: 390, height: 844 });
  // Recharts updates its SVG after ResizeObserver delivers the new viewport.
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile must not overflow horizontally');
  await page.screenshot({ path: resolve(output, 'dashboard-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await page.getByRole('navigation', { name: 'Navegación principal' }).waitFor({ state: 'visible' });
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => !!document.activeElement?.closest('#workspace-navigation')), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('button', { name: 'Abrir menú', exact: true }).evaluate((el) => el === document.activeElement), true);
  await page.goto(`${base}/login`);
  await page.screenshot({ path: resolve(output, 'login-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  assert.equal(await page.locator('#username').getAttribute('aria-invalid'), 'true');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/login`);
  assert.equal(await page.locator('.aether-auth').evaluate((el) => el.getBoundingClientRect().height >= innerHeight), true, 'Login must fill the viewport');
  await page.screenshot({ path: resolve(output, 'login-desktop.png'), fullPage: true });
  assert.deepEqual(errors, [], 'No client runtime errors');
  console.log('PASS: desktop/mobile layout, chart period, dialog theme, select, nested navigation, mobile focus/Escape, login validation.');
  console.log(`Screenshots: ${output}`);
} finally {
  await browser.close();
  server.close();
}
