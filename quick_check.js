const https = require('https');
const FUNCTION_URL = "https://fbgrlzxznckydzvtybvj.supabase.co/functions/v1/telegram-bot?action=checkWebhook";

function checkPublic() {
    console.log("Checking PUBLIC Access...");
    https.get(FUNCTION_URL, (res) => {
        console.log(`Status Code: ${res.statusCode}`);
        if (res.statusCode === 200) {
            console.log("✅ OK (Access Open)");
        } else if (res.statusCode === 401) {
            console.log("❌ BLOCKED (401 Unauthorized) - Need deployment fix");
        } else {
            console.log("⚠️ Unknown:", res.statusCode);
        }
    }).on('error', (e) => console.error(e));
}
checkPublic();
