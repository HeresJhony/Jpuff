
// =================================================================
// ПОЛНАЯ СИМУЛЯЦИЯ: ОТ QR-КОДА ДО БОНУСОВ (Full Referral Cycle)
// =================================================================

// 1. MOCK (Имитация Базы Данных)
const MOCK_DB = {
    clients: {
        'USER_REF_100': {
            name: 'Пригласивший',
            bonus_balance: 50, // Начальный баланс
            is_new: false,
            total_orders: 5
        }
        // 'USER_NEW_999' - пока не существует
    },
    transactions: []
};

// --- LOGGING UTILS ---
function log(step, msg) { console.log(`[step ${step}] ${msg}`); }
function logTx(userId, amount, desc) {
    console.log(`   💰 [TRANSACTION] ${userId}: ${amount > 0 ? '+' : ''}${amount} (${desc})`);
    MOCK_DB.transactions.push({ userId, amount, desc });
}

// --- SIMULATED UTILS ---
function getClient(userId) {
    // Если клиента нет в базе, возвращаем дефолт "Новичок"
    if (!MOCK_DB.clients[userId]) return { bonus_balance: 0, is_new: true };
    return MOCK_DB.clients[userId];
}

function updateBalance(userId, amount) {
    if (!MOCK_DB.clients[userId]) return; // Эмуляция: нельзя обновить несуществующего без создания
    MOCK_DB.clients[userId].bonus_balance += amount;
}

function createClient(userId, referrerId) {
    MOCK_DB.clients[userId] = {
        name: 'Новичок',
        bonus_balance: 0,
        is_new: false, // Теперь он стал существующим
        total_orders: 0,
        referrer_id: referrerId
    };
    logTx(userId, 0, "Создан аккаунт");
}

// =================================================================
// CORE LOGIC (Логика из Code.js, адаптированная для теста)
// =================================================================

// 1. РЕГИСТРАЦИЯ ПРИ ВХОДЕ (или при первом заказе)
function logic_RegisterClient(newUserId, referrerIdFromUrl) {
    const existing = MOCK_DB.clients[newUserId];

    if (existing) {
        log("REG", `Пользователь ${newUserId} уже существует. Пропускаем.`);
        return;
    }

    log("REG", `Регистрируем НОВОГО пользователя ${newUserId}...`);

    let initialBonus = 0;
    let finalReferrer = null;

    if (referrerIdFromUrl && referrerIdFromUrl !== newUserId) {
        finalReferrer = referrerIdFromUrl;

        // 1. БОНУС НОВИЧКУ
        initialBonus = 100;

        // 2. БОНУС ПРИГЛАСИВШЕМУ
        const refData = MOCK_DB.clients[finalReferrer];
        if (refData) {
            updateBalance(finalReferrer, 100);
            logTx(finalReferrer, 100, `Бонус за приглашение друга (ID: ${newUserId})`);
        }
    }

    // Создаем клиента в базе
    createClient(newUserId, finalReferrer);

    // Начисляем стартовый бонус
    if (initialBonus > 0) {
        updateBalance(newUserId, initialBonus);
        logTx(newUserId, initialBonus, 'Приветственный бонус');
    }
}

// 2. ОБРАБОТКА ПОКУПКИ
function logic_ProcessOrder(order) {
    const userId = order.user_id;
    const client = MOCK_DB.clients[userId];

    log("ORDER", `Обработка заказа от ${userId} на сумму ${order.total} ₽`);

    // Списание бонусов (упрощено)
    if (order.bonuses_used > 0) {
        updateBalance(userId, -order.bonuses_used);
        logTx(userId, -order.bonuses_used, "Оплата заказа");
    }

    // Начисление Кэшбэка (1%)
    const cashback = Math.round(order.total * 0.01);
    if (cashback > 0) {
        updateBalance(userId, cashback);
        logTx(userId, cashback, "Кэшбэк за заказ");
    }

    // РЕФЕРАЛЬНЫЕ ОТЧИСЛЕНИЯ
    if (client.referrer_id) {
        const refId = client.referrer_id;
        const refData = MOCK_DB.clients[refId];

        if (refData) {
            // Формула: 5 бонусов за каждые 1000р
            const refBonus = Math.floor(order.total / 1000) * 5;
            if (refBonus > 0) {
                updateBalance(refId, refBonus);
                logTx(refId, refBonus, "Бонус от покупки реферала");
            }
        }
    }
}


// =================================================================
// SCENARIO EXECUTION
// =================================================================

function runFullScenario() {
    console.log("=== 🚀 STARTING FULL REFERRAL SIMULATION ===\n");

    const REFERRER_ID = 'USER_REF_100';
    const NEW_USER_ID = 'USER_NEW_999';

    console.log(`Initial State: Referrer Balance = ${MOCK_DB.clients[REFERRER_ID].bonus_balance}`);

    // STEP 1: Генерация ссылки (Frontend)
    console.log("\n--- STEP 1: Генерация QR-кода ---");
    const link = `https://t.me/Jpuffbot?start=${REFERRER_ID}`;
    console.log(`User ${REFERRER_ID} shows QR code with link: ${link}`);

    // STEP 2: Переход и Регистрация
    console.log("\n--- STEP 2: Новичок перешел по ссылке ---");
    // Эмулируем, что frontend передал ID реферера при первом заказе
    logic_RegisterClient(NEW_USER_ID, REFERRER_ID);

    // STEP 3: Покупка
    console.log("\n--- STEP 3: Новичок делает первый заказ ---");
    const order = {
        user_id: NEW_USER_ID,
        total: 5000,
        bonuses_used: 50 // Сразу тратит часть приветственного бонуса
    };
    logic_ProcessOrder(order);

    // RESULT CHECK
    console.log("\n--- 🏁 FINAL RESULTS ---");

    const referrer = MOCK_DB.clients[REFERRER_ID];
    const newUser = MOCK_DB.clients[NEW_USER_ID];

    console.log(`🧑 Referrer (${REFERRER_ID}):`);
    console.log(`   Balance: ${referrer.bonus_balance} (Expected: 50 + 100 + 25 = 175)`);
    console.log(`   Result: ${referrer.bonus_balance === 175 ? "✅ OK" : "❌ FAIL"}`);

    console.log(`👶 New User (${NEW_USER_ID}):`);
    console.log(`   Balance: ${newUser.bonus_balance} (Expected: 100 - 50 + 50 = 100)`);
    // 100 (Привет) - 50 (Потратил) + 50 (Кэшбэк 1% от 5000)
    console.log(`   Result: ${newUser.bonus_balance === 100 ? "✅ OK" : "❌ FAIL"}`);

    console.log("\n=== SIMULATION COMPLETE ===");
}

runFullScenario();
