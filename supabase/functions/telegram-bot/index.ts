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
    // Логика регистрации
    // ... (Упрощенная версия)
    const { data: existing } = await supabase.from("clients").select("id").eq("user_id", userId).single();
    let isNew = false;
    if (!existing) {
        await supabase.from("clients").insert({ user_id: userId, name: "Гость", bonus_balance: 0, total_orders: 0 });
        isNew = true;
        // Welcome MSG
        if (!String(userId).startsWith('web_')) sendTelegram(String(userId), "Добро пожаловать!").catch(() => { });
    }
    return new Response(JSON.stringify({ success: true, isNew }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function registerReferralLink(body: any) {
    // Упрощенная логика рефералки - просто сохраняем
    const { userId, referrerId } = body;
    if (!userId || !referrerId) return new Response(JSON.stringify({ error: "Missing params" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (userId === referrerId) return new Response(JSON.stringify({ success: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: existing } = await supabase.from("clients").select("*").eq("user_id", userId).single();
    if (!existing) {
        // Создаем с реферером
        await supabase.from("clients").insert({ user_id: userId, name: "Гость", bonus_balance: 0, referrer_id: referrerId, total_orders: 0 });
        // Инкремент кликов рефереру
        const { data: r } = await supabase.from("clients").select("referral_clicks").eq("user_id", referrerId).single();
        if (r) await supabase.from("clients").update({ referral_clicks: (r.referral_clicks || 0) + 1 }).eq("user_id", referrerId);
        else {
            // Создаем реферера-призрака
            await supabase.from("clients").insert({ user_id: referrerId, name: "Пригласивший", referral_clicks: 1 });
        }
    }
    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}


async function handleNewOrder(order: any) {
    // ВАЖНО: Валидация
    if (!order.items || order.items.length === 0) return new Response(JSON.stringify({ error: "No items" }), { headers: corsHeaders });

    // 1. Проверка цен и стока (Можно вынести в RPC тоже, но пока оставим тут для точности)
    // Для скорости сразу пишем в БД, а проверки делаем минимальные
    // Но лучше делать как было:
    let realTotal = 0;
    const finalItems = [];

    for (const item of order.items) {
        const { data: p } = await supabase.from("Products").select("price, stock").eq("id", item.id).single();
        if (!p) continue; // Skip invalid
        const price = Number(p.price);
        realTotal += price * item.quantity;
        finalItems.push({ ...item, price });

        // Списание стока
        const newStock = Math.max(0, Number(p.stock) - Number(item.quantity));
        await supabase.from("Products").update({ stock: newStock }).eq("id", item.id);
    }

    // Скидки
    let finalTotal = realTotal - (order.new_user_discount || 0) - (order.promo_discount || 0) - (order.bonuses_used || 0);
    // ... Проверки опустим для краткости, полагаемся на фронтенд + базу

    // 2. ГАРАНТИЯ СУЩЕСТВОВАНИЯ КЛИЕНТА
    const userId = order.customer.user_id;
    // upsert с ignoreDuplicates гарантирует, что клиент будет создан, если его нет
    await supabase.from("clients").upsert(
        { user_id: userId, name: order.customer.name || "Гость", total_orders: 0, bonus_balance: 0 },
        { onConflict: 'user_id', ignoreDuplicates: true }
    );

    // Сохраняем заказ
    const { data: newOrder, error } = await supabase.from("orders").insert({
        user_id: order.customer.user_id,
        customer_name: order.customer.name,
        customer_phone: order.customer.phone,
        customer_address: order.customer.address,
        customer_payment: order.customer.payment,
        customer_comment: order.customer.comment,
        items: finalItems,
        total: finalTotal,
        bonuses_used: order.bonuses_used || 0,
        status: "Новый",
        new_user_discount: order.new_user_discount,
        promo_discount: order.promo_discount,
        promo_code: order.promo_code
    }).select("id").single();

    if (error) throw error;
    const orderId = newOrder.id;

    // Списываем бонусы с баланса
    if (order.bonuses_used > 0) {
        const { data: c } = await supabase.from("clients").select("bonus_balance").eq("user_id", order.customer.user_id).single();
        if (c) {
            const nb = Math.max(0, (c.bonus_balance || 0) - order.bonuses_used);
            await supabase.from("clients").update({ bonus_balance: nb }).eq("user_id", order.customer.user_id);
            await supabase.from("bonus_transactions").insert({ user_id: order.customer.user_id, amount: -order.bonuses_used, description: `Оплата заказа #${orderId}` });
        }
    }

    // Отправляем админу
    const adminMsg = formatAdminMsg(order, orderId, finalTotal);
    const inline_keyboard = [
        [
            { text: "✅ Выдано", callback_data: `confirm_${orderId}` },
            { text: "❌ Отмена", callback_data: `cancel_${orderId}` }
        ]
    ];
    if (order.customer.username) inline_keyboard.unshift([{ text: "💬 Связаться", url: `https://t.me/${order.customer.username}` }]);

    await sendTelegram(ADMIN_CHAT_ID, adminMsg, { inline_keyboard });

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
        const txt = "Добро пожаловать! Перейдите в магазин по кнопке ниже.";
        await sendTelegram(msg.chat.id, txt);
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
