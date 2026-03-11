const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    downloadContentFromMessage,
    makeCacheableSignalKeyStore,
    delay
} = require("@whiskeysockets/baileys");

const P = require("pino");
const fs = require("fs");

// =======================================================
// ⚙️ CONFIGURAÇÕES DO LIMAX BOT
// =======================================================

const adminNumber = "55429496858@s.whatsapp.net";
const botNumber = "55429496858";
const usePairingCode = true;

// [RAFAX SYSTEM] MEMÓRIA RAM PARA O ANTI-DELETE
const messageLog = new Map();

// =======================================================
// 🔧 SISTEMA DE PREFIXO (salva automaticamente)
// =======================================================

function loadConfig() {
    try {
        if (fs.existsSync("./config.json")) {
            const data = fs.readFileSync("./config.json", "utf8");
            return JSON.parse(data);
        }
    } catch (e) {}
    return { prefix: ".ver" };
}

function saveConfig(config) {
    try {
        fs.writeFileSync("./config.json", JSON.stringify(config, null, 2));
    } catch (e) {
        console.log("Erro ao salvar config:", e);
    }
}

// =======================================================

async function startBot() {

    const { state, saveCreds } = await useMultiFileAuthState("auth_limax");
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: P({ level: "silent" }),
        printQRInTerminal: !usePairingCode,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, P({ level: "fatal" }).child({ level: "fatal" })),
        },
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        markOnlineOnConnect: true
    });

    if (usePairingCode && !sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                console.log(`\n⏳ Solicitando código de emparelhamento para: ${botNumber}...`);
                const code = await sock.requestPairingCode(botNumber);
                console.log(`\n===================================================`);
                console.log(`🔒 SEU CÓDIGO DE CONEXÃO:  \x1b[32m${code?.match(/.{1,4}/g)?.join("-") || code}\x1b[0m`);
                console.log(`===================================================\n`);
            } catch (e) {
                console.log("❌ Erro ao pedir o código.", e);
            }
        }, 3000);
    }

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
            console.log("✅ LIMAX BOT TÁ ON!");
            await sock.sendMessage(adminNumber, { text: "✅ LIMAX BOT TÁ ON!"});
        }

        if (connection === "close") {
            const shouldReconnect =
                lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log("❌ Caiu. Reconectando...");
            if (shouldReconnect) startBot();
        }
    });

   sock.ev.on("messages.upsert", async ({ messages }) => {

        const msg = messages[0];
        if (!msg.message) return;

        const from = msg.key.remoteJid;
        const msgId = msg.key.id;

        // =======================================================
        // 🚫 1. ANTI-DELETE (RECUPERAR MENSAGENS APAGADAS)
        // =======================================================
        const isProtocol = msg.message.protocolMessage && msg.message.protocolMessage.type === 0;

        if (isProtocol) {
            const deletedKeyId = msg.message.protocolMessage.key.id;
            console.log(`[😈] Anti-Delete acionado para ID: ${deletedKeyId}`);

            if (messageLog.has(deletedKeyId)) {
                const deletedMsg = messageLog.get(deletedKeyId);
                if (deletedMsg.key.fromMe) return;

                const participant = deletedMsg.key.participant || deletedMsg.key.remoteJid;
                const captionAntiDelete = `
🚫 *ANTI-DELETE DETECTADO* 🚫
👤 *Quem:* @${participant.split('@')[0]}
🕒 *Hora:* ${new Date().toLocaleTimeString()}

📝 *Mensagem Apagada:*
👇👇👇`;

                try {
                    await sock.sendMessage(adminNumber, { // Manda pro ADMIN (ou mude para 'from' para mandar no grupo)
                        forward: deletedMsg, 
                        contextInfo: { isForwarded: true, stanzaId: deletedMsg.key.id, participant: participant, quotedMessage: deletedMsg.message }
                    });
                    await sock.sendMessage(adminNumber, { text: captionAntiDelete, mentions: [participant] });
                } catch (e) {
                    console.log("Erro Anti-Delete:", e);
                }
            }
            return;
        }

        // Salva mensagem normal na memória
        messageLog.set(msgId, msg);
        setTimeout(() => { if (messageLog.has(msgId)) messageLog.delete(msgId); }, 120000);


        // =======================================================
        // ☢️ 2. AUTO-EXPOSE (VISUALIZAÇÃO ÚNICA AUTOMÁTICA)
        // =======================================================
        // Se a mensagem for ViewOnce, o bot rouba na hora sem precisar de comando
        const isViewOnce = msg.message?.viewOnceMessageV2 || msg.message?.viewOnceMessage;

        if (isViewOnce) {
            console.log("🙈 Mídia de Visualização Única detectada! Explanando...");
            try {
                let viewOnceMsg = msg.message.viewOnceMessageV2?.message || msg.message.viewOnceMessage?.message;
                let mediaType = Object.keys(viewOnceMsg)[0];
                if (mediaType === 'messageContextInfo') mediaType = Object.keys(viewOnceMsg).find(k => k !== 'messageContextInfo');

                let mediaContent = viewOnceMsg[mediaType];
                let streamType = mediaType.includes('video') ? 'video' : mediaType.includes('audio') ? 'audio' : 'image';

                const stream = await downloadContentFromMessage(mediaContent, streamType);
                let buffer = Buffer.from([]);
                for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                const participant = msg.key.participant || msg.key.remoteJid;

                // REENVIA NO GRUPO (AUTO-EXPOSE)
                if (streamType === 'audio') {
                    await sock.sendMessage(from, { 
                        audio: buffer, mimetype: 'audio/mpeg', ptt: true,
                        contextInfo: { mentionedJid: [participant] }
                    }, { quoted: msg });
                } else {
                    await sock.sendMessage(adminNumber, { 
                        [streamType]: buffer, 
                        caption: `🙈 *ACHOU QUE ERA SEGREDO?* \n👤 De: @${participant.split('@')[0]}\n\n_Auto-Expose by Limax_`,
                        contextInfo: { mentionedJid: [participant] }
                    }, { quoted: msg });
                }
                return; // Para aqui pra não processar como comando duplicado

            } catch (e) {
                console.log("Erro no Auto-Expose:", e);
            }
        }

        // =======================================================
        // 3. COMANDOS NORMAIS DO BOT
        // =======================================================

        const messageType = Object.keys(msg.message)[0];
        const body =
            messageType === "conversation" ? msg.message.conversation
            : messageType === "extendedTextMessage" ? msg.message.extendedTextMessage.text
            : messageType === "imageMessage" ? msg.message.imageMessage.caption
            : messageType === "videoMessage" ? msg.message.videoMessage.caption
            : "";

        if (!body) return;

        const command = body.trim().split(" ")[0].toLowerCase();
        const args = body.trim().split(" ").slice(1);
        const isGroup = from.endsWith('@g.us');

        // --- .S (STICKER) ---
        if (command === ".s") {
            try {
                let imageMessage;
                if (msg.message.imageMessage) imageMessage = msg.message.imageMessage;
                else if (msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
                    imageMessage = msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
                }
                if (!imageMessage) return sock.sendMessage(from, { text: '❌ | Manda foto com legenda .s'}, { quoted: msg });

                console.log("🎨 Criando sticker...");
                const stream = await downloadContentFromMessage(imageMessage, 'image');
                let buffer = Buffer.from([]);
                for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                await sock.sendMessage(from, { sticker: buffer }, { quoted: msg });
            } catch (e) {
                console.log("Erro sticker:", e);
            }
        }

        // --- !PREFIXO ---
        if (command === "!prefixo") {
            const config = loadConfig();
            if (args.length === 0) return sock.sendMessage(adminNumber, { text: `📌 Prefixo atual: ${config.prefix}\nUse: !prefixo [novo]`});
            config.prefix = args[0];
            saveConfig(config);
            return sock.sendMessage(adminNumber, { text: `✅ Prefixo alterado para: ${args[0]}`});
        }

     // --- COMANDO .MENU ORGANIZADO BY: ItsLimax ---

if (command === ".menu") {
    const config = loadConfig();
    const manualPrefix = config.prefix; // Gatilho de roubo manual

    const menuText = `
╔════════════════════════╗
  ⚡ 𝕃𝕀𝕄𝔸𝕏 𝔹𝕆𝕋 𝕍𝕀ℙ ⚡
╚════════════════════════╝

👑 *DESENVOLVEDOR:* ItsLimax
📌 *PREFIXO FIXO:* [ . ]
🕵️ *GATILHO ROUBO:* [ ${manualPrefix} ]

🔥 *FUNÇÕES AUTOMÁTICAS:*
└─ 🚫 Anti-Delete (ATIVADO)

🛠️ *COMANDOS DE MÍDIA:*
│ ➥ ${manualPrefix} (Roubar Manualmente)
│ ➥ .s (Criar Figurinha)

🕵️ *STALKER & STATUS:*
│ ➥ .perfil (Ficha do Alvo)
│ ➥ .teste (Verificar Conexão)

💣 *MODO CAOS & ADM:*
│ ➥ .hidetag (Marcar Todos)
│ ➥ .spam (Floodar Chat)
│ ➥ .ban (Banir Usuário)
│ ➥ .promote (Dar ADM)
│ ➥ .demote (Tirar ADM)

⚙️ *CONFIGURAÇÃO:*
│ ➥ !prefixo [novo] (Muda o gatilho de roubo)

━━━━━━━━━━━━━━━━
⚠️ By: ItsLimax / Cv fofo
━━━━━━━━━━━━━━━━`;

    await sock.sendMessage(from, { 
        image: { url: "https://i.imgur.com/85q5jQt.png" }, 
        caption: menuText 
    }, { quoted: msg });
}
        // --- .TESTE ---
        if (command === ".teste") {
            return sock.sendMessage(adminNumber, { text: "✅ | Bot Online e Operante." }, { quoted: msg });
        }

        // --- .HIDETAG ---
        if (command === ".hidetag" || command === ".todos" || command === ".aviso") {
            if (!isGroup) return sock.sendMessage(from, { text: '❌ | Só em grupo.' });
            try {
                const groupMetadata = await sock.groupMetadata(from);
                const participants = groupMetadata.participants.map(p => p.id);
                const text = args.join(" ") || "📣 ATENÇÃO GERAL!";
                await sock.sendMessage(from, { text: text, mentions: participants });
            } catch (e) { console.log("Erro hidetag:", e); }
        }

        // --- .PERFIL ---
        if (command === ".perfil" || command === ".stalk") {
            let target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] || 
                         msg.message.extendedTextMessage?.contextInfo?.participant || 
                         msg.key.participant || from;
            try {
                let ppUrl = "https://i.imgur.com/85q5jQt.png";
                try { ppUrl = await sock.profilePictureUrl(target, 'image'); } catch {}
                let status = "Sem status";
                try { status = (await sock.fetchStatus(target)).status; } catch {}
                
                await sock.sendMessage(adminNumber, { 
                    image: { url: ppUrl }, 
                    caption: `🕵️ *FICHA*\n👤 @${target.split('@')[0]}\n📝 Bio: ${status}`, 
                    mentions: [target] 
                }, { quoted: msg });
            } catch (e) { console.log("Erro stalker:", e); }
        }

        // --- .SPAM ---
        if (command === ".spam" || command === ".flood") {
            const text = args.join(" ");
            if (!text) return sock.sendMessage(from, { text: '❌ Digita o texto.' });
            const sender = msg.key.participant || msg.key.remoteJid;
            const adminClean = adminNumber.replace('@s.whatsapp.net', '');
            if (!sender.includes(adminClean) && !msg.key.fromMe) return sock.sendMessage(from, { text: '❌ Só o dono.' });

            for(let i=0; i<20; i++) {
                await sock.sendMessage(from, { text: text });
                await delay(500);
            }
        }

        // --- ADMS ---
        if ((command === ".ban" || command === ".promote" || command === ".demote") && isGroup) {
            const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
            if (!target) return sock.sendMessage(from, { text: '❌ Marca alguém.' });
            const action = command === ".ban" ? "remove" : command === ".promote" ? "promote" : "demote";
            try {
                await sock.groupParticipantsUpdate(from, [target], action);
                await sock.sendMessage(from, { text: `✅ Sucesso: ${action}` });
            } catch(e) { sock.sendMessage(from, { text: '❌ Erro (Sem permissão?)' }); }
        }

        // --- ROUBAR MANUALMENTE (PREFIXO) ---
        const config = loadConfig();
        if (command === config.prefix) {
            const quotedMsg = msg.message.extendedTextMessage?.contextInfo?.quotedMessage;
            if (!quotedMsg) return sock.sendMessage(adminNumber, { text: '❌ Marca a mídia.' });

            try {
                let viewOnceMsg = quotedMsg.viewOnceMessageV2?.message || quotedMsg.viewOnceMessage?.message || quotedMsg;
                let mediaType = Object.keys(viewOnceMsg)[0];
                if (mediaType === 'messageContextInfo') mediaType = Object.keys(viewOnceMsg).find(k => k !== 'messageContextInfo');

                let streamType = mediaType.includes('video') ? 'video' : mediaType.includes('audio') ? 'audio' : 'image';
                let mediaContent = viewOnceMsg[mediaType];

                if (!mediaContent) return;

                console.log(`😈 Roubando ${streamType} manualmente...`);
                const stream = await downloadContentFromMessage(mediaContent, streamType);
                let buffer = Buffer.from([]);
                for await(const chunk of stream) buffer = Buffer.concat([buffer, chunk]);

                if (streamType === 'audio') {
                    await sock.sendMessage(adminNumber, { audio: buffer, mimetype: 'audio/mpeg', ptt: true });
                } else {
                    await sock.sendMessage(adminNumber, { [streamType]: buffer, caption: '💀 Roubado Manualmente!' });
                }
            } catch (e) {
                console.log("Erro roubo manual:", e);
            }
        }
    });
}

startBot();
