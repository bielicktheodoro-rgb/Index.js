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

const admins = [
"554299496858@s.whatsapp.net",
"554299010537@s.whatsapp.net"
];

const botNumber = "SEU_NUMERO_AQUI";
const usePairingCode = true;

const messageLog = new Map();

function isAdmin(sender){
return admins.includes(sender);
}

// =======================================================
// PREFIXO
// =======================================================

function loadConfig(){
try{
if(fs.existsSync("./config.json")){
return JSON.parse(fs.readFileSync("./config.json"));
}
}catch{}
return { prefix: ".ver" };
}

function saveConfig(config){
fs.writeFileSync("./config.json", JSON.stringify(config,null,2));
}

// =======================================================

async function startBot(){

const { state, saveCreds } = await useMultiFileAuthState("auth_limax");
const { version } = await fetchLatestBaileysVersion();

const sock = makeWASocket({
version,
logger: P({level:"silent"}),
printQRInTerminal: !usePairingCode,
auth:{
creds: state.creds,
keys: makeCacheableSignalKeyStore(state.keys,P({level:"fatal"}))
},
browser:["Ubuntu","Chrome","20.0.04"],
markOnlineOnConnect:true
});

// pairing

if(usePairingCode && !sock.authState.creds.registered){

setTimeout(async()=>{
const code = await sock.requestPairingCode(botNumber);

console.log("\n🔑 CODIGO:");
console.log(code.match(/.{1,4}/g).join("-"));

},3000)

}

sock.ev.on("creds.update", saveCreds);

// conexão

sock.ev.on("connection.update", async(update)=>{

const {connection,lastDisconnect} = update;

if(connection==="open"){

console.log("BOT ONLINE");

for(let adm of admins){
await sock.sendMessage(adm,{text:"✅ LIMAX BOT ONLINE"});
}

}

if(connection==="close"){

const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

if(shouldReconnect){
startBot();
}

}

});

// =======================================================
// MENSAGENS
// =======================================================

sock.ev.on("messages.upsert", async({messages})=>{

const msg = messages[0];
if(!msg.message) return;

const from = msg.key.remoteJid;
const msgId = msg.key.id;

// =======================================================
// ANTI DELETE
// =======================================================

const isProtocol = msg.message.protocolMessage && msg.message.protocolMessage.type===0;

if(isProtocol){

const deletedKeyId = msg.message.protocolMessage.key.id;

if(messageLog.has(deletedKeyId)){

const deletedMsg = messageLog.get(deletedKeyId);

for(let adm of admins){

await sock.sendMessage(adm,{
forward: deletedMsg
})

}

}

return;

}

messageLog.set(msgId,msg);

setTimeout(()=>{

messageLog.delete(msgId)

},120000);

// =======================================================
// TEXTO
// =======================================================

const messageType = Object.keys(msg.message)[0];

const body =
messageType==="conversation" ? msg.message.conversation :
messageType==="extendedTextMessage" ? msg.message.extendedTextMessage.text :
messageType==="imageMessage" ? msg.message.imageMessage.caption :
messageType==="videoMessage" ? msg.message.videoMessage.caption :
"";

if(!body) return;

const command = body.trim().split(" ")[0].toLowerCase();
const args = body.trim().split(" ").slice(1);
const isGroup = from.endsWith("@g.us");

const sender = msg.key.participant || msg.key.remoteJid;

// =======================================================
// MENU
// =======================================================

if(command === ".menu"){

const menu = `⚡ LIMAX BOT ⚡

.comandos

.s
.teste
.perfil
.hidetag
.spam
.ban
.promote
.demote
`;

await sock.sendMessage(from,{text:menu},{quoted:msg});

}

// =======================================================
// TESTE
// =======================================================

if(command === ".teste"){

await sock.sendMessage(from,{text:"✅ BOT FUNCIONANDO"},{quoted:msg})

}

// =======================================================
// STICKER
// =======================================================

if(command === ".s"){

let imageMessage;

if(msg.message.imageMessage){
imageMessage = msg.message.imageMessage;
}

else if(msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage){

imageMessage = msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;

}

if(!imageMessage){
return sock.sendMessage(from,{text:"❌ marque uma imagem"})
}

const stream = await downloadContentFromMessage(imageMessage,"image");

let buffer = Buffer.from([]);

for await(const chunk of stream){

buffer = Buffer.concat([buffer,chunk])

}

await sock.sendMessage(from,{sticker:buffer},{quoted:msg})

}

// =======================================================
// HIDETAG
// =======================================================

if(command === ".hidetag"){

if(!isGroup) return;

const group = await sock.groupMetadata(from);

const members = group.participants.map(p=>p.id);

await sock.sendMessage(from,{
text: args.join(" ") || "📢 ATENÇÃO",
mentions: members
})

}

// =======================================================
// SPAM
// =======================================================

if(command === ".spam"){

if(!isAdmin(sender)) return;

const text = args.join(" ");

for(let i=0;i<20;i++){

await sock.sendMessage(from,{text:text})

await delay(400)

}

}

// =======================================================
// ADM
// =======================================================

if((command === ".ban" || command === ".promote" || command === ".demote") && isGroup){

if(!isAdmin(sender)) return;

const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

if(!target) return sock.sendMessage(from,{text:"marque alguém"});

const action =
command === ".ban" ? "remove" :
command === ".promote" ? "promote" :
"demote";

await sock.groupParticipantsUpdate(from,[target],action);

}

// =======================================================
// PERFIL
// =======================================================

if(command === ".perfil"){

let target =
msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
msg.key.participant ||
from;

let pp = "https://i.imgur.com/85q5jQt.png";

try{
pp = await sock.profilePictureUrl(target,"image");
}catch{}

let bio = "sem bio";

try{
bio = (await sock.fetchStatus(target)).status
}catch{}

await sock.sendMessage(from,{
image:{url:pp},
caption:`👤 @${target.split("@")[0]}

bio: ${bio}`,
mentions:[target]
})

}

});

}

startBot();
