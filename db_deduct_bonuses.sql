CREATE OR REPLACE FUNCTION deduct_bonuses(user_id_param BIGINT, amount_param NUMERIC, desc_param TEXT)
RETURNS JSON
LANGUAGE plpgsql
AS $$
DECLARE
    current_balance NUMERIC;
BEGIN
    SELECT bonus_balance INTO current_balance FROM clients WHERE user_id = user_id_param;
    
    IF current_balance IS NULL OR current_balance < amount_param THEN
        RETURN json_build_object('success', false, 'message', 'Insufficient funds');
    END IF;

    UPDATE clients 
    SET bonus_balance = bonus_balance - amount_param 
    WHERE user_id = user_id_param;

    INSERT INTO bonus_transactions (user_id, amount, description)
    VALUES (user_id_param, -amount_param, desc_param);

    RETURN json_build_object('success', true);
END;
$$;
