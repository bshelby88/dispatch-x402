const fs = require("fs");
const path = require("path");
const https = require("https");
const { exec } = require("child_process");

const DB_PATH = path.join(__dirname, "users_db.json");
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "PLACEHOLDER_TOKEN";

const ENDPOINTS = {
  analyze: "http://tradingagents-x402.fly.dev/api/analyze-ticker",
  law: "https://royal-ruby-x402.fly.dev/api/law-lookup",
  scaffold: "https://vault-pro-x402.fly.dev/api/scaffold-project"
};

// Load local database of user balances
function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({}));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// Call Telegram bot API
function sendTelegramMessage(chatId, text) {
  const data = JSON.stringify({ chat_id: chatId, text });
  const options = {
    hostname: "api.telegram.org",
    port: 443,
    path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": data.length,
    },
  };
  const req = https.request(options);
  req.write(data);
  req.end();
}

function callAgentApi(url, body) {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === "win32";
    const bodyStr = JSON.stringify(body).replace(/"/g, '\\"');
    const cmd = `${isWin ? "npx.cmd" : "npx"} agentcash fetch ${url} -X POST -H "Content-Type: application/json" -d "${bodyStr}"`;
    exec(cmd, (error, stdout, stderr) => {
      if (error && (!stdout || !stdout.trim())) {
        return reject(error);
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({ ok: false, error: "Failed to parse API response" });
      }
    });
  });
}

// Handle incoming Telegram commands
async function handleMessage(chatId, username, text) {
  const db = loadDB();
  const userId = String(chatId);

  // Initialize user balance
  if (!db[userId]) {
    db[userId] = { username, balance: 1.00 }; // Give $1.00 starter balance
    saveDB(db);
  }

  const user = db[userId];

  if (text.startsWith("/start")) {
    sendTelegramMessage(
      chatId,
      `Welcome ${username}! Your balance is $${user.balance.toFixed(2)} USDC.\n\n` +
      `Commands:\n` +
      `📊 /analyze <ticker> - Market reports & rating ($0.10 USDC)\n` +
      `⚖️ /law <topic> - US consumer law citations lookup ($0.05 USDC)\n` +
      `📁 /scaffold <goal> - Obsidian project structural vault generator ($0.15 USDC)\n\n` +
      `Use /deposit to fund your account.`
    );
  } else if (text.startsWith("/deposit")) {
    sendTelegramMessage(
      chatId,
      `To deposit USDC on Base, send to treasury:\n` +
      `0x9b8a2786a3df7a7837ccfc4e792e9eb90a36f72f\n\n` +
      `Then message Bryant with your transaction receipt to credit your bot balance.`
    );
  } else if (text.startsWith("/analyze")) {
    const parts = text.split(" ");
    const ticker = parts[1] ? parts[1].toUpperCase() : "";
    if (!ticker) {
      return sendTelegramMessage(chatId, "Usage: /analyze <ticker>, e.g. /analyze NVDA");
    }

    if (user.balance < 0.10) {
      return sendTelegramMessage(chatId, "Insufficient balance! Please use /deposit to add funds.");
    }

    sendTelegramMessage(chatId, `Analyzing ticker ${ticker}... Please wait (~60-90s).`);

    try {
      const result = await callAgentApi(ENDPOINTS.analyze, { ticker });
      user.balance -= 0.10;
      saveDB(db);

      const summaryText = `📊 ANALYSIS RESULT FOR ${ticker}:\n\n` +
        `Decision: ${result.decision || "HOLD"}\n` +
        `Confidence: ${result.confidence || "medium"}\n\n` +
        `Summary: ${result.summary || "No summary provided."}\n\n` +
        `Remaining Balance: $${user.balance.toFixed(2)} USDC`;

      sendTelegramMessage(chatId, summaryText);
    } catch (err) {
      sendTelegramMessage(chatId, `Analysis failed: ${err.message}`);
    }
  } else if (text.startsWith("/law")) {
    const topic = text.slice(4).trim();
    if (!topic || topic.length < 5) {
      return sendTelegramMessage(chatId, "Usage: /law <topic>, e.g. /law debt collector calling at night");
    }

    if (user.balance < 0.05) {
      return sendTelegramMessage(chatId, "Insufficient balance! Please use /deposit to add funds.");
    }

    sendTelegramMessage(chatId, `Searching legal citations for: "${topic}"... Please wait.`);

    try {
      const result = await callAgentApi(ENDPOINTS.law, { topic, state: "federal-only", scope: "both" });
      user.balance -= 0.05;
      saveDB(db);

      let summaryText = `⚖️ LEGAL CITATIONS FOUND:\n\n`;
      if (result.federal_citations && result.federal_citations.length) {
        result.federal_citations.forEach((c) => {
          summaryText += `🔹 ${c.statute}: ${c.citation}\n*${c.section_title}*\n${c.summary}\n\n`;
        });
      } else {
        summaryText += `No specific federal citations found.\n\n`;
      }

      summaryText += `Disclaimer: ${result.disclaimer || "Not legal advice."}\n\nRemaining Balance: $${user.balance.toFixed(2)} USDC`;
      sendTelegramMessage(chatId, summaryText);
    } catch (err) {
      sendTelegramMessage(chatId, `Legal lookup failed: ${err.message}`);
    }
  } else if (text.startsWith("/scaffold")) {
    const goal = text.slice(9).trim();
    if (!goal || goal.length < 5) {
      return sendTelegramMessage(chatId, "Usage: /scaffold <project goal>, e.g. /scaffold Launching a SaaS startup");
    }

    if (user.balance < 0.15) {
      return sendTelegramMessage(chatId, "Insufficient balance! Please use /deposit to add funds.");
    }

    sendTelegramMessage(chatId, `Generating Obsidian vault scaffold for: "${goal}"... Please wait (~30s).`);

    try {
      const result = await callAgentApi(ENDPOINTS.scaffold, { goal });
      user.balance -= 0.15;
      saveDB(db);

      let summaryText = `📁 OBSIDIAN PROJECT SCAFFOLD GENERATED:\n\n`;
      if (result.files && result.files.length) {
        summaryText += `Successfully generated ${result.files.length} project documents and vault structure.\n\n`;
        result.files.slice(0, 5).forEach((f) => {
          summaryText += `📄 Path: \`${f.path}\` (${f.content ? f.content.length : 0} chars)\n`;
        });
        if (result.files.length > 5) {
          summaryText += `...and ${result.files.length - 5} more files.\n`;
        }
      } else {
        summaryText += `Scaffold returned empty or failed to generate files.\n`;
      }

      summaryText += `\nRemaining Balance: $${user.balance.toFixed(2)} USDC`;
      sendTelegramMessage(chatId, summaryText);
    } catch (err) {
      sendTelegramMessage(chatId, `Scaffolding failed: ${err.message}`);
    }
  } else {
    sendTelegramMessage(chatId, "Unknown command. Use /start to see instructions.");
  }
}

module.exports = { handleMessage };

// Polling loop for Telegram Bot when run directly
if (require.main === module) {
  if (TELEGRAM_TOKEN === "PLACEHOLDER_TOKEN") {
    console.error("[Telegram] TELEGRAM_BOT_TOKEN is not set.");
    process.exit(1);
  }
  console.log("[Telegram] Starting bot polling loop...");
  let lastUpdateId = 0;

  function poll() {
    const options = {
      hostname: "api.telegram.org",
      port: 443,
      path: `/bot${TELEGRAM_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=30`,
      method: "GET",
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", async () => {
        if (res.statusCode === 200) {
          try {
            const updates = JSON.parse(data).result || [];
            for (const update of updates) {
              lastUpdateId = Math.max(lastUpdateId, update.update_id);
              if (update.message) {
                const chatId = update.message.chat.id;
                const username = update.message.from.username || update.message.from.first_name || "User";
                const text = update.message.text || "";
                await handleMessage(chatId, username, text);
              }
            }
          } catch (e) {
            console.error("[Telegram] Poll parsing error:", e.message);
          }
        }
        setTimeout(poll, 1000);
      });
    });

    req.on("error", (e) => {
      console.error("[Telegram] Poll connection error:", e.message);
      setTimeout(poll, 5000);
    });

    req.end();
  }

  poll();
}
