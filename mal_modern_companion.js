// ==UserScript==
// @name         MAL Modern Companion
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  News-first layout, hover previews, keyboard nav for MyAnimeList
// @author       You
// @match        https://myanimelist.net/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=myanimelist.net
// @grant        none
// @inject-into  content
// @noframes
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  var FEATURES = {
    newsFirst: true,
    hideClutter: true,
    hoverPreview: true,
    keyboardNav: true,
    backToTop: true,
    readingProgress: true
  };

  // ── Injected styles ──────────────────────────────────────────────────────
  var css = document.createElement('style');
  css.textContent = [
    /* Injected news header */
    '#mal-mod-news-hdr{display:flex;align-items:center;justify-content:space-between;' +
    'font-family:"DM Sans",-apple-system,sans-serif;font-size:11px;font-weight:700;' +
    'color:#9494a0;text-transform:uppercase;letter-spacing:.12em;' +
    'border-left:2px solid #5b8def;padding:0 0 0 12px;margin:24px 0 18px}',
    '#mal-mod-news-hdr a{font-size:11px!important;font-weight:600!important;color:#5a5a68!important;' +
    'text-transform:uppercase!important;letter-spacing:.10em!important;text-decoration:none!important}',
    '#mal-mod-news-hdr a:hover{color:#5b8def!important}',

    /* Reading progress bar */
    '#mal-mod-progress{position:fixed;top:0;left:0;height:2px;z-index:999999;' +
    'background:linear-gradient(90deg,#5b8def,#7ba4ff);width:0%;pointer-events:none;transition:width .08s linear}',

    /* Back to top */
    '#mal-mod-top{position:fixed;bottom:24px;right:24px;z-index:99998;width:36px;height:36px;' +
    'border-radius:50%;background:#18181f;border:1px solid #222228;color:#5a5a68;' +
    'font-size:15px;line-height:36px;text-align:center;cursor:pointer;' +
    'opacity:0;transform:translateY(8px);transition:opacity .2s,transform .2s;pointer-events:none;' +
    'user-select:none}',
    '#mal-mod-top.visible{opacity:1;transform:translateY(0);pointer-events:auto}',
    '#mal-mod-top:hover{background:#1f1f28;color:#e8e8ec;border-color:#5b8def}',

    /* Hover preview panel */
    '#mal-mod-preview{position:fixed;z-index:999999;background:#13131a;' +
    'border:1px solid #222228;border-radius:14px;' +
    'box-shadow:0 16px 48px rgba(0,0,0,.65);padding:16px;width:300px;max-height:420px;' +
    'overflow:hidden;opacity:0;transform:translateY(6px) scale(.97);' +
    'transition:opacity .12s,transform .12s;pointer-events:none;' +
    'font-family:"DM Sans",-apple-system,sans-serif}',
    '#mal-mod-preview.visible{opacity:1;transform:translateY(0) scale(1)}',
    '#mal-mod-preview .pvt{display:flex;gap:12px;margin-bottom:10px}',
    '#mal-mod-preview .pvc{width:76px;min-width:76px;height:108px;border-radius:8px;' +
    'background-size:cover;background-position:center;background-color:#1f1f28}',
    '#mal-mod-preview .pvn{font-size:14px;font-weight:700;color:#e8e8ec;line-height:1.3;' +
    'margin-bottom:5px;overflow:hidden;text-overflow:ellipsis;' +
    'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
    '#mal-mod-preview .pvi{font-size:12px;color:#9494a0;line-height:1.5}',
    '#mal-mod-preview .pvs{display:inline-block;font-size:11px;font-weight:700;' +
    'padding:2px 7px;border-radius:4px;margin-top:5px;color:#fff}',
    '#mal-mod-preview .pvd{font-size:12px;color:#9494a0;line-height:1.55;margin-top:8px;' +
    'overflow:hidden;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical}',
    '#mal-mod-preview .pvdiv{width:100%;height:1px;background:#222228;margin:10px 0}',

    /* Keyboard focus ring */
    '.mal-kb-focus{outline:2px solid #5b8def!important;outline-offset:2px!important;border-radius:12px!important}'
  ].join('\n');
  document.head.appendChild(css);

  // ── Utility ──────────────────────────────────────────────────────────────
  function findWidget(container, keywords) {
    var widgets = container.querySelectorAll('.widget');
    for (var i = 0; i < widgets.length; i++) {
      var hdr = widgets[i].querySelector('.widget-header, h2');
      if (!hdr) continue;
      var txt = hdr.textContent.trim().toLowerCase();
      for (var k = 0; k < keywords.length; k++) {
        if (txt.indexOf(keywords[k]) !== -1) return widgets[i];
      }
    }
    return null;
  }

  // ── Homepage ─────────────────────────────────────────────────────────────
  var isHome = /^\/?$/.test(window.location.pathname);

  if (isHome) {
    // Run a bit after DOMContentLoaded so widgets are rendered
    setTimeout(function () {
      var content = document.querySelector('#content');
      if (!content) return;

      // Full-width left column; hide right-column siblings
      var left = content.querySelector('.left-column');
      if (left) {
        left.style.cssText += 'float:none!important;width:100%!important;max-width:100%!important;';
        Array.from(left.parentElement.children).forEach(function (sib) {
          if (sib === left || /^(script|style|br)$/i.test(sib.tagName)) return;
          sib.style.display = 'none';
        });
      }

      // Hide clutter
      if (FEATURES.hideClutter) {
        [
          '.widget.mxj',
          '[class*="bookstores-recommend-plugin"]',
          '[class*="PDA"]',
          '.mini-banner',
          '.header-bnr',
          '[class*="ad-unit"]'
        ].forEach(function (sel) {
          document.querySelectorAll(sel).forEach(function (el) { el.style.display = 'none'; });
        });
      }

      // Move news widget to top
      if (FEATURES.newsFirst) {
        var nc = left || content;
        var nw = findWidget(nc, ['anime & manga news', 'news']);

        if (nw) {
          // Hide original widget-header — use setAttribute so it wins over stylus
          var origHdr = nw.querySelector('.widget-header');
          if (origHdr) {
            origHdr.setAttribute('style', 'display:none!important');
          }

          // Build our replacement header
          var hdr = document.createElement('div');
          hdr.id = 'mal-mod-news-hdr';
          hdr.innerHTML = '<span>Latest News</span><a href="/news">View All →</a>';

          // Find first real content child to insert before
          var insertBefore = null;
          for (var i = 0; i < nc.children.length; i++) {
            var c = nc.children[i];
            if (
              c !== nw &&
              c.offsetHeight > 0 &&
              c.style.display !== 'none' &&
              !c.classList.contains('h1') &&
              !/^(script|style|br)$/i.test(c.tagName)
            ) {
              insertBefore = c;
              break;
            }
          }

          if (insertBefore) {
            nc.insertBefore(nw, insertBefore);
            nc.insertBefore(hdr, nw);
          } else {
            nc.prepend(hdr);
            hdr.after(nw);
          }

          console.log('[MAL Modern] ✓ News moved to top');
        }
      }
    }, 600);
  }

  // ── Hover Preview ─────────────────────────────────────────────────────────
  if (FEATURES.hoverPreview) {
    var pv = document.createElement('div');
    pv.id = 'mal-mod-preview';
    document.body.appendChild(pv);

    var pvTimer = null;
    var pvActive = null;
    var pvCache = {};

    document.addEventListener('mouseover', function (e) {
      var a = e.target.closest('a[href*="/anime/"], a[href*="/manga/"]');
      if (!a) return;
      var m = a.getAttribute('href').match(/\/(anime|manga)\/(\d+)/);
      if (!m) return;
      var id = m[1] + '/' + m[2];
      if (id === pvActive) return;

      clearTimeout(pvTimer);
      var cx = e.clientX, cy = e.clientY;

      pvTimer = setTimeout(function () {
        pvActive = id;
        if (pvCache[id]) { showPV(pvCache[id], cx, cy); return; }
        fetch('https://api.jikan.moe/v4/' + id)
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (j.data) {
              pvCache[id] = j.data;
              if (pvActive === id) showPV(j.data, cx, cy);
            }
          })
          .catch(function () { });
      }, 380);
    });

    document.addEventListener('mouseout', function (e) {
      if (e.target.closest('a[href*="/anime/"], a[href*="/manga/"]')) {
        clearTimeout(pvTimer);
        pv.classList.remove('visible');
        pvActive = null;
      }
    });

    function showPV(d, x, y) {
      var h = '<div class="pvt">';
      var img = d.images && d.images.jpg && (d.images.jpg.large_image_url || d.images.jpg.image_url);
      if (img) h += '<div class="pvc" style="background-image:url(' + img + ')"></div>';
      h += '<div style="flex:1;min-width:0">';
      h += '<div class="pvn">' + (d.title || '') + '</div>';
      var meta = [];
      if (d.type) meta.push(d.type);
      if (d.episodes) meta.push(d.episodes + ' eps');
      if (d.year) meta.push(d.year);
      if (d.status) meta.push(d.status);
      h += '<div class="pvi">' + meta.filter(Boolean).join(' · ') + '</div>';
      if (d.score) {
        var sc = d.score;
        var col = sc >= 8 ? '#4cc764' : sc >= 7 ? '#5b8def' : sc >= 5 ? '#e8a735' : '#ef5350';
        h += '<span class="pvs" style="background:' + col + '">★ ' + sc + '</span>';
      }
      h += '</div></div>';
      if (d.synopsis) h += '<div class="pvdiv"></div><div class="pvd">' + d.synopsis + '</div>';
      pv.innerHTML = h;

      var l = x + 18, t = y + 8;
      if (l + 320 > window.innerWidth) l = x - 318;
      if (t + 440 > window.innerHeight) t = window.innerHeight - 445;
      if (t < 8) t = 8;
      pv.style.left = l + 'px';
      pv.style.top = t + 'px';
      pv.classList.add('visible');
    }
  }

  // ── Reading Progress ──────────────────────────────────────────────────────
  if (FEATURES.readingProgress) {
    var bar = document.createElement('div');
    bar.id = 'mal-mod-progress';
    document.body.appendChild(bar);
    window.addEventListener('scroll', function () {
      var s = window.scrollY;
      var d = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = (d > 0 ? Math.min((s / d) * 100, 100) : 0) + '%';
    }, { passive: true });
  }

  // ── Back to Top ───────────────────────────────────────────────────────────
  if (FEATURES.backToTop) {
    var tb = document.createElement('div');
    tb.id = 'mal-mod-top';
    tb.textContent = '↑';
    document.body.appendChild(tb);
    window.addEventListener('scroll', function () {
      tb.classList.toggle('visible', window.scrollY > 400);
    }, { passive: true });
    tb.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ── Keyboard Nav ──────────────────────────────────────────────────────────
  if (FEATURES.keyboardNav) {
    var ki = [], kx = -1;

    function refreshItems() {
      ki = Array.from(document.querySelectorAll(
        '.btn-anime, .news-unit, .ranking-list, .seasonal-anime, .list-table-data, .item'
      ));
    }

    function focusItem(n) {
      var prev = document.querySelector('.mal-kb-focus');
      if (prev) prev.classList.remove('mal-kb-focus');
      if (n < 0 || n >= ki.length) { kx = -1; return; }
      kx = n;
      ki[n].classList.add('mal-kb-focus');
      ki[n].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    document.addEventListener('keydown', function (e) {
      var tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      switch (e.key) {
        case 'j':
          refreshItems();
          focusItem(Math.min(kx + 1, ki.length - 1));
          e.preventDefault();
          break;
        case 'k':
          refreshItems();
          focusItem(Math.max(kx - 1, 0));
          e.preventDefault();
          break;
        case '/': {
          var s = document.querySelector('#topSearchText, #topSearchValue');
          if (s) { s.focus(); e.preventDefault(); }
          break;
        }
        case 'g':
          if (!e.shiftKey) { window.scrollTo({ top: 0, behavior: 'smooth' }); e.preventDefault(); }
          break;
        case 'G':
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
          e.preventDefault();
          break;
        case 'Enter':
          if (kx >= 0 && ki[kx]) {
            var a = ki[kx].querySelector('a');
            if (a) a.click();
          }
          break;
        case 'Escape': {
          var f = document.querySelector('.mal-kb-focus');
          if (f) { f.classList.remove('mal-kb-focus'); kx = -1; }
          break;
        }
      }
    });
  }

  console.log('[MAL Modern] ✓ v5.0 loaded');
})();