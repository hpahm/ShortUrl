const $ = (id) => document.getElementById(id);

// ============ I18N ============
const translations = {
  vi: {
    title: "Rút Gọn Link",
    create_title: "Tạo link ngắn",
    url_placeholder: "Dán link vào đây",
    shorten: "Rút gọn",
    processing: "Đang xử lý...",
    custom_code: "Mã tùy chỉnh (không bắt buộc)",
    custom_placeholder: "vd: k-m",
    custom_title: "3–32 ký tự: chữ, số, - và _",
    expires: "Hết hạn sau",
    never: "Không bao giờ",
    day_1: "1 ngày",
    day_7: "7 ngày",
    day_30: "30 ngày",
    year_1: "1 năm",
    your_short_link: "Link rút gọn của bạn:",
    history: "Lịch sử",
    refresh: "Làm mới",
    load_more: "Tải thêm",
    loading: "Đang tải...",
    copy_title: "Sao chép",
    qr_alt: "Mã QR của link rút gọn",
    clicks: "clicks",
    created: "Tạo lúc",
    expires_label: "Hết hạn",
    expired: "Đã hết hạn",
    copy: "Sao chép",
    qr: "QR",
    stats: "Thống kê",
    delete: "Xóa",
    download_qr: "Tải mã QR",
    qr_code: "Mã QR",
    confirm_delete: "Xóa link này? Link sẽ ngừng hoạt động ngay.",
    no_history: "Chưa có link nào được rút gọn",
    load_failed: "Không thể tải lịch sử",
    generic_error: "Có lỗi xảy ra!",
    stats_title: "lượt click trong 30 ngày qua",
    today: "Hôm nay",
  },
  en: {
    title: "Shorten Link",
    create_title: "Create short link",
    url_placeholder: "Paste your link here",
    shorten: "Shorten",
    processing: "Processing...",
    custom_code: "Custom code (optional)",
    custom_placeholder: "e.g: k-m",
    custom_title: "3-32 chars: letters, numbers, - and _",
    expires: "Expires after",
    never: "Never",
    day_1: "1 day",
    day_7: "7 days",
    day_30: "30 days",
    year_1: "1 year",
    your_short_link: "Your short link:",
    history: "History",
    refresh: "Refresh",
    load_more: "Load more",
    loading: "Loading...",
    copy_title: "Copy",
    qr_alt: "QR code of short link",
    clicks: "clicks",
    created: "Created",
    expires_label: "Expires",
    expired: "Expired",
    copy: "Copy",
    qr: "QR",
    stats: "Stats",
    delete: "Delete",
    download_qr: "Download QR",
    qr_code: "QR code",
    confirm_delete: "Delete this link? It will stop working immediately.",
    no_history: "No links shortened yet",
    load_failed: "Failed to load history",
    generic_error: "Something went wrong!",
    stats_title: "clicks in the last 30 days",
    today: "Today",
  }
};

let currentLang = localStorage.getItem("lang") || "vi";
const t = (key) => translations[currentLang][key] || key;

function setLanguage(lang) {
  currentLang = lang;
  localStorage.setItem("lang", lang);
  document.documentElement.lang = lang;

  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    if (translations[lang][key]) el.textContent = translations[lang][key];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    if (translations[lang][key]) el.placeholder = translations[lang][key];
  });
  document.querySelectorAll("[data-i18n-title]").forEach(el => {
    const key = el.dataset.i18nTitle;
    if (translations[lang][key]) el.title = translations[lang][key];
  });
  document.querySelectorAll("[data-i18n-alt]").forEach(el => {
    const key = el.dataset.i18nAlt;
    if (translations[lang][key]) el.alt = translations[lang][key];
  });

  document.querySelectorAll(".lang-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });

  loadHistory(true);
}

document.querySelectorAll(".lang-btn").forEach(btn => {
  btn.addEventListener("click", () => setLanguage(btn.dataset.lang));
});

const form = $('urlForm');
const originalUrlInput = $('originalUrl');
const customCodeInput = $('customCode');
const expiresSelect = $('expiresInDays');
const submitBtn = form.querySelector('button[type="submit"]');
const errorDiv = $('error');
const resultDiv = $('result');
const shortUrlLink = $('shortUrl');
const resultQr = $('resultQr');
const urlList = $('urlList');
const moreBtn = $('moreBtn');

const PAGE_SIZE = 20;
let loadedCount = 0;

form.addEventListener('submit', handleSubmit);
$('copyBtn').addEventListener('click', (e) => copyText(shortUrlLink.href, e.currentTarget));
$('refreshBtn').addEventListener('click', () => loadHistory(true));
moreBtn.addEventListener('click', () => loadHistory(false));
urlList.addEventListener('click', handleItemAction);

setLanguage(currentLang);

async function api(path, options) {
  const response = await fetch(path, options);
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(data?.error || t('generic_error'));
  return data;
}

async function handleSubmit(e) {
  e.preventDefault();
  errorDiv.classList.add('hidden');
  resultDiv.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.textContent = t('processing');

  try {
    const link = await api('/api/shorten', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originalUrl: originalUrlInput.value.trim(),
        customCode: customCodeInput.value.trim(),
        expiresInDays: expiresSelect.value,
      }),
    });
    shortUrlLink.href = link.shortUrl;
    shortUrlLink.textContent = link.shortUrl;
    resultQr.src = `/api/urls/${encodeURIComponent(link.urlCode)}/qr`;
    resultDiv.classList.remove('hidden');
    form.reset();
    loadHistory(true);
  } catch (err) {
    errorDiv.textContent = err.message;
    errorDiv.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = t('shorten');
  }
}

async function loadHistory(reset) {
  if (reset) loadedCount = 0;
  try {
    const { items, hasMore } = await api(`/api/urls?limit=${PAGE_SIZE}&offset=${loadedCount}`);
    const html = items.map(renderItem).join('');
    if (reset) urlList.innerHTML = html || `<p class="loading">${t('no_history')}</p>`;
    else urlList.insertAdjacentHTML('beforeend', html);
    loadedCount += items.length;
    moreBtn.classList.toggle('hidden', !hasMore);
  } catch {
    urlList.innerHTML = `<p class="loading">${t('load_failed')}</p>`;
  }
}

function renderItem(link) {
  const expired = link.expiresAt && new Date(link.expiresAt) <= new Date();
  const expiry = link.expiresAt
    ? ` · ${expired ? t('expired') : `${t('expires_label')}: ${formatDate(link.expiresAt)}`}`
    : '';
  return `
    <div class="url-item${expired ? ' expired' : ''}" data-code="${escapeHtml(link.urlCode)}">
      <div class="url-item-header">
        <a href="${escapeHtml(link.shortUrl)}" class="url-item-short" target="_blank" rel="noopener">${escapeHtml(link.shortUrl)}</a>
        <span class="url-item-clicks">${link.clicks} ${t('clicks')}</span>
      </div>
      <div class="url-item-original">${escapeHtml(link.originalUrl)}</div>
      <div class="url-item-date">${t('created')}: ${formatDate(link.createdAt)}${expiry}</div>
      <div class="url-item-actions">
        <button type="button" class="btn-small" data-action="copy">${t('copy')}</button>
        <button type="button" class="btn-small" data-action="qr">${t('qr')}</button>
        <button type="button" class="btn-small" data-action="stats">${t('stats')}</button>
        <button type="button" class="btn-small btn-danger" data-action="delete">${t('delete')}</button>
      </div>
      <div class="url-item-panel hidden"></div>
    </div>`;
}

async function handleItemAction(e) {
  const button = e.target.closest('button[data-action]');
  if (!button) return;
  const item = button.closest('.url-item');
  const code = encodeURIComponent(item.dataset.code);
  const panel = item.querySelector('.url-item-panel');
  const action = button.dataset.action;

  if (action === 'copy') {
    copyText(item.querySelector('.url-item-short').href, button);
  } else if (action === 'delete') {
    if (!confirm(t('confirm_delete'))) return;
    try {
      await api(`/api/urls/${code}`, { method: 'DELETE' });
      item.remove();
      loadedCount--;
      if (!urlList.querySelector('.url-item')) loadHistory(true);
    } catch (err) {
      alert(err.message);
    }
  } else if (panel.dataset.view === action && !panel.classList.contains('hidden')) {
    panel.classList.add('hidden');
  } else {
    panel.dataset.view = action;
    panel.classList.remove('hidden');
    if (action === 'qr') {
      panel.innerHTML = `
        <img class="qr" src="/api/urls/${code}/qr" alt="${t('qr_code')}" width="160" height="160">
        <a class="btn-small" href="/api/urls/${code}/qr" download="qr-${escapeHtml(item.dataset.code)}.svg">${t('download_qr')}</a>`;
    } else {
      panel.innerHTML = `<p class="loading">${t('loading')}</p>`;
      try {
        panel.innerHTML = renderStats(await api(`/api/urls/${code}/stats`));
      } catch (err) {
        panel.innerHTML = `<p class="loading">${escapeHtml(err.message)}</p>`;
      }
    }
  }
}

function renderStats({ daily }) {
  const total = daily.reduce((sum, d) => sum + d.clicks, 0);
  const max = Math.max(1, ...daily.map((d) => d.clicks));
  const bars = daily
    .map((d) => `<div class="bar" style="height:${(d.clicks / max) * 100}%" title="${d.day}: ${d.clicks} ${t('clicks')}"></div>`)
    .join('');
  return `
    <p class="stats-title">${total} ${t('stats_title')}</p>
    <div class="stats-chart">${bars}</div>
    <div class="stats-axis"><span>${daily[0]?.day || ''}</span><span>${t('today')}</span></div>`;
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const label = button.textContent;
    button.textContent = '✓';
    setTimeout(() => (button.textContent = label), 1500);
  } catch {
    prompt('Sao chép link:', text);
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function formatDate(value) {
  const d = new Date(value);
  if (currentLang === 'en') {
    return d.toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}