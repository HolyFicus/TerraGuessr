# TerraSpotter

Географическая игра в стиле GeoGuessr на гибридном стеке — полностью статическое приложение без собственного бэкенда, готовое к бесплатной публикации на **GitHub Pages**, **Vercel**, **Netlify** или **Cloudflare Pages**.

## Возможности

- **Гибридный стек с экономией квоты**:
  - 360°-панорамы через **Google Street View** (`StreetViewPanorama` + `StreetViewService`, лимит до 10 попыток + проверенная база точек по 21 региону/стране, переиспользование одного экземпляра панорамы).
  - Бесплатная интерактивная карта угадывания и карта результатов на **Leaflet** (**OpenStreetMap** + **Esri World Imagery** с подписями границ).
  - Расчёт дистанции по формуле Хаверсина на чистом JS и очки `5000 * exp(-distanceKm / 2000)` (`< 50 м` = `5000`).
- **Режимы игры**:
  - Одиночный (Solo), вдвоём на одном устройстве (Hotseat), онлайн-комната по коду приглашения (WebRTC P2P через PeerJS).
  - Ограничения: **Moving**, **No Move**, **NMPZ**, компас, кнопка возврата на старт, опциональный таймер.
- **Адаптивность**: десктоп, портретный и альбомный режимы на телефонах.
- **Статистика**: сохраняется локально в `localStorage`.

---

## Быстрая публикация на GitHub Pages (бесплатно)

В проекте уже настроен автоматический деплой через GitHub Actions (`.github/workflows/deploy.yml`) и относительные пути (`base: './'`).

1. Создайте новый репозиторий на [GitHub](https://github.com/new) (например, `terraspotter`).
2. Загрузите файлы проекта в ветку `main`.
3. В репозитории откройте **Settings → Pages**.
4. В разделе **Build and deployment → Source** выберите **GitHub Actions**.
5. *(Опционально — для живых панорам Google Street View)*:
   - Откройте **Settings → Secrets and variables → Actions → New repository secret**.
   - Имя: `VITE_GOOGLE_MAPS_API_KEY`, значение: ваш ключ Google Maps JavaScript API.
   - В [Google Cloud Console](https://console.cloud.google.com/apis/credentials) **обязательно** ограничьте ключ по **HTTP Referrer**:
     - `https://<ваш-логин>.github.io/*`
6. Перейдите во вкладку **Actions** и дождитесь зелёной галочки у workflow **Deploy TerraSpotter to GitHub Pages**.
7. Сайт откроется по адресу `https://<ваш-логин>.github.io/<имя-репозитория>/`.

---

## Альтернативные хостинги с подключением GitHub

Репозиторий также готов к деплою в 1 клик на:

- **Vercel** (`vercel.json` уже добавлен): импортируйте репозиторий → при желании добавьте `VITE_GOOGLE_MAPS_API_KEY` в Environment Variables → **Deploy**.
- **Netlify** (`netlify.toml` и `public/_redirects` уже добавлены): Import from Git → Deploy.
- **Cloudflare Pages** (`public/_redirects` и `public/_headers` уже добавлены): Build command `npm run build`, Output directory `dist`.

---

## Локальный запуск

```bash
npm install
npm run dev
```

Проверка типов, тестов и сборка:

```bash
npm run lint
npm test
npm run build
```
