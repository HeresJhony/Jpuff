// Supabase Edge Function: telegram-bot
// Handles Telegram Webhook and Order Processing
// -------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

// --- CONFIGURATION ---
// These should be set in Supabase Secrets using CLI: 
// supabase secrets set TELEGRAM_BOT_TOKEN=...
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ADMIN_CHAT_ID = "978181243"; // Hardcoded or via env

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- TYPES ---
interface OrderData {
    customer: {
        user_id: string;
        name: string;
        phone: string;
        address: string;
        payment: string;
        comment: string;
        username?: string;
        referrer_id?: string;
    };
    items: any[];
    total: number;
    original_total: number;
    bonuses_used: number;
    bonus_discount: number;
    promo_code?: string;
    new_user_discount?: number;
    promo_discount?: number;
}

// --- MAIN HANDLER ---
serve(async (req) => {
    // 0. HANDLE OPTIONS (CORS Preflight)
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const url = new URL(req.url);

        // 1. WEBHOOK FROM TELEGRAM / API POST
        if (req.method === "POST") {
            // Robust Body Parsing
            let body;
            const rawBody = await req.text();
            console.log("📥 Incoming Request Body:", rawBody.substring(0, 500)); // Log first 500 chars

            try {
                body = JSON.parse(rawBody);
            } catch (e) {
                console.error("Failed to parse request body:", e);
                return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // DIAGNOSTIC ACTIONS
            if (body.action === 'getWebhookInfo') {
                try {
                    const info = await telegramFetch("getWebhookInfo", {});
                    return new Response(JSON.stringify(info), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
                } catch (e: any) {
                    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
                }
            }
            if (body.action === 'setWebhook') {
                // Allow setting webhook via diagnosis tool
                // Expects body.url
                if (!body.url) return new Response(JSON.stringify({ error: "Missing url" }), { status: 400 });
                try {
                    const res = await telegramFetch("setWebhook", { url: body.url });
                    return new Response(JSON.stringify(res), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
                } catch (e: any) {
                    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
                }
            }

            // Case A: Telegram Callback Query (Button Click)
            if (body.callback_query) {
                const res = await handleCallback(body.callback_query);
                if (res instanceof Response) return res;
                return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
            }

            // Case B: New Order from Frontend OR Registration Action
            // (Frontend sends pure JSON payload)
            if (body.action === 'registerReferral') {
                const { userId, referrerId } = body;
                if (!userId || !referrerId) return new Response(JSON.stringify({ error: "Missing params" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

                // Logic to link referrer
                const res = await registerReferralLink(userId, referrerId);
                return new Response(JSON.stringify(res), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // Case B2: Simple Visit Registration (For users opening app without link)
            if (body.action === 'registerVisit') {
                const { userId } = body;
                if (!userId) return new Response(JSON.stringify({ error: "Missing userId" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

                // Logic to ensure client exists
                const res = await registerVisit(userId);
                return new Response(JSON.stringify(res), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            if (body.customer && body.items) {
                return await handleNewOrder(body as OrderData);
            }

            // Case C: Telegram Message (Commands like /start)
            if (body.message) {
                const msg = body.message;
                const chatId = msg.chat.id;
                const text = msg.text;

                if (text && text.startsWith('/start')) {
                    const welcomeText = "Добро пожаловать в наш магазин. С основными правилами можете ознакомиться на странице «Важная информация», в которую можно перейти из главной страницы меню магазина.";

                    // 1. Try to register (idempotent)
                    // If user is NEW, registerVisit sends the welcome message.
                    // If user is OLD, registerVisit does nothing and returns isNew=false.
                    const regResult = await registerVisit(String(chatId));

                    // 2. If user is OLD (already in DB), but explicitly clicked /start, 
                    // we should still send the welcome message as a response.
                    if (!regResult.isNew) {
                        await sendTelegram(chatId, welcomeText);
                    }
                }

                return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
        }

        // 2. GET REQUESTS (API)
        if (req.method === "GET") {
            const action = url.searchParams.get("action");

            // DIAGNOSTICS
            if (action === "checkWebhook") {
                const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
                const info = await res.json();
                return new Response(JSON.stringify(info), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // A. Get Orders for User
            const userId = url.searchParams.get("user_id");

            // 1. Get Orders
            if (action === "getOrders" && userId) {
                const { data } = await supabase.from("orders").select("*").eq("user_id", userId).order("created_at", { ascending: false });
                return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
            }

            // 2. Get Client Data
            if (action === "getClientData" && userId) {
                // select("*") заберет и bonus_balance, и total_earned
                const { data } = await supabase.from("clients").select("*").eq("user_id", userId).single();

                return new Response(JSON.stringify(data || {
                    bonus_balance: 0,
                    total_earned: 0, // Важно вернуть 0 по умолчанию, если клиента нет
                    bonus_orders: 0
                }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
            }

            // 3. Get Bonus History
            if (action === "getBonusHistory" && userId) {
                const { data } = await supabase.from("bonus_transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false });
                return new Response(JSON.stringify(data || []), { headers: { "Content-Type": "application/json", ...corsHeaders } });
            }

            // 4. Get Referral Stats
            if (action === "getReferralStats" && userId) {
                // Total Referrals
                const { count: total, error: errTotal } = await supabase
                    .from("clients")
                    .select("*", { count: 'exact', head: true })
                    .eq("referrer_id", userId);

                // Active Referrals (Purchased in last 30 days)
                // We need to find users who have referrer_id = userId AND have an order in last 30 days.
                // Step 1: Get IDs of referrals
                const { data: refs } = await supabase.from("clients").select("user_id").eq("referrer_id", userId);
                let activeCount = 0;

                if (refs && refs.length > 0) {
                    const refIds = refs.map(r => r.user_id);
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

                    // Step 2: Check orders for these IDs
                    // We select distinct user_id from orders where created_at > 30 days ago and user_id is in refIds
                    const { data: activeOrders } = await supabase
                        .from("orders")
                        .select("user_id")
                        .in("user_id", refIds)
                        .gte("created_at", thirtyDaysAgo.toISOString());

                    if (activeOrders) {
                        const uniqueActiveUsers = new Set(activeOrders.map(o => o.user_id));
                        activeCount = uniqueActiveUsers.size;
                    }
                }

                // Fetch referral clicks for the referrer (userId)
                const { data: referrerClient, error: referrerError } = await supabase
                    .from("clients")
                    .select("referral_clicks")
                    .eq("user_id", userId)
                    .single();
                const totalClicks = referrerClient?.referral_clicks || 0;

                return new Response(JSON.stringify({
                    total: total || 0,
                    active: activeCount,
                    clicks: totalClicks
                }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
            }

            // 5. Get Discount Info (Promo Code)
            const code = url.searchParams.get("code");
            if (action === "getDiscount" && code) {
                const { data } = await supabase.from("discounts").select("*").eq("code", code).single();
                if (data) {
                    return new Response(JSON.stringify({
                        found: true,
                        active: data.is_active,
                        code: data.code,
                        label: data.admin_label,
                        description: data.description,
                        type: data.type,
                        value: data.value
                    }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
                } else {
                    return new Response(JSON.stringify({ found: false }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
                }
            }

            return new Response(JSON.stringify({ status: "alive", backend: "Supabase Edge Function v2" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return new Response("Not Found", { status: 404, headers: corsHeaders });

    } catch (error) {
        console.error("Critical Error:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
});

// --- ORDER LOGIC ---

// 0. Validation Helper
function validateItems(items: any[]) {
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error("Validation Error: Order must contain at least one item.");
    }
    for (const item of items) {
        if (!item.id) throw new Error("Validation Error: Item missing ID");
        if (!item.name) throw new Error("Validation Error: Item missing Name");
        if (typeof item.price !== 'number' || item.price < 0) throw new Error("Validation Error: Item price must be non-negative number");
        if (typeof item.quantity !== 'number' || item.quantity <= 0) throw new Error("Validation Error: Item quantity must be positive number");
    }
}

async function handleNewOrder(order: OrderData) {
    // 0. Валидация входных данных
    validateItems(order.items);
    if (typeof order.total !== 'number' || order.total < 0) throw new Error("Validation Error: Total cannot be negative");

    // 1. Проверка наличия товаров и расчет реальной цены
    let recalculatedTotal = 0;
    const validatedItems = [];

    for (const item of order.items) {
        // Получаем реальные данные о товаре из БД
        const { data: product, error } = await supabase
            .from("Products")
            .select("id, model_name, brand, taste, price, stock")
            .eq("id", item.id)
            .single();

        if (error || !product) throw new Error(`Ошибка: Товар "${item.name}" не найден.`);

        // Проверяем сток
        if (item.quantity > (Number(product.stock) || 0)) {
            throw new Error(`Недостаточно товара: ${product.brand} ${product.model_name}.`);
        }

        const realPrice = Number(product.price);
        recalculatedTotal += realPrice * item.quantity;

        validatedItems.push({
            ...item,
            price: realPrice,
            name: `${product.brand} ${product.model_name} ${product.taste ? '- ' + product.taste : ''}`
        });
    }
    order.items = validatedItems;

    // 2. Расчет итоговой суммы (База - Скидки)
    const totalDiscounts = (order.bonus_discount || 0) + (order.new_user_discount || 0) + (order.promo_discount || 0);
    const expectedTotal = recalculatedTotal - totalDiscounts;

    // Допускаем погрешность в 1 рубль
    if (Math.abs(order.total - expectedTotal) > 1) {
        throw new Error(`Ошибка цены. Ожидалось: ${expectedTotal}, пришло: ${order.total}`);
    }
    order.total = expectedTotal;

    // 3. Строгая проверка баланса (если тратят баллы)
    const userId = order.customer.user_id || 'UNKNOWN';
    if (userId !== 'UNKNOWN' && order.bonuses_used > 0) {
        const { data: client } = await supabase.from("clients").select("bonus_balance").eq("user_id", userId).single();
        const balance = client ? (Number(client.bonus_balance) || 0) : 0;

        if (order.bonuses_used > balance) {
            throw new Error(`Недостаточно бонусов. Доступно: ${balance}, вы хотите списать: ${order.bonuses_used}`);
        }
    }

    // 4. Регистрация/Обновление клиента (Без начисления денег!)
    const clientStats = await checkAndRegisterClient(order.customer);

    // 5. Создание заказа в БД
    const dbPayload = {
        user_id: clientStats.userId,
        customer_name: order.customer.name,
        customer_phone: order.customer.phone,
        customer_address: order.customer.address,
        customer_payment: order.customer.payment,
        customer_comment: order.customer.comment,
        items: order.items,
        total: order.total,
        bonuses_used: order.bonuses_used || 0,
        status: "Новый"
    };

    // Пытаемся добавить промкод, если поле есть (опционально)
    // if (order.promo_code) dbPayload.promo_code = order.promo_code;

    const { data: orderRow, error: orderError } = await supabase.from("orders").insert(dbPayload).select("id").single();

    if (orderError) throw new Error("DB Error (Create Order): " + orderError.message);
    const orderId = orderRow.id;

    // 6. Обновление остатков товаров (Списание стока)
    for (const item of order.items) {
        const { data: prod } = await supabase.from("Products").select("stock").eq("id", item.id).single();
        if (prod) {
            const newStock = Math.max(0, Number(prod.stock) - Number(item.quantity));
            await supabase.from("Products").update({ stock: newStock }).eq("id", item.id);
        }
    }

    // 7. Списание потраченных бонусов (Уменьшаем баланс сразу)
    if (order.bonuses_used > 0) {
        const { data: c } = await supabase.from("clients").select("bonus_balance").eq("user_id", clientStats.userId).single();
        if (c) {
            const newBal = Math.max(0, (Number(c.bonus_balance) || 0) - order.bonuses_used);
            await supabase.from("clients").update({ bonus_balance: newBal }).eq("user_id", clientStats.userId);
            await logBonus(clientStats.userId, -order.bonuses_used, `Оплата заказа #${orderId}`);
        }
    }

    // 8. Уведомления (Админ + Клиент)
    // Админу
    const discountLabel = order.promo_code ? `Promo: ${order.promo_code}` : "";
    const adminMsg = formatTelegramMessage(order, orderId, clientStats, discountLabel);

    const inline_keyboard = [
        [
            { text: "✅ Выдано", callback_data: `confirm_${orderId}` },
            { text: "❌ Отмена", callback_data: `cancel_${orderId}` }
        ]
    ];
    // Кнопка связи
    if (order.customer.username) {
        inline_keyboard.unshift([{ text: "💬 Связаться", url: `https://t.me/${order.customer.username}` }]);
    } else if (order.customer.user_id && !String(order.customer.user_id).startsWith('web_')) {
        inline_keyboard.unshift([{ text: "👤 Профиль", url: `tg://user?id=${order.customer.user_id}` }]);
    }

    await sendTelegram(ADMIN_CHAT_ID, adminMsg, { inline_keyboard });

    // Клиенту
    if (!String(order.customer.user_id).startsWith('web_')) {
        await sendTelegram(order.customer.user_id, formatClientMessage(order));
    }

    return new Response(JSON.stringify({ status: "success", orderId: orderId }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
}

// --- TELEGRAM CALLBACK LOGIC ---

// [handleCallback moved to bottom]

async function checkAndRegisterClient(customer: any) {
    const userId = String(customer.user_id);

    // 1. Ищем клиента или создаем нового
    let { data: existing } = await supabase.from("clients").select("*").eq("user_id", userId).single();
    let isNew = false;

    if (!existing) {
        isNew = true;
        // Создаем запись. total_earned по умолчанию 0 (из базы)
        await supabase.from("clients").insert({
            user_id: userId,
            name: customer.name || "Гость",
            bonus_balance: 0,
            total_orders: 0,
            referrer_id: null
        });

        const { data: fresh } = await supabase.from("clients").select("*").eq("user_id", userId).single();
        existing = fresh;
    } else {
        // Обновляем имя и телефон
        await supabase.from("clients").update({
            name: customer.name,
            phone: customer.phone
        }).eq("id", existing.id);
    }

    // 2. Привязка реферала (Если есть, и еще не привязан)
    let referrerId = existing.referrer_id || customer.referrer_id || null;
    if (referrerId === userId) referrerId = null; // Нельзя пригласить самого себя

    if (referrerId && !existing.referrer_id) {
        await supabase.from("clients").update({ referrer_id: referrerId }).eq("id", existing.id);
    }

    return {
        userId,
        isNew: isNew,
        referrerId,
        bonus_balance: existing.bonus_balance || 0
    };
}


async function registerReferralLink(userId: string, referrerId: string) {
    if (userId === referrerId) return { success: false, message: "Self referral" };

    // 1. Check if user already exists
    const { data: existing } = await supabase.from("clients").select("*").eq("user_id", userId).single();

    // If user exists:
    if (existing) {
        // RULE: Attribute to Last Click BEFORE First Order.
        // If they have NO orders yet, we allow changing the referrer.
        const ordersCount = existing.total_orders || 0;

        if (ordersCount === 0) {
            // Allow overwrite!
            // ... (Referrer update logic) ...

            // Check if it's the same referrer to avoid redundant updates
            if (existing.referrer_id !== referrerId) {
                await supabase.from("clients").update({ referrer_id: referrerId }).eq("user_id", userId);

                // Also create ghost referrer if needed
                {
                    const { data: ref } = await supabase.from("clients").select("bonus_balance").eq("user_id", referrerId).single();
                    if (!ref) {
                        await supabase.from("clients").insert({ user_id: referrerId, name: "Пригласивший (Авто)", bonus_balance: 0 });
                    }
                    // Increment clicks for NEW referrer
                    const { data: cData } = await supabase.from("clients").select("referral_clicks").eq("user_id", referrerId).single();
                    const currentClicks = cData?.referral_clicks || 0;
                    await supabase.from("clients").update({ referral_clicks: currentClicks + 1 }).eq("user_id", referrerId);
                }

                return { success: true, message: "Referrer updated (Last Click)" };
            } else {
                // Even if same referrer, maybe increment clicks? 
                // Usually duplicate clicks from same user don't count unique clicks, but let's count them as "interactions"
                const { data: cData } = await supabase.from("clients").select("referral_clicks").eq("user_id", referrerId).single();
                const currentClicks = cData?.referral_clicks || 0;
                await supabase.from("clients").update({ referral_clicks: currentClicks + 1 }).eq("user_id", referrerId);

                return { success: true, message: "Click tracked" };
            }
        }

        // If they HAVE orders, they are locked.
        return { success: false, message: "User already has orders, referrer locked" };
    }

    // 2. Register "Pre-client" with referrer
    // We create the record now so that when order comes, we know who invited them.

    // Verify referrer exists or create ghost
    const { data: ref } = await supabase.from("clients").select("bonus_balance").eq("user_id", referrerId).single();
    let refBalance = 0;

    if (ref) {
        refBalance = ref.bonus_balance || 0;
    } else {
        // Ghost
        await supabase.from("clients").insert({ user_id: referrerId, name: "Пригласивший (Авто)", bonus_balance: 0 });
        refBalance = 0;
    }

    // INCREMENT CLICKS (Since someone followed the link)
    // We increment it using our rpc helper or just direct update
    // Since we don't have atomic Increment, we read-update (low concurrency risk for MVP)
    // Actually, let's use rpcIncrementClicks if we had one, but let's do simple update for now.
    // We need to fetch current clicks first (not inefficient but works)
    {
        const { data: cData } = await supabase.from("clients").select("referral_clicks").eq("user_id", referrerId).single();
        const currentClicks = cData?.referral_clicks || 0;
        await supabase.from("clients").update({ referral_clicks: currentClicks + 1 }).eq("user_id", referrerId);
    }

    // Create the new user record explicitly with referrer
    // We don't award bonuses YET. We wait for the order.
    // BUT we need to store them.

    const { error } = await supabase.from("clients").insert({
        user_id: userId,
        name: "Гость", // Will be updated on order
        bonus_balance: 0, // Will be updated on order (Welcome Bonus)
        referrer_id: referrerId,
        total_orders: 0
    });

    if (error) return { success: false, message: error.message };

    // Send Welcome Message to the new "Guest"
    const welcomeText = "Добро пожаловать в наш магазин. С основными правилами можете ознакомиться на странице «Важная информация», в которую можно перейти из главной страницы меню магазина.";
    // Ensure we don't crash if userId is not a telegram ID (though it should be for this flow)
    const userIdStr = String(userId);
    if (!userIdStr.startsWith('web_')) {
        await sendTelegram(userIdStr, welcomeText);
    }

    // IMPORTANT: We do NOT award money here. Only on order.
    // But we secured the link.

    return { success: true, message: "Referral linked" };
}

async function registerVisit(userId: string) {
    // 1. Check if user already exists
    const { data: existing } = await supabase.from("clients").select("*").eq("user_id", userId).single();

    if (existing) {
        return { success: true, message: "User exists", isNew: false };
    }

    // 2. Create new "Guest" user (No referrer)
    const { error } = await supabase.from("clients").insert({
        user_id: userId,
        name: "Гость",
        bonus_balance: 0,
        referrer_id: null,
        total_orders: 0
    });

    if (error) return { success: false, message: error.message };

    // 3. Send Welcome Message (Since they are new!)
    const welcomeText = "Добро пожаловать в наш магазин. С основными правилами можете ознакомиться на странице «Важная информация», в которую можно перейти из главной страницы меню магазина.";
    const userIdStr = String(userId);
    if (!userIdStr.startsWith('web_')) {
        await sendTelegram(userIdStr, welcomeText);
    }

    return { success: true, message: "User registered", isNew: true };
}

async function processOrderBonuses(order: OrderData, userId: string) {
    if (order.bonuses_used > 0) {
        const { data: c } = await supabase.from("clients").select("bonus_balance").eq("user_id", userId).single();
        if (c) {
            // Списываем баллы. Валидация уже прошла выше.
            // Math.max(0, ...) защита от ухода в минус
            const newBal = Math.max(0, (Number(c.bonus_balance) || 0) - order.bonuses_used);
            await supabase.from("clients").update({ bonus_balance: newBal }).eq("user_id", userId);
            await logBonus(userId, -order.bonuses_used, "Оплата заказа");
        }
    }
}

async function accrueBonuses(orderId: string) {
    const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).single();
    if (!order) return;

    const userId = order.user_id;

    // Helper to add bonuses safely
    const addBonus = async (uid: string, amount: number) => {
        const { data: c } = await supabase.from("clients").select("bonus_balance").eq("user_id", uid).single();
        if (c) {
            const newBal = (Number(c.bonus_balance) || 0) + amount;
            await supabase.from("clients").update({ bonus_balance: newBal }).eq("user_id", uid);
        }
    };

    // 1. Cashback (2%)
    const cashback = Math.floor(order.total * 0.02);
    if (cashback > 0) {
        // await rpcIncrementBonus(userId, cashback); // OLD RPC
        await addBonus(userId, cashback);
        await logBonus(userId, cashback, `Кэшбэк (Заказ #${orderId})`);
    }

    // 2. Referrer (1%)
    const { data: client } = await supabase.from("clients").select("referrer_id").eq("user_id", userId).single();
    if (client && client.referrer_id) {
        const refCashback = Math.floor(order.total * 0.01);
        if (refCashback > 0) {
            // await rpcIncrementBonus(client.referrer_id, refCashback); // OLD RPC
            await addBonus(client.referrer_id, refCashback);
            await logBonus(client.referrer_id, refCashback, `Реф. кэшбэк (Друг: ${userId})`);
        }
    }
}

async function refundBonuses(orderId: string) {
    const { data: order } = await supabase.from("orders").select("user_id, bonuses_used").eq("id", orderId).single();
    if (order && order.bonuses_used > 0) {
        await rpcIncrementBonus(order.user_id, order.bonuses_used);
        await logBonus(order.user_id, order.bonuses_used, `Возврат бонусов (Отмена #${orderId})`);
    }
}

async function rpcIncrementBonus(userId: string, amount: number) {
    // Ideally use database function, but for now fetch-update
    const { data } = await supabase.from("clients").select("bonus_balance").eq("user_id", userId).single();
    if (data) {
        await supabase.from("clients").update({ bonus_balance: (data.bonus_balance || 0) + amount }).eq("user_id", userId);
    }
}

async function logBonus(userId: string, amount: number, desc: string) {
    await supabase.from("bonus_transactions").insert({ user_id: userId, amount, description: desc });
}

async function returnStock(orderId: string) {
    const { data: order } = await supabase.from("orders").select("items").eq("id", orderId).single();
    if (order && order.items) {
        for (const item of order.items) {
            const { data: prod } = await supabase.from("Products").select("stock").eq("id", item.id).single();
            if (prod) {
                await supabase.from("Products").update({ stock: Number(prod.stock) + Number(item.quantity) }).eq("id", item.id);
            }
        }
    }
}

// --- TELEGRAM API HELPERS ---

async function sendTelegram(chatId: string, text: string, markup: any = null) {
    const body: any = { chat_id: chatId, text, parse_mode: "Markdown" };
    if (markup) body.reply_markup = markup;
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
}

async function sendMessage(chatId: string, text: string, replyTo: number) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, reply_to_message_id: replyTo })
    });
}

// --- DEBUG WRAPPER FOR TELEGRAM API ---
async function telegramFetch(method: string, body: any) {
    if (!BOT_TOKEN) throw new Error("CRITICAL: BOT_TOKEN is missing in environment variables!");

    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!data.ok) {
        console.error(`Telegram API Error (${method}):`, data.description);
        throw new Error(`Telegram API Error: ${data.description}`);
    }
    return data;
}

async function answerCallback(id: string) {
    await telegramFetch("answerCallbackQuery", { callback_query_id: id });
}

async function handleCallback(cb: any) {
    // Подтверждаем получение колбэка
    await answerCallback(cb.id);

    const data = cb.data;
    const [action, orderId] = data.split('_');
    const chatId = cb.message.chat.id;
    const msgId = cb.message.message_id;

    // Получаем заказ
    const { data: order } = await supabase.from("orders").select("*").eq("id", orderId).single();

    if (!order) return; // Если заказ удален или ошибка

    let uiText = "";

    if (action === "confirm") {
        if (order.status === "completed") {
            uiText = `✅ Заказ #${orderId} уже выдан ранее.`;
        } else {
            // 1. Ставим статус "Выполнен"
            await supabase.from("orders").update({ status: "completed" }).eq("id", orderId);

            // 2. Увеличиваем счетчик заказов клиенту
            // Сначала получаем актуальное число заказов
            const { data: client } = await supabase.from("clients").select("total_orders").eq("user_id", order.user_id).single();
            const currentOrders = (client?.total_orders || 0) + 1;

            await supabase.from("clients").update({ total_orders: currentOrders }).eq("user_id", order.user_id);

            // 3. НАЧИСЛЯЕМ БОНУСЫ И ОБНОВЛЯЕМ СТАТИСТИКУ
            await distributeRewards(order, currentOrders);

            uiText = `✅ Заказ #${orderId} успешно выдан! Бонусы начислены.`;

            // Уведомляем клиента
            if (!String(order.user_id).startsWith('web_')) {
                await sendTelegram(order.user_id, `✅ Ваш заказ #${orderId} выдан!\nВам начислен кэшбэк. Спасибо за покупку! 🤝`);
            }
        }
    } else if (action === "cancel") {
        if (order.status === "cancelled") {
            uiText = `❌ Заказ #${orderId} уже отменен.`;
        } else {
            // Отмена заказа
            await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);

            // Возврат товара на склад
            await returnStock(orderId);

            // Возврат бонусов (если клиент их тратил)
            if (order.bonuses_used > 0) {
                const { data: c } = await supabase.from("clients").select("bonus_balance").eq("user_id", order.user_id).single();
                if (c) {
                    const returnBal = (Number(c.bonus_balance) || 0) + order.bonuses_used;
                    await supabase.from("clients").update({ bonus_balance: returnBal }).eq("user_id", order.user_id);
                    await logBonus(order.user_id, order.bonuses_used, `Возврат (Отмена заказа #${orderId})`);
                }
            }

            uiText = `❌ Заказ #${orderId} отменен. Сток восстановлен.`;

            if (!String(order.user_id).startsWith('web_')) {
                await sendTelegram(order.user_id, `❌ Ваш заказ #${orderId} был отменен.`);
            }
        }
    }

    // Обновляем сообщение у админа
    if (uiText) {
        await telegramFetch('editMessageText', { chat_id: chatId, message_id: msgId, text: uiText });
    }
}

// --- ФУНКЦИЯ РАСПРЕДЕЛЕНИЯ НАГРАД (С учетом total_earned) ---
async function distributeRewards(order: any, clientTotalOrders: number) {
    const userId = order.user_id;
    const orderTotal = order.total;

    // Хелпер для добавления денег (Обновляет И баланс И статистику)
    const addMoney = async (uid: string, amount: number, desc: string) => {
        const { data: c } = await supabase
            .from("clients")
            .select("bonus_balance, total_earned") // Запрашиваем оба поля
            .eq("user_id", uid)
            .single();

        if (c) {
            const oldBalance = Number(c.bonus_balance) || 0;
            const oldTotalEarned = Number(c.total_earned) || 0; // Если null, будет 0

            const newBalance = oldBalance + amount;
            // Увеличиваем "Всего заработано" только при приходе денег (amount > 0)
            const newTotalEarned = amount > 0 ? (oldTotalEarned + amount) : oldTotalEarned;

            await supabase.from("clients").update({
                bonus_balance: newBalance,
                total_earned: newTotalEarned
            }).eq("user_id", uid);

            await logBonus(uid, amount, desc);
        }
    };

    // 1. ПРИВЕТСТВЕННЫЙ БОНУС НОВИЧКУ (+100)
    // Выдается только при успешном завершении 1-го заказа
    if (clientTotalOrders === 1) {
        // Проверка на всякий случай, чтобы не дублировать
        const { data: check } = await supabase.from("bonus_transactions")
            .select("*")
            .eq("user_id", userId)
            .eq("description", "Welcome Bonus")
            .maybeSingle();

        if (!check) {
            await addMoney(userId, 100, "Welcome Bonus");
        }
    }

    // 2. НАГРАДА РЕФЕРЕРУ (ТОМУ, КТО ПРИГЛАСИЛ)
    const { data: client } = await supabase.from("clients").select("referrer_id").eq("user_id", userId).single();

    if (client && client.referrer_id) {
        const referrerId = client.referrer_id;

        // А) Бонус за приглашение (+100) - Если это первый заказ друга
        if (clientTotalOrders === 1) {
            const { data: checkRef } = await supabase.from("bonus_transactions")
                .select("*")
                .eq("user_id", referrerId)
                .ilike("description", `%friend: ${userId}%`)
                .maybeSingle();

            if (!checkRef) {
                await addMoney(referrerId, 100, `Invite Bonus (friend: ${userId})`);
                // Уведомляем реферера
                await sendTelegram(referrerId, `🎉 Ваш друг сделал первый заказ! Вам начислено 100 бонусов.`);
            }
        }

        // Б) Вечный процент (1%)
        const commission = Math.floor(orderTotal * 0.01);
        if (commission > 0) {
            await addMoney(referrerId, commission, `1% от заказа друга (${userId})`);
        }
    }

    // 3. ЛИЧНЫЙ КЭШБЭК (2%)
    // Начисляется всегда
    const personalCashback = Math.floor(orderTotal * 0.02);
    if (personalCashback > 0) {
        await addMoney(userId, personalCashback, `Кэшбэк за заказ #${order.id}`);
    }
}

async function editMessageMarkup(chatId: number, msgId: number, markup: any) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageReplyMarkup`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, message_id: msgId, reply_markup: markup })
    });
}

// --- FORMATTING ---
function formatTelegramMessage(order: OrderData, id: number, stats: any, discountLabel: string) {
    const userDisplay = order.customer.username ? `@${order.customer.username}` : "";

    // Calculate Subtotal (Original Price) - assuming order.items have price * quantity logic available or derived
    // If we only have 'total', we might need to back-calculate or if 'items' has prices.
    // For MVP, if we don't have subtotal passed, we can try to guess or just show structure if available.
    // Let's assume order.items has { price, quantity }.

    let subtotal = 0;
    if (order.items && Array.isArray(order.items)) {
        subtotal = order.items.reduce((acc, i) => acc + (Number(i.price || 0) * Number(i.quantity || 1)), 0);
    }
    // Fallback if item prices aren't reliable/passed
    if (subtotal === 0 && order.total) subtotal = order.total; // Imperfect but fallback

    const bonusesUsed = order.bonuses_used || 0;
    // Fix: check both user discount and generic promo discount
    const newUserDiscount = order.new_user_discount || 0;
    const promoDiscount = order.promo_discount || 0;
    const totalDiscount = newUserDiscount + promoDiscount;

    // Formatting Money
    const f = (n: number) => n.toLocaleString('ru-RU');

    let financialBlock = `💰 *Итого: ${f(order.total)} ₽*`;

    // Detailed Breakdown if discounts existed
    if (bonusesUsed > 0 || totalDiscount > 0) {
        financialBlock = `💵 *Сумма товаров:* ${f(subtotal)} ₽\n`;

        if (newUserDiscount > 0) {
            financialBlock += `📉 *Скидка (Новый клиент):* -${f(newUserDiscount)} ₽\n`;
        }
        if (promoDiscount > 0) {
            financialBlock += `📉 *Скидка (${order.promo_code || 'Промокод'}):* -${f(promoDiscount)} ₽\n`;
        }
        if (bonusesUsed > 0) {
            financialBlock += `💎 *Бонусы:* -${f(bonusesUsed)} ₽\n`;
        }

        financialBlock += `\n💰 *К ОПЛАТЕ: ${f(order.total)} ₽*`;
    }

    return `🎉 *НОВЫЙ ЗАКАЗ #${id}*\n` +
        `👤 *${order.customer.name}* ${userDisplay ? `(${userDisplay})` : ""}\n` +
        `📞 ${order.customer.phone}\n` +
        `📍 ${order.customer.address}\n\n` +
        `🛒 *Товары:* \n` + order.items.map(i => `- ${i.name} (${i.quantity} шт x ${i.price} ₽)`).join('\n') +
        `\n\n${financialBlock}`;
}

function formatClientMessage(order: OrderData) {
    return `✅ *Ваш заказ принят!*\n\n` +
        `Менеджер скоро свяжется с вами.\n` +
        `Сумма: ${order.total} ₽`;
}
