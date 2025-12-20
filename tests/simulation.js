
// =========================================================
// MOCKED ENVIRONMENT (Эмуляция Google Apps Script)
// =========================================================
const Logger = {
    log: (msg) => console.log(`[LOG]: ${msg}`)
};

// Имитация базы данных
let MOCK_DB = {
    clients: {
        'user_1': { bonus_balance: 50, is_new: false }, // Мало бонусов
        'user_2': { bonus_balance: 500, is_new: false, referrer_id: 'ref_1' }, // Много бонусов + реферрер
        'user_hacker': { bonus_balance: 0, is_new: false } // Пытается прикинуться новичком
    },
    transactions: []
};

// Заглушка отправки ответа
function responseJSON(data) {
    return data; // Просто возвращаем объект
}

// Заглушка записи транзакции
function logBonusTransaction(userId, amount, desc) {
    MOCK_DB.transactions.push({ userId, amount, desc });
    console.log(`[DB] Transaction: User ${userId} | ${amount} | ${desc}`);
}

// Заглушка обновления базы
function simulateDbUpdate(userId, newBalance) {
    if (MOCK_DB.clients[userId]) {
        MOCK_DB.clients[userId].bonus_balance = newBalance;
        console.log(`[DB] Updated Balance for ${userId}: ${newBalance}`);
    }
}

// =========================================================
// TEST SUBJECT (Код, который мы тестируем)
// =========================================================

function test_ProcessOrder(orderData, clientStats) {
    console.log(`\n--- Testing Order for ${orderData.customer.user_id} ---`);

    // 1. ЛОГИКА ВАЛИДАЦИИ (которую мы добавили)
    if (orderData.bonuses_used > 0) {
        if ((clientStats.bonus_balance || 0) < orderData.bonuses_used) {
            return responseJSON({ status: "error", message: "Ошибка: Недостаточно бонусов для списания." });
        }
    }

    // 2. ЛОГИКА ЗАЩИТЫ "НОВИЧКА"
    if (orderData.new_user_discount > 0) {
        if (!clientStats.is_new) { // В оригинале isNewClient, адаптируем под мок
            console.log("!!! HACK ATTEMPT DETECTED !!!");
            orderData.new_user_discount = 0;
            // orderData.total пересчитывается (упростим для теста)
        }
    }

    // 3. ЛОГИКА СПИСАНИЯ И НАЧИСЛЕНИЯ (из processOrderBonuses)
    let currentBalance = clientStats.bonus_balance || 0;

    // Списание
    if (orderData.bonuses_used > 0) {
        currentBalance -= orderData.bonuses_used;
        logBonusTransaction(orderData.customer.user_id, -orderData.bonuses_used, "Списание");
    }

    // Начисление (1%)
    const cashback = Math.round(Number(orderData.total) * 0.01);
    if (cashback > 0) {
        currentBalance += cashback;
        logBonusTransaction(orderData.customer.user_id, cashback, "Кэшбэк");
    }

    simulateDbUpdate(orderData.customer.user_id, currentBalance);

    // Реферальные
    if (clientStats.referrer_id) {
        const refBonus = Math.floor(orderData.total / 1000) * 5;
        if (refBonus > 0) {
            console.log(`[DB] Referrer Bonus to ${clientStats.referrer_id}: +${refBonus}`);
        }
    }

    return { status: "success", message: "Order processed" };
}

// =========================================================
// RUNNING SCENARIOS
// =========================================================

function runTests() {
    // SCENARIO 1: Недостаточно бонусов
    // У user_1 есть 50, пытается списать 100
    const res1 = test_ProcessOrder(
        { customer: { user_id: 'user_1' }, bonuses_used: 100, total: 1000 },
        MOCK_DB.clients['user_1']
    );
    console.log("Scenario 1 (Should Fail):", res1.status === 'error' ? "PASSED ✅" : "FAILED ❌");

    // SCENARIO 2: Успешная покупка + Кэшбэк
    // У user_2 есть 500, списывает 100. Сумма 5000.
    const res2 = test_ProcessOrder(
        { customer: { user_id: 'user_2' }, bonuses_used: 100, total: 5000 },
        MOCK_DB.clients['user_2']
    );
    console.log("Scenario 2 (Should Success):", res2.status === 'success' ? "PASSED ✅" : "FAILED ❌");
    console.log("  - New Balance (Exp: 450):", MOCK_DB.clients['user_2'].bonus_balance === 450 ? "✅" : `❌ (${MOCK_DB.clients['user_2'].bonus_balance})`);
    // Было 500 - 100 (списал) + 50 (кэшбэк 1% от 5000) = 450.

    // SCENARIO 3: Хакер (Старый юзер пытается получить скидку новичка)
    const orderHacker = { customer: { user_id: 'user_hacker' }, bonuses_used: 0, total: 1000, new_user_discount: 300 };
    const res3 = test_ProcessOrder(
        orderHacker,
        MOCK_DB.clients['user_hacker']
    );
    console.log("Scenario 3 (Hack Protection):", orderHacker.new_user_discount === 0 ? "PASSED ✅" : "FAILED ❌");

}

runTests();
