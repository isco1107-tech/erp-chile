import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { join } from 'node:path';

const networkScript = readFileSync(join(process.cwd(), 'desktop-client/src/network-check.js'), 'utf8');
const offlineHtml = readFileSync(join(process.cwd(), 'desktop-client/src/offline.html'), 'utf8');

it('reports native window failures so the local screen can retry', async () => {
  const context = {
    window: { __TAURI__: { core: { invoke: jest.fn().mockRejectedValueOnce(new Error('temporary native failure')).mockResolvedValueOnce(undefined) } } },
    switchWindow: undefined as undefined | ((mode: string) => Promise<boolean>),
  };
  runInNewContext(networkScript, context);
  expect(await context.switchWindow?.('app')).toBe(false);
  expect(await context.switchWindow?.('app')).toBe(true);
});

it('the offline launch screen retries after a native failure instead of becoming stuck', async () => {
  const status = { textContent: '' };
  const button = { disabled: false, addEventListener: jest.fn() };
  const switchWindow = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  let retry: (() => Promise<void>) | undefined;
  const script = offlineHtml.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  expect(script).toBeDefined();
  runInNewContext(script!, {
    document: { getElementById: (id: string) => id === 'status' ? status : button },
    probeConnectivity: jest.fn().mockResolvedValue(true),
    switchWindow,
    setInterval: (callback: () => Promise<void>) => { retry = callback; },
  });
  // Allow the initial connectivity probe and failed native launch to settle.
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(switchWindow).toHaveBeenCalledTimes(1);
  expect(button.disabled).toBe(false);
  await retry?.();
  expect(switchWindow).toHaveBeenCalledTimes(2);
});
