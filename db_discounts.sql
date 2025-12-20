-- 1. Добавляем колонку icon
ALTER TABLE public.discounts 
ADD COLUMN IF NOT EXISTS icon text DEFAULT '🎟️'; 

-- 2. Пример обновления иконок для существующих скидок
UPDATE public.discounts SET icon = '🎒' WHERE code = 'traveler_10';
UPDATE public.discounts SET icon = '🔥' WHERE code = 'new_client_10';
