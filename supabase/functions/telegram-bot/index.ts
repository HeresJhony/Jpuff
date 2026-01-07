// Supabase Edge Function: telegram-bot
// Полностью обновленная версия с защитой от тайм-аутов и RPC вызовами
// -------------------------------------------------------------------

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ADMIN_CHAT_ID = "978181243";

// Создаем клиент ВНУТРИ обработчика или глобально, но аккуратно
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- ОСНОВНОЙ ОБРАБОТЧИК ---
serve(async (req) => {
    // 0. CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const url = new URL(req.url);

        // 1. GET Requests (API для фронтенда)
        if (req.method === "GET") {
            return await handleGet(req, url);
        }

        // 2. POST Requests (Webhook Telegram)
        if (req.method === "POST") {
            const body = await req.json().catch(() => ({}));

            // A. Callback Query (Нажатие кнопки)
            if (body.callback_query) {
                // !!! ГЛАВНОЕ: Мгновенный ответ ОК !!!
                // Сначала отвечаем Telegram API "answerCallbackQuery"
                await answerCallback(body.callback_query.id).catch(console.error);

                // Запускаем логику. 
                // Если это "холодный старт", ожидаем выполнения.
                await handleCallback(body.callback_query);

                return new Response(JSON.stringify({ ok: true }), {
                    headers: { "Content-Type": "application/json", ...corsHeaders }
                });
            }

            // B. Обычные сообщения
            if (body.message) {
                await handleMessage(body.message);
                return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // C. API Действия (Новый заказ и т.д.)
            if (body.action === 'registerReferral') return await registerReferralLink(body);
            if (body.action === 'registerVisit') return await registerVisitWrapper(body);

            if (body.customer && body.items) {
                // Новый заказ
                return await handleNewOrder(body);
            }

            // Diagnostics
            if (body.action === 'setWebhook') {
                if (!body.url) return new Response(JSON.stringify({ error: "Missing url" }), { status: 400 });
                const res = await telegramFetch("setWebhook", { url: body.url });
                return new Response(JSON.stringify(res), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
        }

        return new Response("Not Found", { status: 404, headers: corsHeaders });

    } catch (error: any) {
        console.error("FATAL ERROR:", error);
        return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
});

// --- ЛОГИКА CALLBACK (КНОПКИ) ---
async function handleCallback(cb: any) {
    const chatId = cb.message.chat.id;
    const msgId = cb.message.message_id;
    const data = cb.data;

    if (!data || !data.includes('_')) return;

    const [action, orderId] = data.split('_');

    // 1. СРАЗУ меняем UI на "Загрузка...", чтобы убрать кнопки
    await telegramFetch('editMessageText', {
        chat_id: chatId,
        message_id: msgId,
        text: `⏳ Обрабатываю заказ #${orderId}...`,
        reply_markup: { inline_keyboard: [] }
    }).catch(e => console.error("UI Update Failed", e));

    let uiText = "";

    try {
        // 2. Вызываем мгновенную SQL-функцию
        if (action === "confirm") {
            const { data: res, error } = await supabase.rpc('confirm_order_logic', { order_id_param: orderId });

            if (error) throw error;
            if (res && !res.success) uiText = `⚠️ ${res.message}`;
            else {
                uiText = `✅ Заказ #${orderId} успешно выдан!`;
                // Уведомляем клиента тихо
                notifyClient(orderId, "confirm").catch(console.error);
            }

        } else if (action === "cancel") {
            const { data: res, error } = await supabase.rpc('cancel_order_logic', { order_id_param: orderId });

            if (error) throw error;
            if (res && !res.success) uiText = `⚠️ ${res.message}`;
            else {
                uiText = `❌ Заказ #${orderId} отменён.`;
                notifyClient(orderId, "cancel").catch(console.error);
            }
        }
    } catch (err: any) {
        console.error("Logic Error:", err);
        uiText = `⚠️ Ошибка: ${err.message}`;
    }

    // 3. Финальное сообщение админу
    if (uiText) {
        await telegramFetch('editMessageText', {
            chat_id: chatId,
            message_id: msgId,
            text: uiText,
            reply_markup: { inline_keyboard: [] }
        }).catch(console.error);
    }
}

async function notifyClient(orderId: string, type: "confirm" | "cancel") {
    // Получаем ID юзера
    const { data: order } = await supabase.from("orders").select("user_id").eq("id", orderId).single();
    if (!order || !order.user_id) return;

    // Пропускаем веб-юзеров
    if (String(order.user_id).startsWith('web_')) return;

    const text = type === "confirm"
        ? `✅ Ваш заказ #${orderId} выдан!\nВам начислен кэшбэк. Спасибо за покупку! 🤝`
        : `❌ Ваш заказ #${orderId} был отменён.`;

    await sendTelegram(order.user_id, text);
}


// --- API GET HANDLER ---
async function handleGet(req: Request, url: URL) {
    const action = url.searchParams.get("action");
    const userId = url.searchParams.get("user_id");

    if (action === "checkWebhook") {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo`);
        const info = await res.json();
        return new Response(JSON.stringify(info), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "getOrders" && userId) {
        const { data } = await supabase.from("orders").select("*").eq("user_id", userId).order("created_at", { ascending: false });
        return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (action === "getClientData" && userId) {
        const { data } = await supabase.from("clients").select("*").eq("user_id", userId).single();
        return new Response(JSON.stringify(data || { bonus_balance: 0, total_earned: 0, bonus_orders: 0 }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (action === "getBonusHistory" && userId) {
        const { data } = await supabase.from("bonus_transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false });
        // Если null, возвращаем пустой массив
        return new Response(JSON.stringify(data || []), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    if (action === "getReferralStats" && userId) {
        // 1. Clicks
        const { data: client } = await supabase.from("clients").select("referral_clicks").eq("user_id", userId).single();
        const clicks = client?.referral_clicks || 0;

        // 2. Total Referrals
        const { count: total, data: refs } = await supabase.from("clients").select("user_id", { count: 'exact' }).eq("referrer_id", userId);

        // 3. Active Referrals (Last 30 days)
        let active = 0;
        const refIds = refs?.map(r => r.user_id) || [];

        if (refIds.length > 0) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const { data: orders } = await supabase.from("orders")
                .select("user_id")
                .in("user_id", refIds)
                .gt("created_at", thirtyDaysAgo.toISOString());

            if (orders) {
                const uniqueActive = new Set(orders.map((o: any) => o.user_id));
                active = uniqueActive.size;
            }
        }

        return new Response(JSON.stringify({
            total: total || 0,
            active: active,
            clicks: clicks
        }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
    }

    // ... Другие GET методы можно добавить по необходимости, но для MVP достаточно

    // Discount Check
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

    return new Response(JSON.stringify({ status: "alive" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}


// --- API POST HELPERS (REGISTRATIONS & ORDERS) ---

async function registerVisitWrapper(body: any) {
    const { userId } = body;
    if (!userId) return new Response(JSON.stringify({ error: "Missing userId" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // 1. Check if user exists
    const { data: existing } = await supabase.from("clients").select("id").eq("user_id", userId).maybeSingle();
    let isNew = false;

    if (!existing) {
        // 2. Try to insert
        const { error: insertError } = await supabase.from("clients").insert({ user_id: userId, name: "Гость", bonus_balance: 0, total_orders: 0 });

        // 3. Only if insert SUCCEEDED, we consider them new and send the message
        // (If insert failed, e.g. due to race condition or unique violation, they are not new)
        if (!insertError) {
            isNew = true;
            // Welcome MSG
            if (!String(userId).startsWith('web_')) {
                sendTelegram(String(userId), "Добро пожаловать!").catch((e) => console.error("Welcome msg failed", e));
            }
        } else {
            console.warn("Register visit insert failed (likely duplicate):", insertError);
        }
    }
    return new Response(JSON.stringify({ success: true, isNew }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function registerReferralLink(body: any) {
    // Упрощенная логика рефералки - просто сохраняем
    const { userId, referrerId } = body;
    if (!userId || !referrerId) return new Response(JSON.stringify({ error: "Missing params" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (userId === referrerId) return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: existing } = await supabase.from("clients").select("*").eq("user_id", userId).single();

    let shouldIncrement = false;

    if (!existing) {
        // CASE 1: New User
        const { error: insertError } = await supabase.from("clients").insert({ user_id: userId, name: "Гость", bonus_balance: 0, referrer_id: referrerId, total_orders: 0 });

        if (insertError) {
            // RACE CONDITION DETECTED:
            // "registerVisit" likely created the user milliseconds ago.
            // Fallback: Treat as existing user and try to update referrer
            console.warn("Referral race condition caught:", insertError.message);

            // Re-fetch to be sure
            const { data: raceUser } = await supabase.from("clients").select("referrer_id").eq("user_id", userId).single();
            if (raceUser && !raceUser.referrer_id) {
                await supabase.from("clients").update({ referrer_id: referrerId }).eq("user_id", userId);
                shouldIncrement = true;
            }
        } else {
            shouldIncrement = true;
        }
    } else {
        // CASE 2: Existing User, but no referrer yet (and no orders yet, to be fair)
        // Relaxed rule: If referrer_id is NULL, we set it.
        if (!existing.referrer_id) {
            await supabase.from("clients").update({ referrer_id: referrerId }).eq("user_id", userId);
            shouldIncrement = true;
        }
    }

    if (shouldIncrement) {
        // Инкремент кликов рефереру
        const { data: r } = await supabase.from("clients").select("referral_clicks").eq("user_id", referrerId).single();
        if (r) await supabase.from("clients").update({ referral_clicks: (r.referral_clicks || 0) + 1 }).eq("user_id", referrerId);
        else await supabase.from("clients").insert({ user_id: referrerId, name: "Пригласивший", referral_clicks: 1 });
    }
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}


async function handleNewOrder(order: any) {
    const userId = order.customer.user_id;

    // 1. GUARANTEE CLIENT EXISTS (Upsert first)
    await supabase.from("clients").upsert(
        { user_id: userId, name: order.customer.name || "Гость", total_orders: 0, bonus_balance: 0 },
        { onConflict: 'user_id', ignoreDuplicates: true }
    );

    // 2. CHECK PRICES & STOCK (Server-Side Calculation)
    if (!order.items || order.items.length === 0) return new Response(JSON.stringify({ error: "No items" }), { headers: corsHeaders });

    let realTotal = 0;
    const finalItems = [];

    for (const item of order.items) {
        // Fetch LIVE price and stock
        const { data: p } = await supabase.from("Products").select("price, stock").eq("id", item.id).single();
        if (!p) continue;

        const price = Number(p.price);
        realTotal += price * item.quantity;

        // Use TRUSTED price
        finalItems.push({ ...item, price });

        // Update Stock
        const newStock = Math.max(0, Number(p.stock) - Number(item.quantity));
        await supabase.from("Products").update({ stock: newStock }).eq("id", item.id);
    }

    // 3. CALCULATE DISCOUNTS (Server-Side Logic)
    let runningTotal = realTotal;
    let newUserDiscount = 0;
    let promoDiscount = 0;
    let appliedPromoCode = null;

    // A. New User Discount
    // Check intent from frontend (flag or promo)
    const requestedNewUser = (order.new_user_discount > 0) || (order.promo_code === 'new_client_10');

    if (requestedNewUser) {
        // Strict Eligibility Check: Count COMPLETED orders (excluding cancelled)
        // If count is 0, they are eligible.
        const { count } = await supabase.from("orders")
            .select("id", { count: 'exact', head: true })
            .eq("user_id", userId)
            .eq("status", "completed");

        if (!count || count === 0) {
            newUserDiscount = Math.round(realTotal * 0.10);
            runningTotal -= newUserDiscount;
        }
    }

    // B. Promo Code (If not new user discount)
    if (newUserDiscount === 0 && order.promo_code && order.promo_code !== 'new_client_10') {
        const { data: promo } = await supabase.from("discounts").select("*").eq("code", order.promo_code).single();
        if (promo && promo.is_active) {
            if (promo.type === 'percent') {
                promoDiscount = Math.round(realTotal * (Number(promo.value) / 100));
            } else {
                promoDiscount = Number(promo.value);
            }
            runningTotal -= promoDiscount;
            appliedPromoCode = promo.code;
        }
    }

    // C. Bonuses (Strict Deduction)
    let bonusesUsed = 0;
    if (order.bonuses_used > 0) {
        const { data: client } = await supabase.from("clients").select("bonus_balance").eq("user_id", userId).single();
        const available = client?.bonus_balance || 0;

        // Cannot use more than available, cannot use more than total price
        // (Assuming 100% payment with bonuses is allowed, otherwise add limit here)
        bonusesUsed = Math.min(Number(order.bonuses_used), Number(available), Math.max(0, runningTotal));

        runningTotal -= bonusesUsed;
    }

    const finalTotal = Math.max(0, runningTotal);

    // 4. SAVE ORDER (Trusted Data)
    const { data: newOrder, error } = await supabase.from("orders").insert({
        user_id: userId,
        customer_name: order.customer.name,
        customer_phone: order.customer.phone,
        customer_address: order.customer.address,
        customer_payment: order.customer.payment,
        customer_comment: order.customer.comment,
        items: finalItems,
        total: finalTotal,
        // Save breakdowns too
        bonuses_used: bonusesUsed,
        new_user_discount: newUserDiscount,
        promo_discount: promoDiscount,
        promo_code: appliedPromoCode || (newUserDiscount > 0 ? 'new_client_10' : null),

        status: "Новый"
    }).select("id").single();

    if (error) throw error;
    const orderId = newOrder.id;

    // 5. DEDUCT BONUSES
    if (bonusesUsed > 0) {
        try {
            const { error: rpcError } = await supabase.rpc('deduct_bonuses', { user_id_param: userId, amount_param: bonusesUsed, desc_param: `Оплата заказа #${orderId}` });
            if (rpcError) throw rpcError;
        } catch (e) {
            console.error("RPC Failed, using fallback:", e);
            // Fallback manually:
            const { data: c } = await supabase.from("clients").select("bonus_balance").eq("user_id", userId).single();
            const current = c?.bonus_balance || 0;
            const newBal = Math.max(0, current - bonusesUsed);

            await supabase.from("clients").update({ bonus_balance: newBal }).eq("user_id", userId);
            await supabase.from("bonus_transactions").insert({ user_id: userId, amount: -bonusesUsed, description: `Оплата заказа #${orderId}` });
        }
    }

    // 6. NOTIFY ADMIN
    // Construct trusted order object for notification
    const trustedOrder = {
        ...order,
        items: finalItems,
        new_user_discount: newUserDiscount,
        promo_discount: promoDiscount,
        bonuses_used: bonusesUsed
    };

    const adminMsg = formatAdminMsg(trustedOrder, orderId, finalTotal);
    const inline_keyboard = [
        [
            { text: "✅ Выдано", callback_data: `confirm_${orderId}` },
            { text: "❌ Отмена", callback_data: `cancel_${orderId}` }
        ]
    ];
    if (order.customer.username) inline_keyboard.unshift([{ text: "💬 Связаться", url: `https://t.me/${order.customer.username}` }]);

    await sendTelegram(ADMIN_CHAT_ID, adminMsg, { inline_keyboard });

    // Client Notify
    if (!String(userId).startsWith('web_')) {
        sendTelegram(userId, `✅ Ваш заказ #${orderId} принят! Сумма к оплате: ${finalTotal} ₽`).catch(() => { });
    }

    return new Response(JSON.stringify({ status: "success", orderId, finalTotal }), { headers: { "Content-Type": "application/json", ...corsHeaders } });


    // Клиенту
    if (!String(order.customer.user_id).startsWith('web_')) {
        sendTelegram(order.customer.user_id, `✅ Ваш заказ #${orderId} принят! Сумма: ${finalTotal} ₽`).catch(() => { });
    }

    return new Response(JSON.stringify({ status: "success", orderId }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
}

// --- TELEGRAM UTILS ---
async function telegramFetch(method: string, body: any) {
    if (!BOT_TOKEN) return;
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    return await res.json();
}
async function answerCallback(id: string) {
    await telegramFetch("answerCallbackQuery", { callback_query_id: id });
}
async function sendTelegram(chatId: string, text: string, markup: any = null) {
    const body: any = { chat_id: chatId, text, parse_mode: "Markdown" };
    if (markup) body.reply_markup = markup;
    await telegramFetch("sendMessage", body);
}
async function handleMessage(msg: any) {
    if (msg.text === '/start') {
        const txt = "Добро пожаловать! 💨\n\nНажмите на кнопку ниже, чтобы открыть магазин 👇";
        const markup = {
            inline_keyboard: [
                [
                    { text: "🛍️ Открыть магазин", url: "https://t.me/Jpuffbot/juicy" }
                ]
            ]
        };
        await sendTelegram(msg.chat.id, txt, markup);
    }
}
function formatAdminMsg(order: any, id: string, total: number) {
    // 1. Формируем список товаров
    const itemsList = order.items.map((i: any) => `- ${i.name} (${i.quantity} шт x ${i.price} ₽)`).join('\n');

    // 2. Блок скидок/бонусов, если они есть
    let extras = "";
    if ((order.new_user_discount || 0) > 0) extras += `\n📉 Скидка (New): -${order.new_user_discount} ₽`;
    if ((order.promo_discount || 0) > 0) extras += `\n📉 Скидка (Promo): -${order.promo_discount} ₽`;
    if ((order.bonuses_used || 0) > 0) extras += `\n💎 Бонусы: -${order.bonuses_used} ₽`;

    return `🎉 *НОВЫЙ ЗАКАЗ #${id}*\n` +
        `👤 ${order.customer.name}\n` +
        `📞 ${order.customer.phone}\n` +
        (order.customer.address ? `📍 ${order.customer.address}\n\n` : '') +
        `🛒 *Товары:*\n${itemsList}` +
        `${extras}\n\n` +
        `💰 *Итого: ${total} ₽*`;
}
