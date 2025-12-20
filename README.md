# JuicyPoint MVP - Структура проекта

## 📁 Архитектура проекта

```
JuicyPoint_MVP/
│
├── 📄 HTML Pages (Корневая папка)
│   ├── index.html              # Главная страница
│   ├── catalogue.html          # Каталог товаров
│   ├── product_details.html    # Детали товара
│   ├── cart.html               # Корзина
│   ├── checkout.html           # Оформление заказа
│   ├── profile.html            # Профиль пользователя
│   ├── bonuses.html            # Статистика бонусов
│   ├── referral.html           # Реферальная программа
│   ├── orders.html             # История заказов
│   ├── my_orders.html          # Мои заказы
│   ├── promo.html              # Промо страница
│   └── info.html               # Информация
│
├── 🎨 css/                     # Все стили
│   ├── style.css               # Основные стили
│   ├── css_sidebar.css         # Боковое меню
│   ├── css_chunk_*.css         # Модульные стили компонентов
│   └── ...
│
├── 💾 js/                      # JavaScript код
│   ├── services/               # Сервисы (API, бонусы, user-id и т.д.)
│   │   ├── api.js
│   │   ├── bonus-system.js
│   │   ├── referral-handler.js
│   │   └── user-id.js
│   ├── utils/                  # Утилиты (UI helpers)
│   │   └── ui.js
│   ├── config.js               # Конфигурация (URLs, API keys)
│   ├── cart.js                 # Логика корзины
│   ├── catalogue.js            # Логика каталога
│   ├── profile.js              # Логика профиля
│   ├── bonuses.js              # Логика бонусов
│   ├── referral.js             # Логика рефералов
│   ├── orders.js               # Логика заказов
│   ├── sidebar.js              # Логика меню
│   └── my_orders.js            # История заказов
│
├── 🖼️ img/                     # Изображения
│   └── christmas-tree.png
│
├── 📚 docs/                    # Документация и backend
│   ├── Code.js                 # Google Apps Script (backend)
│   ├── supabase_schema.sql     # SQL схема базы данных
│   ├── BONUS_SYSTEM_DOCUMENTATION.md
│   └── LINK_TRACKING_INFO.md
│
├── 🧪 tests/                   # Тестовые файлы и утилиты
│   ├── add_test_bonuses.html   # Инструмент для добавления бонусов
│   ├── debug-data.js           # Дебаг скрипты
│   ├── debug-full.js
│   ├── test-order.js           # Тестирование заказов
│   ├── test-telegram.js        # Тестирование Telegram
│   └── update_paths.ps1        # Скрипт обновления путей
│
└── пароли.txt                  # Конфиденциальные данные

```

## 🚀 Как запустить

1. **Локально:**
   ```bash
   # Запустить локальный сервер (например Python)
   python -m http.server 8000
   # Или любой другой HTTP сервер
   ```

2. **Открыть в браузере:**
   ```
   http://localhost:8000
   ```

## 📦 Компоненты системы

### Frontend (Веб-приложение)
- Vanilla JavaScript (ES6 Modules)
- CSS3 с неоновыми эффектами
- Telegram Web App API

### Backend
- **Google Apps Script** (`docs/Code.js`) - обработка заказов
- **Supabase** - база данных (товары, заказы, клиенты)

### Интеграции
- Telegram Bot API - уведомления
- Supabase REST API - работа с данными

## 🔑 Ключевые файлы

| Файл | Описание |
|------|----------|
| `js/config.js` | API URLs, ключи доступа |
| `docs/Code.js` | Серверная логика обработки заказов |
| `js/services/bonus-system.js` | Система начисления бонусов |
| `js/cart.js` | Логика корзины и оформления |
| `пароли.txt` | ⚠️ Конфиденциальные данные |

## 💰 Бонусная система

- **100 бонусов** - за регистрацию по реферальной ссылке (обоим)
- **10 бонусов** - за каждые 1000₽ собственных покупок
- **5 бонусов** - за каждые 1000₽ покупок реферала
- **1 бонус = 1 рубль** при оплате

Подробнее: `docs/BONUS_SYSTEM_DOCUMENTATION.md`

## 📝 Примечания

- Все HTML страницы находятся в корне для простоты навигации
- CSS модули разделены по компонентам
- JavaScript использует ES6 модули
- Тестовые инструменты изолированы в `tests/`
