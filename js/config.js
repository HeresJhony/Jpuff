// js/config.js
export const CONFIG = {
    SUPABASE_URL: 'https://fbgrlzxznckydzvtybvj.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiZ3Jsenh6bmNreWR6dnR5YnZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzczMTAsImV4cCI6MjA4MDg1MzMxMH0.inIcf6aQfgOzGCt4ubceG61AdD0go59AGUxCz-zaw3c',
    // Google Apps Script Deployment URL
    ORDER_API_URL: "https://fbgrlzxznckydzvtybvj.supabase.co/functions/v1/telegram-bot",
};

export const API_HEADERS = {
    'apikey': CONFIG.SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json'
};
