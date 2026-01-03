-- ИСПРАВЛЕНИЕ БОНУСНОЙ ЛОГИКИ (Убрали Welcome Bonus 100 для самого клиента)

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
    
    -- А) ЛИЧНЫЙ КЭШБЭК (2%) - Это оставляем
    bonus_amount := FLOOR(order_total * 0.02);
    IF bonus_amount > 0 THEN
        UPDATE clients 
        SET bonus_balance = COALESCE(bonus_balance, 0) + bonus_amount,
            total_earned = COALESCE(total_earned, 0) + bonus_amount
        WHERE user_id = ord.user_id;
        
        INSERT INTO bonus_transactions (user_id, amount, description)
        VALUES (ord.user_id, bonus_amount, 'Кэшбэк за заказ #' || order_id_param);
    END IF;

    -- [УДАЛЕНО] Блок "Welcome Bonus" для клиента (+100) убран по требованию.

    -- В) НАГРАДА РЕФЕРЕРУ (Тому, кто пригласил)
    IF client_rec.referrer_id IS NOT NULL THEN
        -- Бонус за приглашение (+100 Васе, если это 1-й заказ друга)
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

        -- 1% от суммы заказа рефереру
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
