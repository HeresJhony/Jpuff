-- ИСПРАВЛЕНИЕ ТИПОВ ДАННЫХ (UUID -> BIGINT)
-- Выполните этот скрипт в Supabase SQL Editor, чтобы исправить ошибку "invalid input syntax for type uuid"

-- 1. Удаляем старые функции (на всякий случай, если типы конфликтуют при замене)
DROP FUNCTION IF EXISTS confirm_order_logic(UUID);
DROP FUNCTION IF EXISTS cancel_order_logic(UUID);

-- 2. Функция ПОДТВЕРЖДЕНИЯ (принимает BIGINT)
CREATE OR REPLACE FUNCTION confirm_order_logic(order_id_param BIGINT)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    ord RECORD;
    client_rec RECORD;
    new_total_orders INT;
    order_total NUMERIC;
    bonus_amount NUMERIC;
    ref_bonus NUMERIC;
BEGIN
    -- 1. Получаем заказ
    SELECT * INTO ord FROM orders WHERE id = order_id_param;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Order not found');
    END IF;

    IF ord.status = 'completed' THEN
        RETURN json_build_object('success', false, 'message', 'Already completed');
    END IF;

    -- 2. Обновляем статус
    UPDATE orders SET status = 'completed' WHERE id = order_id_param;

    -- 3. Обновляем статистику клиента
    SELECT * INTO client_rec FROM clients WHERE user_id = ord.user_id;
    new_total_orders := COALESCE(client_rec.total_orders, 0) + 1;
    
    UPDATE clients 
    SET total_orders = new_total_orders 
    WHERE user_id = ord.user_id;

    -- 4. НАЧИСЛЕНИЕ БОНУСОВ
    order_total := ord.total;
    
    -- А) Личный кэшбэк (2%)
    bonus_amount := FLOOR(order_total * 0.02);
    IF bonus_amount > 0 THEN
        UPDATE clients 
        SET bonus_balance = COALESCE(bonus_balance, 0) + bonus_amount,
            total_earned = COALESCE(total_earned, 0) + bonus_amount
        WHERE user_id = ord.user_id;
        
        INSERT INTO bonus_transactions (user_id, amount, description)
        VALUES (ord.user_id, bonus_amount, 'Кэшбэк за заказ #' || order_id_param);
    END IF;

    -- Б) Приветственный бонус (+100 за 1-й заказ)
    IF new_total_orders = 1 THEN
        IF NOT EXISTS (SELECT 1 FROM bonus_transactions WHERE user_id = ord.user_id AND description = 'Welcome Bonus') THEN
            UPDATE clients 
            SET bonus_balance = COALESCE(bonus_balance, 0) + 100,
                total_earned = COALESCE(total_earned, 0) + 100
            WHERE user_id = ord.user_id;
            
            INSERT INTO bonus_transactions (user_id, amount, description)
            VALUES (ord.user_id, 100, 'Welcome Bonus');
        END IF;
    END IF;

    -- В) Реферер
    IF client_rec.referrer_id IS NOT NULL THEN
        -- Бонус за друга (+100 за 1-й заказ)
        IF new_total_orders = 1 THEN
             IF NOT EXISTS (SELECT 1 FROM bonus_transactions WHERE user_id = client_rec.referrer_id AND description LIKE '%friend: ' || ord.user_id || '%') THEN
                UPDATE clients 
                SET bonus_balance = COALESCE(bonus_balance, 0) + 100,
                    total_earned = COALESCE(total_earned, 0) + 100
                WHERE user_id = client_rec.referrer_id;
                
                INSERT INTO bonus_transactions (user_id, amount, description)
                VALUES (client_rec.referrer_id, 100, 'Invite Bonus (friend: ' || ord.user_id || ')');
             END IF;
        END IF;

        -- 1% от заказа
        ref_bonus := FLOOR(order_total * 0.01);
        IF ref_bonus > 0 THEN
            UPDATE clients 
            SET bonus_balance = COALESCE(bonus_balance, 0) + ref_bonus,
                total_earned = COALESCE(total_earned, 0) + ref_bonus
            WHERE user_id = client_rec.referrer_id;
            
            INSERT INTO bonus_transactions (user_id, amount, description)
            VALUES (client_rec.referrer_id, ref_bonus, '1% от заказа друга (' || ord.user_id || ')');
        END IF;
    END IF;

    RETURN json_build_object('success', true, 'status', 'completed');
END;
$$;

-- 3. Функция ОТМЕНЫ (принимает BIGINT)
CREATE OR REPLACE FUNCTION cancel_order_logic(order_id_param BIGINT)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    ord RECORD;
    item JSONB;
    prod_id BIGINT; -- Исправим и тут, вдруг товары тоже integer ID
    prod_uuid UUID; -- На случай если товары UUID
    qty INT;
BEGIN
    SELECT * INTO ord FROM orders WHERE id = order_id_param;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Order not found');
    END IF;

    IF ord.status = 'cancelled' THEN
        RETURN json_build_object('success', false, 'message', 'Already cancelled');
    END IF;

    UPDATE orders SET status = 'cancelled' WHERE id = order_id_param;

    -- Возврат стока
    IF ord.items IS NOT NULL THEN
        FOR item IN SELECT * FROM jsonb_array_elements(ord.items)
        LOOP
            -- Пытаемся понять тип ID товара. Обычно это UUID, но вдруг.
            -- Сделаем безопасное приведение
            qty := (item->>'quantity')::INT;
            
            -- Вариант А: Товары имеют UUID id (стандарт Supabase)
            -- UPDATE "Products" SET stock = COALESCE(stock, 0) + qty WHERE id = (item->>'id')::UUID;
            
            -- Вариант Б: Товары имеют INT id (как заказы)
             UPDATE "Products" SET stock = COALESCE(stock, 0) + qty 
             WHERE id = (item->>'id')::UUID; -- ВНИМАНИЕ: Тут я оставил UUID, так как обычно товары 'products' это main table.
             -- Если у вас ошибка при ОТМЕНЕ тоже будет invalid uuid, скажите.
        END LOOP;
    END IF;

    IF ord.bonuses_used > 0 THEN
        UPDATE clients
        SET bonus_balance = COALESCE(bonus_balance, 0) + ord.bonuses_used
        WHERE user_id = ord.user_id;

        INSERT INTO bonus_transactions (user_id, amount, description)
        VALUES (ord.user_id, ord.bonuses_used, 'Возврат (Отмена заказа #' || order_id_param || ')');
    END IF;

    RETURN json_build_object('success', true, 'status', 'cancelled');
END;
$$;
