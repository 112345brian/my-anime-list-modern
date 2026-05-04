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
        visibleGuestSignupBars: visible('.bottom-bar.ga-impression, .bottom-bar'),
        visibleNewsUnits: visible('.mal-mod-newsroom .news-unit'),
        visibleSections: visible('.mal-mod-section'),
        visiblePulseCards: visible('.mal-mod-pulse-card'),
        firstNewsTitle: firstTitle ? firstTitle.textContent.trim() : ''
    };
  });

  await page.screenshot({ path: path.join(outDir, 'homepage.png'), fullPage: false });

  if (!summary.hasFrontpage) throw new Error('Editorial front page was not injected.');
  if (summary.visibleRankingWidgets > 0) throw new Error('Static ranking widgets are still visible.');
  if (summary.visibleGuestSignupBars > 0) throw new Error('Guest signup bottom bar is still visible.');
  if (summary.visibleNewsUnits < 1) throw new Error('No news units were visible in the news lead.');
  if (summary.visibleSections < 4) throw new Error('Expected multiple editorial sections.');
  if (summary.visiblePulseCards !== 4) throw new Error('Community Pulse should render four cards.');

  const clickablePage = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await clickablePage.goto('https://myanimelist.net/', {
    waitUntil: 'domcontentloaded',
    timeout: 45000
  });
  await clickablePage.addStyleTag({ content: unwrapUserStyle(fs.readFileSync(stylePath, 'utf8')) });
  await clickablePage.addScriptTag({ content: fs.readFileSync(scriptPath, 'utf8') });
  await clickablePage.waitForSelector('#mal-mod-frontpage', { timeout: 10000 });
  await clickablePage.waitForTimeout(1500);
  const newsHref = await clickablePage.locator('.mal-mod-newsroom .news-unit h3 a').first().getAttribute('href');
  await clickablePage.locator('.mal-mod-newsroom .news-unit h3 a').first().click({ timeout: 5000 });
  await clickablePage.waitForTimeout(800);
  if (clickablePage.url() === 'https://myanimelist.net/') {
    throw new Error('News headline click did not navigate.');
  }
  if (newsHref && !clickablePage.url().startsWith(newsHref)) {
    throw new Error('News headline click navigated to the wrong URL.');
  }
  await clickablePage.close();

  const detailPage = await browser.newPage({ viewport: { width: 1800, height: 1200 } });
  await detailPage.goto('https://myanimelist.net/anime/21677/Captain_Earth', {
    waitUntil: 'domcontentloaded',
    timeout: 45000
  });
  await detailPage.addStyleTag({ content: unwrapUserStyle(fs.readFileSync(stylePath, 'utf8')) });
  await detailPage.addScriptTag({ content: fs.readFileSync(scriptPath, 'utf8') });
  await detailPage.waitForTimeout(2200);
  await detailPage.screenshot({ path: path.join(outDir, 'anime-detail.png'), fullPage: false });

  const detailSummary = await detailPage.evaluate(() => {
    const visible = (selector) => Array.from(document.querySelectorAll(selector))
      .filter((el) => {
        const cs = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        return cs.display !== 'none' && cs.visibility !== 'hidden' && box.width > 0 && box.height > 0;
      }).length;
    const titleBox = document.querySelector('h1.title-name strong')?.getBoundingClientRect();
    const wrapperBox = document.querySelector('#contentWrapper')?.getBoundingClientRect();

    return {
      hasDetailClass: document.body.classList.contains('mal-mod-detail'),
      titleVisible: Boolean(titleBox && titleBox.width > 200 && titleBox.height > 30),
      wideCanvas: Boolean(wrapperBox && wrapperBox.width >= 1300),
      visibleLetterboxdTabs: visible('.mal-mod-lb-tab'),
      visibleLetterboxdStage: visible('.mal-mod-lb-stage'),
      visibleConsentOverlays: visible('[id^="qc-cmp"], [class*="qc-cmp"]'),
      visibleTooltips: visible('.mal-tooltip-layer, mal-tooltip'),
      hoverPreviewInjected: Boolean(document.querySelector('#mal-mod-preview'))
    };
  });

  if (!detailSummary.hasDetailClass) throw new Error('Detail page class was not applied.');
  if (!detailSummary.titleVisible) throw new Error('Anime detail title is not visible.');
  if (!detailSummary.wideCanvas) throw new Error('Anime detail canvas is still narrow.');
  if (detailSummary.visibleLetterboxdTabs < 4) throw new Error('Detail page tabs were not rendered.');
  if (detailSummary.visibleLetterboxdStage < 1) throw new Error('Detail page tab stage was not rendered.');
  if (detailSummary.visibleConsentOverlays > 0) throw new Error('Consent overlay is still visible on detail page.');
  if (detailSummary.visibleTooltips > 0) throw new Error('MAL tooltip layer is still visible on detail page.');
  if (detailSummary.hoverPreviewInjected) throw new Error('Custom hover preview should be disabled.');
  await detailPage.close();
  await browser.close();

  console.log(JSON.stringify({ homepage: summary, animeDetail: detailSummary }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
