-- ИСПРАВЛЕНИЕ ОШИБКИ ОТМЕНЫ (Принудительное приведение типов к ЧИСЛУ)

CREATE OR REPLACE FUNCTION cancel_order_logic(order_id_param BIGINT)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    ord RECORD;
    item JSONB;
    qty INT;
    bonus_val NUMERIC;
BEGIN
    -- 1. Получаем заказ
    SELECT * INTO ord FROM orders WHERE id = order_id_param;
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'Order not found');
    END IF;

    IF ord.status = 'cancelled' THEN
        RETURN json_build_object('success', false, 'message', 'Already cancelled');
    END IF;

    -- 2. Обновляем статус заказа
    UPDATE orders SET status = 'cancelled' WHERE id = order_id_param;

    -- 3. Возврат стока
    IF ord.items IS NOT NULL THEN
        FOR item IN SELECT * FROM jsonb_array_elements(ord.items)
        LOOP
            qty := (item->>'quantity')::INT;
            
            -- ВАЖНО: Приводим stock к NUMERIC перед сложением, чтобы избежать конфликта типов (text vs int)
            -- Затем результат приводим к типу колонки (автоматически)
            UPDATE "Products" 
            SET stock = (COALESCE(stock::NUMERIC, 0) + qty)
            WHERE id = (item->>'id')::BIGINT; 
        END LOOP;
    END IF;

    -- 4. Возврат бонусов. Аналогично защищаем bonus_balance.
    -- Проверяем, что бонусы вообще использовались и это число
    bonus_val := COALESCE(ord.bonuses_used::NUMERIC, 0);

    IF bonus_val > 0 THEN
        UPDATE clients
        SET bonus_balance = COALESCE(bonus_balance::NUMERIC, 0) + bonus_val
        WHERE user_id = ord.user_id;

        INSERT INTO bonus_transactions (user_id, amount, description)
        VALUES (ord.user_id, bonus_val, 'Возврат (Отмена заказа #' || order_id_param || ')');
    END IF;

    RETURN json_build_object('success', true, 'status', 'cancelled');
END;
$$;
