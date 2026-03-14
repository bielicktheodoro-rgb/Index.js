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

// ================= CONFIG =================

const admins = [
"5542999496858@s.whatsapp.net",
"5542999010537@s.whatsapp.net"
];

const botNumber = "55429496858";
const usePairingCode = true;

const messageLog = new Map();

function isAdmin(sender){
return admins.includes(sender);
}

// ================= PREFIXO =================

function loadConfig(){
try{
if(fs.existsSync("./config.json")){
return JSON.parse(fs.readFileSync("./config.json"));
}
}catch{}
return {prefix:"."}
}

function saveConfig(config){
fs.writeFileSync("./config.json",JSON.stringify(config,null,2));
}

// ================= BOT =================

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
browser:["Limax","Chrome","1.0"],
markOnlineOnConnect:true
});

// ===== PAIRING CODE =====

if(usePairingCode && !state.creds.registered){

setTimeout(async()=>{

try{

console.log("Gerando código...");

const code = await sock.requestPairingCode(botNumber);

console.log("\n====================");
console.log("CODIGO:");
console.log(code.match(/.{1,4}/g).join("-"));
console.log("====================\n");

}catch(e){

console.log("Erro no código:",e)

}

},3000)

}

sock.ev.on("creds.update", saveCreds);

// ===== CONEXÃO =====

sock.ev.on("connection.update",(update)=>{

const {connection,lastDisconnect} = update;

if(connection==="open"){

console.log("BOT ONLINE");

for(let adm of admins){

sock.sendMessage(adm,{text:"✅ LIMAX BOT ONLINE"})

}

}

if(connection==="close"){

const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;

if(shouldReconnect){

startBot()

}

}

});

// ===== MENSAGENS =====

sock.ev.on("messages.upsert", async({messages})=>{

const msg = messages[0];
if(!msg.message) return;

const from = msg.key.remoteJid;
const sender = msg.key.participant || msg.key.remoteJid;
const isGroup = from.endsWith("@g.us");

// ===== ANTI DELETE =====

const isProtocol = msg.message.protocolMessage && msg.message.protocolMessage.type===0;

if(isProtocol){

const deletedId = msg.message.protocolMessage.key.id;

if(messageLog.has(deletedId)){

const deletedMsg = messageLog.get(deletedId);

for(let adm of admins){

await sock.sendMessage(adm,{forward:deletedMsg})

}

}

return;

}

messageLog.set(msg.key.id,msg);

setTimeout(()=>{

messageLog.delete(msg.key.id)

},120000);

// ===== TEXTO =====

const type = Object.keys(msg.message)[0];

const body =
type==="conversation" ? msg.message.conversation :
type==="extendedTextMessage" ? msg.message.extendedTextMessage.text :
type==="imageMessage" ? msg.message.imageMessage.caption :
type==="videoMessage" ? msg.message.videoMessage.caption :
"";

if(!body) return;

const command = body.split(" ")[0].toLowerCase();
const args = body.split(" ").slice(1);

// ===== MENU =====

if(command === ".menu"){

const menu = `⚡ LIMAX BOT ⚡

.s (sticker)
.teste
.perfil
.hidetag
.spam
.ban
.promote
.demote

Donos: ${admins.length}
`;

sock.sendMessage(from,{text:menu},{quoted:msg});

}

// ===== TESTE =====

if(command === ".teste"){

sock.sendMessage(from,{text:"✅ BOT FUNCIONANDO"},{quoted:msg})

}

// ===== STICKER =====

if(command === ".s"){

let image;

if(msg.message.imageMessage){
image = msg.message.imageMessage;
}

else if(msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage){

image = msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;

}

if(!image){

return sock.sendMessage(from,{text:"❌ marque uma imagem"})

}

const stream = await downloadContentFromMessage(image,"image");

let buffer = Buffer.from([]);

for await(const chunk of stream){

buffer = Buffer.concat([buffer,chunk])

}

sock.sendMessage(from,{sticker:buffer},{quoted:msg})

}

// ===== HIDETAG =====

if(command === ".hidetag"){

if(!isGroup) return;

const group = await sock.groupMetadata(from);

const members = group.participants.map(p=>p.id);

sock.sendMessage(from,{
text: args.join(" ") || "📢 ATENÇÃO",
mentions: members
})

}

// ===== SPAM =====

if(command === ".spam"){

if(!isAdmin(sender)) return;

const text = args.join(" ");

for(let i=0;i<20;i++){

await sock.sendMessage(from,{text:text})

await delay(400)

}

}

// ===== ADM =====

if((command === ".ban" || command === ".promote" || command === ".demote") && isGroup){

if(!isAdmin(sender)) return;

const target = msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0];

if(!target){

return sock.sendMessage(from,{text:"marque alguém"})

}

const action =
command === ".ban" ? "remove" :
command === ".promote" ? "promote" :
"demote";

await sock.groupParticipantsUpdate(from,[target],action);

}

// ===== PERFIL =====

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

sock.sendMessage(from,{
image:{url:pp},
caption:`👤 @${target.split("@")[0]}

Bio: ${bio}`,
mentions:[target]
})

}

});

}

startBot();
