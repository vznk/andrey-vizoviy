(function () {
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  // Липка панель з'являється, коли основні кнопки (data-dock-anchor) пішли з екрана
  var dock = document.getElementById('dock');
  var links = document.querySelector('[data-dock-anchor]');
  if ('IntersectionObserver' in window && dock && links) {
    new IntersectionObserver(function (entries) {
      dock.classList.toggle('is-visible', !entries[0].isIntersecting && entries[0].boundingClientRect.top < 0);
    }).observe(links);
  }

  // Аналітика: кожне натискання на кнопку чи посилання — окрема подія в Google Analytics
  //   phone_call      — дзвінки
  //   viber_chat_click  — особистий чат у Viber
  //   viber_group_click — група у Viber
  //   telegram_click  — Telegram-канал
  //   instagram_click — Instagram (account: основний чи резервний)
  //   review_click    — «Залишити відгук у Google»
  //   button_click    — усе інше (меню, фото, перегляд галереї)
  function sectionOf(el) {
    if (el.closest('#dock')) return 'dock';
    if (el.closest('.topbar')) return 'header';
    if (el.closest('#lightbox')) return 'lightbox';
    if (el.closest('#tg-popup')) return 'tg_popup';
    if (el.closest('.footer')) return 'footer';
    var s = el.closest('section');
    return (s && (s.id || s.className.split(' ')[0])) || 'page';
  }

  function labelOf(el) {
    var main = el.querySelector('b'); // у кнопках-картках головний рядок у <b>, підпис у <small>
    var text = (el.getAttribute('aria-label') || (main || el).textContent || '').replace(/\s+/g, ' ').trim();
    if (!text) {
      var img = el.querySelector('img');
      text = img ? img.alt : '';
    }
    return text.slice(0, 100);
  }

  document.addEventListener('click', function (e) {
    if (typeof window.gtag !== 'function' || !e.target.closest) return;
    var el = e.target.closest('a[href], button');
    if (!el) return;

    var section = sectionOf(el);
    var label = labelOf(el);
    var href = el.tagName === 'A' ? el.getAttribute('href') : '';

    if (href.indexOf('tel:') === 0) {
      gtag('event', 'phone_call', { section: section, button_text: label });
      return;
    }

    if (href.indexOf('viber://') === 0) {
      gtag('event', 'viber_chat_click', { section: section, button_text: label });
      return;
    }

    if (href.indexOf('invite.viber.com') > -1) {
      gtag('event', 'viber_group_click', { section: section, button_text: label });
      return;
    }

    if (href.indexOf('t.me') > -1) {
      gtag('event', 'telegram_click', { section: section, button_text: label });
      return;
    }

    if (href.indexOf('instagram.com') > -1) {
      gtag('event', 'instagram_click', { account: href.split('instagram.com/')[1].replace(/[/?].*$/, ''), section: section, button_text: label });
      return;
    }

    if (href.indexOf('writereview') > -1) {
      gtag('event', 'review_click', { section: section });
      return;
    }

    var params = { section: section, button_text: label };
    var gallery = el.closest('[data-gallery]');
    if (gallery) {
      params.gallery = gallery.getAttribute('data-gallery');
      params.photo_number = Array.prototype.indexOf.call(gallery.querySelectorAll('.thumb'), el) + 1;
    }
    if (href) params.link_url = href;
    gtag('event', 'button_click', params);
  });

  // Підказка «гортайте» під горизонтальними стрічками: смужка прогресу + легке похитування,
  // коли стрічка вперше з'являється на екрані. Якщо гортати нічого (ПК) — підказка схована.
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Запускаємо, коли браузер звільниться після показу сторінки — вимірювання ширини стрічок
  // не повинно гальмувати першу відмальовку на слабких телефонах
  function initScrollHints() {
    document.querySelectorAll('[data-scroll-hint]').forEach(function (strip) {
      var hint = document.createElement('div');
      hint.className = 'scroll-hint';
      hint.setAttribute('aria-hidden', 'true');
      hint.innerHTML = '<span class="scroll-hint__label">Гортайте</span><span class="scroll-hint__track"><span class="scroll-hint__thumb"></span></span>';
      strip.insertAdjacentElement('afterend', hint);
      var thumb = hint.querySelector('.scroll-hint__thumb');

      function update() {
        var max = strip.scrollWidth - strip.clientWidth;
        hint.hidden = max < 8;
        if (hint.hidden) return;
        var ratio = strip.clientWidth / strip.scrollWidth;
        thumb.style.width = (ratio * 100) + '%';
        thumb.style.transform = 'translateX(' + (strip.scrollLeft / max) * ((1 - ratio) / ratio) * 100 + '%)';
        if (strip.scrollLeft > 20) hint.classList.add('is-done');
      }
      strip.addEventListener('scroll', update, { passive: true });
      if ('ResizeObserver' in window) new ResizeObserver(update).observe(strip);
      else window.addEventListener('resize', update);
      strip.querySelectorAll('img').forEach(function (img) { img.addEventListener('load', update); });
      update();

      if (!reduceMotion && 'IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
          if (!entries[0].isIntersecting) return;
          io.disconnect();
          if (hint.hidden || strip.scrollLeft > 0) return;
          setTimeout(function () {
            strip.scrollBy({ left: 70, behavior: 'smooth' });
            setTimeout(function () { strip.scrollBy({ left: -70, behavior: 'smooth' }); }, 550);
          }, 300);
        }, { threshold: 0.6 });
        io.observe(strip);
      }
    });
  }
  if ('requestIdleCallback' in window) window.addEventListener('load', function () { requestIdleCallback(initScrollHints, { timeout: 2000 }); });
  else window.addEventListener('load', initScrollHints);

  // Запрошення підписатися на Telegram.
  // З'являється через 15–20 с на сайті. Рішення відвідувача зберігається в cookie tg_popup:
  //   subscribed — натиснув «Підписатися» (або будь-яке посилання на Telegram) → не показуємо 180 днів
  //   closed     — закрив хрестиком / «Не зараз»                              → не показуємо 14 днів
  //   seen       — побачив і нічого не натиснув                                 → не показуємо 7 днів
  var TG_COOKIE = 'tg_popup';
  var TG_DAYS = { subscribed: 180, closed: 14, seen: 7 };
  var tgPopup = document.getElementById('tg-popup');

  function readCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  function writeCookie(name, value, days) {
    document.cookie = name + '=' + encodeURIComponent(value) + '; max-age=' + days * 86400 + '; path=/; SameSite=Lax';
  }
  function tgRemember(state) {
    var current = readCookie(TG_COOKIE);
    if (current === 'subscribed' && state !== 'subscribed') return; // «підписався» сильніше за інші стани
    writeCookie(TG_COOKIE, state, TG_DAYS[state]);
  }

  function tgHide(state) {
    if (!tgPopup || tgPopup.hidden) return;
    tgRemember(state);
    tgPopup.classList.add('is-leaving');
    setTimeout(function () { tgPopup.hidden = true; tgPopup.classList.remove('is-leaving'); }, reduceMotion ? 0 : 250);
  }

  function tgShow() {
    if (readCookie(TG_COOKIE)) return;
    // Не заважаємо, поки людина дивиться фото на весь екран — спробуємо трохи пізніше
    if (!box.hidden) { setTimeout(tgShow, 5000); return; }
    tgPopup.hidden = false;
    tgRemember('seen');
    if (typeof window.gtag === 'function') gtag('event', 'tg_popup_view');
  }

  if (tgPopup) {
    // Будь-яке натискання на посилання Telegram на сайті — вважаємо, що людина підписалась
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href*="t.me"]');
      if (!a) return;
      tgRemember('subscribed');
      if (!tgPopup.hidden) tgHide('subscribed');
    });
    tgPopup.querySelector('.tg-popup__close').addEventListener('click', function () { tgHide('closed'); });
    tgPopup.querySelector('.tg-popup__later').addEventListener('click', function () { tgHide('closed'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && box.hidden) tgHide('closed'); });

    if (!readCookie(TG_COOKIE)) setTimeout(tgShow, 15000 + Math.random() * 5000);
  }

  // Шапка стає непрозорою після початку прокрутки
  var topbar = document.getElementById('topbar');
  if (topbar) {
    var onScroll = function () { topbar.classList.toggle('is-solid', window.scrollY > 40); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Лайтбокс для галерей
  var box = document.getElementById('lightbox');
  var img = box.querySelector('.lightbox__img');
  var count = box.querySelector('.lightbox__count');
  var items = [];
  var index = 0;
  var lastFocus = null;

  function show(i) {
    index = (i + items.length) % items.length;
    img.src = items[index].src;
    img.alt = items[index].alt;
    count.textContent = (index + 1) + ' / ' + items.length;
  }

  function open(gallery, i) {
    // У стрічці — маленькі прев'ю, у перегляді — повний розмір (data-full) у тому ж форматі, що обрав браузер
    items = Array.prototype.map.call(gallery.querySelectorAll('.thumb'), function (btn) {
      var img = btn.querySelector('img');
      var shown = img.currentSrc || img.src;
      var full = btn.getAttribute('data-full');
      return { src: full ? full + (/\.webp(\?|$)/.test(shown) ? '.webp' : '.jpg') : shown, alt: img.alt };
    });
    lastFocus = document.activeElement;
    box.hidden = false;
    document.body.style.overflow = 'hidden';
    show(i);
    box.querySelector('.lightbox__close').focus();
  }

  function close() {
    box.hidden = true;
    document.body.style.overflow = '';
    img.removeAttribute('src');
    if (lastFocus) lastFocus.focus();
  }

  document.querySelectorAll('[data-gallery]').forEach(function (gallery) {
    gallery.querySelectorAll('.thumb').forEach(function (btn, i) {
      btn.addEventListener('click', function () { open(gallery, i); });
    });
  });

  box.querySelector('.lightbox__close').addEventListener('click', close);
  box.querySelector('.lightbox__nav--prev').addEventListener('click', function () { show(index - 1); });
  box.querySelector('.lightbox__nav--next').addEventListener('click', function () { show(index + 1); });
  box.addEventListener('click', function (e) { if (e.target === box) close(); });

  document.addEventListener('keydown', function (e) {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(index - 1);
    if (e.key === 'ArrowRight') show(index + 1);
  });

  // Свайп на телефоні
  var startX = null, startY = null;
  box.addEventListener('touchstart', function (e) {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });
  box.addEventListener('touchend', function (e) {
    if (startX === null) return;
    var dx = e.changedTouches[0].clientX - startX;
    var dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(index + (dx < 0 ? 1 : -1));
    else if (dy > 90) close(); // свайп вниз — закрити
    startX = null;
  });
})();
