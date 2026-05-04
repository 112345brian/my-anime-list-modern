const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, '.playwright-cache');
const scriptPath = path.join(root, 'mal_modern_companion.js');
const stylePath = path.join(root, 'mal_modern_companion.css');

function unwrapUserStyle(source) {
  return source
    .replace(/\/\* ==UserStyle==[\s\S]*?==\/UserStyle== \*\//, '')
    .replace(/@-moz-document\s+domain\("myanimelist\.net"\)\s*\{/, '')
    .replace(/\/\* end @-moz-document \*\//, '')
    .replace(/\n\}\s*$/, '\n');
}

async function dismissPrivacy(page) {
  await page.getByText(/^confirm$/i).click({ timeout: 2500 }).catch(() => {});
  await page.getByText(/^ok$/i).click({ timeout: 2500 }).catch(() => {});
  await page.locator('button, [role="button"]').filter({ hasText: /confirm|accept|agree/i }).first()
    .click({ timeout: 2500 })
    .catch(() => {});
  await page.locator('button, [role="button"]').filter({ hasText: /^ok$/i }).first()
    .click({ timeout: 2500 })
    .catch(() => {});
  await page.evaluate(() => {
    const overlays = Array.from(document.querySelectorAll('body *')).filter((el) => {
      const text = el.textContent || '';
      const cs = getComputedStyle(el);
      return cs.position === 'fixed' &&
        /Do Not Process My Personal Information|Personal Data Processing Opt Outs|We have received your choices/.test(text);
    });
    overlays.forEach((el) => el.remove());
    document.querySelectorAll('[class*="overlay"], [class*="modal"], [id*="qc-cmp"]').forEach((el) => {
      if (/Personal Data|Opt Outs|Do Not Process/.test(el.textContent || '')) el.remove();
    });
  }).catch(() => {});
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

  await page.goto('https://myanimelist.net/', {
    waitUntil: 'domcontentloaded',
    timeout: 45000
  });

  await dismissPrivacy(page);

  await page.addStyleTag({ content: unwrapUserStyle(fs.readFileSync(stylePath, 'utf8')) });
  await page.addScriptTag({ content: fs.readFileSync(scriptPath, 'utf8') });
  await page.waitForSelector('#mal-mod-frontpage', { timeout: 10000 });
  await page.waitForTimeout(800);
  await dismissPrivacy(page);

  const summary = await page.evaluate(() => {
    const visible = (selector) => Array.from(document.querySelectorAll(selector))
      .filter((el) => {
        const cs = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && box.width > 0 && box.height > 0;
      }).length;

    const firstTitle = document.querySelector('.mal-mod-newsroom .news-unit h3 a') ||
      document.querySelector('.mal-mod-newsroom .news-unit a');

    return {
      hasFrontpage: Boolean(document.querySelector('#mal-mod-frontpage')),
      visibleRankingWidgets: visible('.airing_ranking, .upcoming_ranking, .popular_ranking'),
      visibleNewsUnits: visible('.mal-mod-newsroom .news-unit'),
      visibleSections: visible('.mal-mod-section'),
      firstNewsTitle: firstTitle ? firstTitle.textContent.trim() : ''
    };
  });

  await page.screenshot({ path: path.join(outDir, 'homepage.png'), fullPage: false });
  await browser.close();

  if (!summary.hasFrontpage) throw new Error('Editorial front page was not injected.');
  if (summary.visibleRankingWidgets > 0) throw new Error('Static ranking widgets are still visible.');
  if (summary.visibleNewsUnits < 1) throw new Error('No news units were visible in the news lead.');
  if (summary.visibleSections < 4) throw new Error('Expected multiple editorial sections.');

  console.log(JSON.stringify(summary, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
