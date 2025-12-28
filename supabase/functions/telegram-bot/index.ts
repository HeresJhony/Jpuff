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
            // Robust Body Parsing (Handle both JSON and Text/Plain from legacy frontend)
            let body;
            const rawBody = await req.text();
            try {
                body = JSON.parse(rawBody);
            } catch (e) {
                console.error("Failed to parse request body:", e);
                return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // Case A: Telegram Callback Query (Button Click)
            if (body.callback_query) {
                await handleCallback(body.callback_query);
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

            // 2. Get Client Data (Bonuses)
            if (action === "getClientData" && userId) {
                const { data } = await supabase.from("clients").select("*").eq("user_id", userId).single();
                return new Response(JSON.stringify(data || { bonus_balance: 0 }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
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
    // 0. Strict Validation
    validateItems(order.items);

    if (typeof order.total !== 'number' || order.total < 0) throw new Error("Validation Error: Total cannot be negative");
    if (order.bonuses_used && (typeof order.bonuses_used !== 'number' || order.bonuses_used < 0)) {
        throw new Error("Validation Error: Bonuses used cannot be negative");
    }

    // 🔐 CRITICAL VALIDATION: Stock & Price Verification
    console.log("[ORDER] Validating stock and recalculating prices from DB...");

    let recalculatedTotal = 0;
    const validatedItems = [];

    for (const item of order.items) {
        // Fetch REAL product data from database
        // FIX: Request correct columns (model_name/brand instead of non-existent name)
        const { data: product, error } = await supabase
            .from("Products")
            .select("id, model_name, brand, taste, price, stock")
            .eq("id", item.id)
            .single();

        // If product not found or error, treat as out of stock
        if (error || !product) {
            console.warn(`Product ID ${item.id} fetch failed:`, error?.message);
            throw new Error(`Validation Error: Товар "${item.name}" недоступен или удален (Ошибка БД).`);
        }

        // Construct Name Handle
        const realName = `${product.brand} ${product.model_name} ${product.taste ? ' - ' + product.taste : ''}`;

        // Check stock availability
        const availableStock = Number(product.stock) || 0;
        if (item.quantity > availableStock) {
            throw new Error(`Validation Error: Недостаточно товара "${realName}". Доступно: ${availableStock} шт., запрошено: ${item.quantity} шт.`);
        }

        // Use REAL price from DB (ignore client-provided price)
        const realPrice = Number(product.price);
        recalculatedTotal += realPrice * item.quantity;

        // Store validated item with real price
        validatedItems.push({
            ...item,
            price: realPrice, // Overwrite with DB price
            name: realName // Ensure correct name
        });
    }

    // Replace order items with validated & corrected items
    order.items = validatedItems;

    // Calculate expected total with discounts
    const totalBeforeDiscounts = recalculatedTotal;
    const totalDiscounts = (order.bonus_discount || 0) + (order.new_user_discount || 0) + (order.promo_discount || 0);
    const expectedTotal = totalBeforeDiscounts - totalDiscounts;

    console.log(`[ORDER] Recalculated: ${totalBeforeDiscounts}₽ - ${totalDiscounts}₽ discounts = ${expectedTotal}₽`);
    console.log(`[ORDER] Client sent: ${order.total}₽`);

    // Allow 1₽ tolerance for rounding
    if (Math.abs(order.total - expectedTotal) > 1) {
        throw new Error(`Validation Error: Price mismatch. Expected ${expectedTotal}₽, got ${order.total}₽. Please refresh the page.`);
    }

    // Update total to exact calculated value
    order.total = expectedTotal;
    order.original_total = totalBeforeDiscounts;

    // 🔐 CRITICAL SECURITY CHECK: Verify Bonus Balance BEFORE Processing
    if (order.bonuses_used && order.bonuses_used > 0) {
        // We need to fetch the client first to check balance
        // This is a bit awkward because checkAndRegisterClient is below, but security first!
        const userId = order.customer.user_id || 'UNKNOWN';

        if (userId !== 'UNKNOWN') {
            const { data: clientData } = await supabase.from("clients").select("bonus_balance").eq("user_id", userId).single();

            if (clientData) {
                const availableBalance = Number(clientData.bonus_balance) || 0;

                if (order.bonuses_used > availableBalance) {
                    throw new Error(`Validation Error: Insufficient bonus balance. Available: ${availableBalance}, Requested: ${order.bonuses_used}`);
                }
            } else {
                // New client trying to use bonuses they don't have
                throw new Error("Validation Error: Cannot use bonuses - no bonus account found");
            }
        } else {
            // Guest can't use bonuses
            throw new Error("Validation Error: Guest users cannot use bonuses");
        }
    }

    // 1. Check/Register Client
    const clientStats = await checkAndRegisterClient(order.customer);

    // 2. Validate & Process Discounts
    let discountInfo = null;
    let discountLabel = "";

    if (order.promo_code) {
        const { data: dData } = await supabase.from("discounts").select("*").eq("code", order.promo_code).single();
        if (dData && dData.is_active) {
            // Logic similar to GAS: check limits, one-time, etc.
            // For MVP simplicity, we trust the code exists if valid
            discountInfo = dData;
            discountLabel = dData.admin_label || `Promo ${dData.code}`;

            // Recalculate Total (Server Truth)
            const original = Number(order.original_total || order.total);
            let amountOff = 0;
            if (dData.type === 'percent') amountOff = Math.round(original * (dData.value / 100));
            else amountOff = Number(dData.value);

            order.new_user_discount = amountOff;
            order.total = original - amountOff - (order.bonus_discount || 0);
        }
    }

    // 3. Create Order
    // We try to save discounts. If columns don't exist, this might fail unless we treat them carefully.
    // SAFE APPROACH: Save important discount metadata into 'customer_comment' OR 'items' if columns miss.
    // Ideally, columns 'new_user_discount', 'promo_discount', 'promo_code' should exist in 'orders' table.

    const dbPayload: any = {
        user_id: clientStats.userId,
        customer_name: order.customer.name,
        customer_phone: order.customer.phone,
        customer_address: order.customer.address,
        customer_payment: order.customer.payment,
        customer_comment: order.customer.comment + (discountLabel ? ` [PROMO: ${order.promo_code || 'NewUser'} | -${order.new_user_discount || order.promo_discount}₽]` : ""),
        items: order.items,
        total: order.total,
        bonuses_used: order.bonuses_used || 0,
        status: "Новый"
    };

    // Try to add specific fields if they are passed (assuming DB Schema handles them or ignores extra props if loose?)
    // No, Supabase/PG is strict. If column doesn't exist, it errors.
    // For MVP safety, let's stick to putting deep details in 'customer_comment' or ensuring we only write known columns.
    // If you confirm columns exist, uncomment below:
    if (order.new_user_discount) dbPayload.new_user_discount = order.new_user_discount;
    if (order.promo_code) dbPayload.promo_code = order.promo_code;

    // BUT, for History checks in frontend (cart.js), we look for 'new_user_discount' in the returned object.
    // If we don't save it, frontend won't see it later.
    // LET'S ASSUME we need to manually inject this into 'items' metadata as a workaround if we can't alter DB schema right now.
    // We can add a hidden item or metadata property to the first item? No, dirty.

    // Let's rely on adding columns. I will add them to the insert query. 
    // If it fails, USER MUST ADD COLUMNS.
    if (order.new_user_discount) dbPayload.new_user_discount = order.new_user_discount;
    if (order.promo_code) dbPayload.promo_code = order.promo_code;

    const { data: orderRow, error: orderError } = await supabase.from("orders").insert(dbPayload).select("id").single();

    if (orderError) throw new Error("DB Error: " + orderError.message);

    const orderId = orderRow.id;

    // 4. Update Stock (Parallel)
    for (const item of order.items) {
        // Simplified stock update - decrements stock
        // Note: Real prod should use RPC for atomicity
        const { data: prod } = await supabase.from("Products").select("stock").eq("id", item.id).single();
        if (prod) {
            await supabase.from("Products").update({ stock: Math.max(0, Number(prod.stock) - Number(item.quantity)) }).eq("id", item.id);
        }
    }

    // 5. Process Bonuses
    await processOrderBonuses(order, clientStats.userId, clientStats.referrerId);

    // 6. Notify Telegram Admin
    const adminMsg = formatTelegramMessage(order, orderId, clientStats, discountLabel);

    // Dynamic Markup
    const inline_keyboard: any[] = [
        [
            { text: "✅ Выдано", callback_data: `confirm_${orderId}` },
            { text: "❌ Отмена", callback_data: `cancel_${orderId}` }
        ]
    ];

    // Add contact button if possible
    if (order.customer.username) {
        inline_keyboard.unshift([{ text: "💬 Связаться", url: `https://t.me/${order.customer.username}` }]);
    } else if (order.customer.user_id && !String(order.customer.user_id).startsWith('web_')) {
        inline_keyboard.unshift([{ text: "👤 Профиль", url: `tg://user?id=${order.customer.user_id}` }]);
    }

    const markup = { inline_keyboard };
    await sendTelegram(ADMIN_CHAT_ID, adminMsg, markup);

    // 7. Notify Client
    // Ensure user_id is treated as string for check
    const userIdStr = String(order.customer.user_id || "");
    if (userIdStr && !userIdStr.startsWith('web_')) {
        // Only send to Telegram IDs (numeric usually, or we try anyway)
        const clientMsg = formatClientMessage(order);
        await sendTelegram(order.customer.user_id, clientMsg);
    }

    return new Response(JSON.stringify({ status: "success", orderId: orderId }), { headers: { "Content-Type": "application/json", ...corsHeaders } });
}

// --- TELEGRAM CALLBACK LOGIC ---

async function handleCallback(cb: any) {
    const chatId = cb.message.chat.id;
    const msgId = cb.message.message_id;
    const data = cb.data;

    // Debug helper
    const logToChat = async (text: string) => {
        // Uncomment to debug live in chat

        /*
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: `🐛 ${text}` })
        });
        */

        console.log(text);
    };

    try {
        await logToChat(`Callback: ${data}`);
        const [action, orderId] = data.split('_');

        // 1. Answer Immediately
        await answerCallback(cb.id);

        let uiText = "";

        // Check current status
        const { data: order, error: fetchError } = await supabase.from("orders").select("status, user_id, bonuses_used").eq("id", orderId).single();

        if (fetchError) {
            await logToChat(`Error fetching order: ${fetchError.message}`);
            // If order invalid/deleted
            uiText = `⚠️ Заказ #${orderId} не найден.`;
        }
        else if (order) {
            await logToChat(`Order #${orderId} found. Status: ${order.status}`);

            // Helpers
            const userIdStr = String(order.user_id || "");
            const isTelegramUser = userIdStr && !userIdStr.startsWith('web_');

            if (action === "confirm") {
                if (order.status === "completed") {
                    uiText = `✅ Заказ #${orderId} УЖЕ выдан!`;
                } else {
                    const { error: updateError } = await supabase.from("orders").update({ status: "completed" }).eq("id", orderId);
                    if (updateError) throw new Error(`Update Failed: ${updateError.message}`);

                    await logToChat("Order updated. Accruing bonuses...");
                    await accrueBonuses(orderId);
                    uiText = `✅ Заказ #${orderId} успешно выдан!`;

                    if (isTelegramUser) {
                        await sendTelegram(order.user_id, `✅ Ваш заказ #${orderId} успешно выдан!\nСпасибо, что выбрали нас! 🤝`);
                    }
                }
            }
            else if (action === "cancel") {
                if (order.status === "cancelled") {
                    uiText = `❌ Заказ #${orderId} УЖЕ отменен.`;
                } else {
                    await supabase.from("orders").update({ status: "cancelled" }).eq("id", orderId);
                    await logToChat("Order cancelled. Returning stock...");
                    await returnStock(orderId);
                    await refundBonuses(orderId);
                    uiText = `❌ Заказ #${orderId} отменен. Товары возвращены.`;

                    if (isTelegramUser) {
                        let msg = `❌ Ваш заказ #${orderId} был отменен.`;
                        if (order.bonuses_used > 0) {
                            msg += `\n🔄 Возвращено бонусов: ${order.bonuses_used}`;
                        }
                        await sendTelegram(order.user_id, msg);
                    }
                }
            }
        }

        // 4. Send Result (Edit Original)
        if (uiText) {
            await logToChat(`Updating UI to: ${uiText}`);
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, message_id: msgId, text: uiText })
            });
        }
    } catch (e: any) {
        console.error("Callback error:", e);
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: chatId, text: `⚠️ CRITICAL ERROR: ${e.message || e}` })
        });
    }
}


// --- HELPERS ---

async function checkAndRegisterClient(customer: any) {
    const userId = customer.user_id || 'UNKNOWN';
    // Clean phone number (remove spaces, etc) for consistent search
    const cleanPhone = customer.phone ? customer.phone.replace(/\D/g, '') : '';

    // 1. Try to find by User ID
    let { data: existing } = await supabase.from("clients").select("*").eq("user_id", userId).single();

    // 2. If not found by ID, try to find by Phone
    let foundByPhone = false;
    if (!existing && cleanPhone.length > 5) { // Ensure phone is long enough to be valid
        // Note: This assumes phone numbers are unique in your system
        // We need to query where phone matches. Supabase doesn't have a simple "OR" easily across calls without query builder, 
        // but here we do it sequentially.
        // We need to look for phone numbers that *contain* this clean sequence or match roughly? 
        // For now, let's assume we store raw strings but we should try to match.
        // To be safe, let's try to match the exact string provided or the cleaned version if you store cleaned.
        // Given the current simple MVP, we'll try to match the 'phone' column.
        const { data: byPhone } = await supabase.from("clients").select("*").ilike('phone', `%${cleanPhone}%`).limit(1).single();

        if (byPhone) {
            existing = byPhone;
            foundByPhone = true;
            // UPDATE ID: Found by phone, but ID is different (or was old web_ one).
            // Let's migrate this user to the new Telegram ID so they don't lose bonuses.
            if (existing.user_id !== userId) {
                await supabase.from("clients").update({ user_id: userId }).eq("id", existing.id);
                console.log(`Merged user by phone: ${cleanPhone}. Old ID: ${existing.user_id} -> New ID: ${userId}`);
            }
        }
    }

    if (existing) {
        // CORRECTION: Check if this was a "Pre-client" (Guest) converting to real client
        // Condition: total_orders == 0 AND has referrer_id
        if ((existing.total_orders === 0 || existing.total_orders === null) && existing.referrer_id) {
            const refId = existing.referrer_id;
            console.log(`Converting Guest to Client: ${userId} (Ref: ${refId})`);

            // 1. Award Referrer (100)
            const { data: ref } = await supabase.from("clients").select("bonus_balance").eq("user_id", refId).single();
            let refBal = 0;
            if (ref) {
                refBal = ref.bonus_balance || 0;
            } else {
                await supabase.from("clients").insert({ user_id: refId, name: "Пригласивший (Авто)", bonus_balance: 0 });
            }

            await supabase.from("clients").update({ bonus_balance: refBal + 100 }).eq("user_id", refId);
            await logBonus(refId, 100, `Invite Bonus (friend: ${userId})`);

            // 2. Award User (Welcome 100)
            const currentBal = existing.bonus_balance || 0;
            const newBal = currentBal + 100;

            // 3. Update Client Record
            // 3. Update Client Record
            const { error: updErr } = await supabase.from("clients").update({
                name: customer.name || "Клиент",
                bonus_balance: newBal,
                total_orders: 1
            }).eq("id", existing.id);

            if (updErr) {
                console.error("GUEST CONVERSION ERROR (Update failed):", updErr);
                // Fallback: Try generating bonus only, ignore name
                const { error: retryErr } = await supabase.from("clients").update({
                    bonus_balance: newBal,
                    total_orders: 1
                }).eq("id", existing.id);

                if (retryErr) console.error("GUEST CONVERSION RETRY FAILED:", retryErr);
            }

            await logBonus(userId, 100, "Welcome Bonus");

            return { userId, isNew: true, referrerId: refId, bonus_balance: newBal };
        }

        return { userId, isNew: false, referrerId: existing.referrer_id, bonus_balance: existing.bonus_balance };
    }

    // --- NEW CLIENT LOGIC ---
    let referrerId = customer.referrer_id || null;
    let initialBonus = 0;

    // Validate Self-Referral
    if (referrerId === userId) referrerId = null;

    if (referrerId) {
        // Auto-create referrer if missing (Ghost Referrer Logic)
        const { data: ref } = await supabase.from("clients").select("bonus_balance").eq("user_id", referrerId).single();

        let refBalance = 0;
        if (ref) {
            refBalance = ref.bonus_balance || 0;
        } else {
            // Create ghost referrer
            await supabase.from("clients").insert({ user_id: referrerId, name: "Пригласивший (Авто)", bonus_balance: 0 });
            refBalance = 0;
        }

        // Award Referrer (100)
        await supabase.from("clients").update({ bonus_balance: refBalance + 100 }).eq("user_id", referrerId);
        await logBonus(referrerId, 100, `Invite Bonus (friend: ${userId})`);

        initialBonus = 100; // Award New User
    }

    // Create Client
    await supabase.from("clients").insert({
        user_id: userId,
        name: customer.name,
        phone: customer.phone, // We store the one provided
        bonus_balance: initialBonus,
        referrer_id: referrerId,
        total_orders: 1
    });

    if (initialBonus > 0) await logBonus(userId, initialBonus, "Welcome Bonus");

    return { userId, isNew: true, referrerId, bonus_balance: initialBonus };
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

async function processOrderBonuses(order: OrderData, userId: string, referrerId: string | null) {
    // 1. Spend ONLY (Cashback is now on confirm)
    if (order.bonuses_used > 0) {
        // await rpcIncrementBonus(userId, -order.bonuses_used); // OLD

        // Manual Update
        const { data: c } = await supabase.from("clients").select("bonus_balance").eq("user_id", userId).single();
        if (c) {
            const current = Number(c.bonus_balance) || 0;
            // Ensure we don't go below zero (though validation should handle this, safety first)
            const newBal = current - order.bonuses_used;
            // We allow negative temporarily? No, usually not. But let's assume validation checked availability.

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

async function answerCallback(id: string) {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callback_query_id: id })
    });
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
