const { chromium } = require('playwright');
const dir = 'C:\\Users\\FRANCI~1\\AppData\\Local\\Temp\\claude\\d--ERP\\f18a2587-054f-4799-8fb0-e0f4c3091915\\scratchpad\\';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1400 } });

  await page.goto('http://localhost:3000/politica-privacidad', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: dir + 'politica-privacidad.png', fullPage: true });

  await page.goto('http://localhost:3000/aether/privacidad', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: dir + 'politica-aether.png', fullPage: true });

  await browser.close();
})();
