# JuicyPoint MVP - Структура проекта

## 📁 Архитектура проекта

```
JuicyPoint_MVP/
│
├── 📄 HTML Pages (Корневая папка)
│   ├── index.html              # Главная страница (Главное меню)
│   ├── catalogue.html          # Каталог товаров (с фильтрами)
│   ├── product_details.html    # Карточка товара
│   ├── cart.html               # Корзина
│   ├── checkout.html           # Оформление заказа
│   ├── profile.html            # Профиль пользователя
│   ├── bonuses.html            # Система бонусов
│   ├── referral.html           # Реферальная программа
│   ├── my_orders.html          # История заказов
│   ├── promo.html              # Промо-акции
│   └── info.html               # Важная информация
│
├── 🎨 css/                     # Стили (Модульная структура)
│   ├── style.css               # Базовые стили и переменные
│   ├── css_sidebar.css         # Стили бокового меню
│   ├── modals.css              # Стили модальных окон
│   ├── css_chunk_*.css         # Компонентные стили:
│   │   ├── ..._profile.css     # Стили профиля
│   │   ├── ..._animations.css  # Анимации
│   │   ├── ..._cart_card.css   # Карточки корзины
│   │   └── ...                 # Другие чанки
│   └── responsive.css          # (В составе чанков)
│
├── 💾 js/                      # JavaScript (ES6 Modules)
│   ├── app.js                  # Общая инициализация
│   ├── config.js               # Конфигурация (API Endpoints)
│   │
│   ├── services/               # Бизнес-логика и API
│   │   ├── api.js              # Взаимодействие с backend (Supabase/GAS)
│   │   ├── bonus-system.js     # Логика бонусной программы
│   │   ├── referral-handler.js # Обработка реферальных ссылок
│   │   ├── user-id.js          # Идентификация пользователя (Telegram/UUID)
│   │   └── modal-loader.js     # Загрузчик модальных окон
│   │
│   ├── utils/                  # Утилиты
│   │   ├── ui.js               # UI хелперы (Toast, Alerts)
│   │   ├── cart-storage.js     # Управление LocalStorage корзины
│   │   └── filters.js          # Логика фильтрации товаров
│   │
│   ├── Logic Modules:          # Логика конкретных страниц
│   │   ├── cart.js             # Управление корзиной и checkout
│   │   ├── product-details.js  # Страница товара
│   │   ├── catalogue.js        # Логика каталога
│   │   ├── profile.js          # Логика профиля
│   │   ├── referral.js         # Логика реферальной страницы
│   │   ├── orders-page.js      # Логика истории заказов
│   │   ├── bonuses.js          # Логика страницы бонусов
│   │   └── sidebar.js          # Управление меню
│
├── 🖼️ img/                     # Ассеты
│   ├── christmas-tree.png      # Сезонные изображения
│   └── ...
│
├── 📚 docs/                    # Документация
│   ├── BONUS_SYSTEM_DOCUMENTATION.md
│   ├── LINK_TRACKING_INFO.md
│   └── supabase_schema.sql     # SQL схема БД
│
└── 🧪 tests/                   # Тесты
    ├── add_test_bonuses.html   # Инструмент начисления бонусов
    └── ...
```

## 🚀 Как запустить

1. **Локальный сервер:**
   Приложение требует работы через HTTP-сервер для поддержки ES6 модулей (CORS).
   ```bash
   python -m http.server 8000
   ```
2. **В браузере:**
   ```
   http://localhost:8000
   ```

## 📦 Стек технологий

- **Frontend:** HTML5, CSS3 (Native + Variables), JavaScript (ES6 Modules).
- **State Management:** LocalStorage / SessionStorage (корзина, кэши), Event Bus (через DOM события).
- **Backend:** Google Apps Script (Serverless функции) + Supabase (Database).
- **Integration:** Telegram Web App (TWA).

## 🔑 Ключевые модули

| Модуль | Описание |
|--------|----------|
| `js/cart.js` | "Сердце" покупок: добавление, валидация, подсчет скидок, отправка заказа. |
| `js/services/api.js` | Единая точка входа для всех запросов к серверу. |
| `js/services/bonus-system.js` | Клиентская логика расчета доступных бонусов. |
| `js/utils/filters.js` | Сложная фильтрация каталога (вкусы, бренды, цена). |

## 💰 Бонусная система

- **100 бонусов** - за регистрацию по реферальной ссылке (обоим)
- **10 бонусов** - за каждые 1000₽ собственных покупок
- **5 бонусов** - за каждые 1000₽ покупок реферала
- **1 бонус = 1 рубль** при оплате

Подробнее: `docs/BONUS_SYSTEM_DOCUMENTATION.md`
