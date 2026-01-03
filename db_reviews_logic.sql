-- ЛОГИКА ОТЗЫВОВ С БОНУСАМИ (+20)

-- 1. Функция для добавления нового отзыва с наградой
CREATE OR REPLACE FUNCTION submit_review(
    product_id_param BIGINT,
    rating_param INT,
    comment_param TEXT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    user_id_var TEXT;
    details_var TEXT;
BEGIN
    -- Получаем ID текущего пользователя (кто вызывает функцию)
    user_id_var := auth.uid(); 
    -- ВАЖНО: При работе через ANON KEY и RLS auth.uid() может быть пустым, если мы не используем встроенную аутентификацию Supabase Auth,
    -- а используем свою систему user_id. 
    -- ТАК КАК у нас в проекте user_id передается клиентом (Telegram ID), мы немного изменим подход.
    -- Функция будет принимать user_id_param.
    
    RETURN json_build_object('error', 'Use submit_review_v2'); 
END;
$$;

-- ПРАВИЛЬНАЯ ФУНКЦИЯ v2 (принимает user_id явно, так как у нас Telegram-авторизация)
CREATE OR REPLACE FUNCTION submit_review_v2(
    user_id_param TEXT,
    product_id_param BIGINT,
    rating_param INT,
    comment_param TEXT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    bonus_size CONSTANT INT := 20;
    existing_id BIGINT;
BEGIN
    -- 1. Проверяем, писал ли уже отзыв на этот товар
    SELECT id INTO existing_id FROM reviews 
    WHERE user_id = user_id_param AND product_id = product_id_param;
    
    IF existing_id IS NOT NULL THEN
        RETURN json_build_object('success', false, 'message', 'Вы уже оценивали этот товар. Используйте редактирование.');
    END IF;

    -- 2. Создаем отзыв
    INSERT INTO reviews (user_id, product_id, rating, comment)
    VALUES (user_id_param, product_id_param, rating_param, comment_param);

    -- 3. Начисляем бонусы (+20)
    UPDATE clients 
    SET bonus_balance = COALESCE(bonus_balance, 0) + bonus_size,
        total_earned = COALESCE(total_earned, 0) + bonus_size
    WHERE user_id = user_id_param;

    -- 4. Записываем транзакцию
    INSERT INTO bonus_transactions (user_id, amount, description)
    VALUES (user_id_param, bonus_size, 'Бонус за отзыв о товаре #' || product_id_param);

    RETURN json_build_object('success', true, 'bonus_added', bonus_size);
END;
$$;


-- 2. Функция для РЕДАКТИРОВАНИЯ отзыва (без бонусов)
CREATE OR REPLACE FUNCTION update_review(
    review_id_param BIGINT,
    rating_param INT,
    comment_param TEXT
)
RETURNS JSON
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE reviews
    SET rating = rating_param,
        comment = comment_param,
        created_at = now() -- Обновляем дату
    WHERE id = review_id_param;

    RETURN json_build_object('success', true);
END;
$$;
