const {
default: makeWASocket,
useMultiFileAuthState,
fetchLatestBaileysVersion,
DisconnectReason,
downloadContentFromMessage,
makeCacheableSignalKeyStore,
delay
} = require("@whiskeysockets/baileys")

const P = require("pino")
const fs = require("fs")

process.on("uncaughtException", err => console.log(err))
process.on("unhandledRejection", err => console.log(err))

const adminNumber = "SEUNUMERO@s.whatsapp.net"
const botNumber = "SEUNUMERO"

const messageLog = new Map()
const MAX_MESSAGES = 500

function saveMessage(id,msg){
if(messageLog.size >= MAX_MESSAGES){
const firstKey = messageLog.keys().next().value
messageLog.delete(firstKey)
}
messageLog.set(id,msg)
}

function loadConfig(){
try{
if(fs.existsSync("./config.json")){
return JSON.parse(fs.readFileSync("./config.json"))
}
}catch{}
return {prefix:".ver"}
}

function saveConfig(config){
fs.writeFileSync("./config.json",JSON.stringify(config,null,2))
}

async function startBot(){

const { state, saveCreds } = await useMultiFileAuthState("auth_limax")
const { version } = await fetchLatestBaileysVersion()

const sock = makeWASocket({
version,
logger: P({level:"silent"}),
auth:{
creds: state.creds,
keys: makeCacheableSignalKeyStore(state.keys,P())
},
browser:["Ubuntu","Chrome","20.0"],
markOnlineOnConnect:true
})

if(!sock.authState.creds.registered){
setTimeout(async()=>{
const code = await sock.requestPairingCode(botNumber)
console.log("CODIGO:",code?.match(/.{1,4}/g)?.join("-"))
},3000)
}

sock.ev.on("creds.update",saveCreds)

sock.ev.on("connection.update",update=>{
const {connection,lastDisconnect}=update

if(connection==="open"){
console.log("BOT ONLINE")
}

if(connection==="close"){
const shouldReconnect =
lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

if(shouldReconnect){
console.log("Reconectando...")
setTimeout(startBot,5000)
}
}
})

sock.ev.on("messages.upsert",async ({messages})=>{

const msg = messages[0]
if(!msg.message) return

const from = msg.key.remoteJid
const msgId = msg.key.id

saveMessage(msgId,msg)

const messageType = Object.keys(msg.message)[0]

const body =
messageType==="conversation" ? msg.message.conversation :
messageType==="extendedTextMessage" ? msg.message.extendedTextMessage.text :
messageType==="imageMessage" ? msg.message.imageMessage.caption :
messageType==="videoMessage" ? msg.message.videoMessage.caption :
""

if(!body) return

const command = body.trim().split(" ")[0].toLowerCase()
const args = body.split(" ").slice(1)

const isGroup = from.endsWith("@g.us")

if(command===".menu"){

const menu = `
╔═══════ LIMAX BOT ═══════╗

⚡ COMANDOS

.s = criar figurinha
.ping = velocidade
.info = status do bot
.hidetag = marcar todos
.spam = flood
.restart = reiniciar
.perfil = stalk

══════════════════════════
`

await sock.sendMessage(from,{text:menu},{quoted:msg})

}

if(command===".ping"){

const start = Date.now()

await sock.sendMessage(from,{text:"🏓 testando..."})

const end = Date.now()

await sock.sendMessage(from,{
text:`⚡ velocidade: ${end-start}ms`
})

}

if(command===".info"){

const uptime = process.uptime()

await sock.sendMessage(from,{
text:`
BOT STATUS

online: ${Math.floor(uptime/60)} minutos
ram: ${(process.memoryUsage().heapUsed/1024/1024).toFixed(2)} MB
`
})

}

if(command===".restart"){

await sock.sendMessage(from,{text:"reiniciando..."})
process.exit()

}

if(command===".s"){

let imageMessage

if(msg.message.imageMessage){
imageMessage = msg.message.imageMessage
}

if(msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage){
imageMessage =
msg.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage
}

if(!imageMessage){
return sock.sendMessage(from,{text:"mande imagem com .s"})
}

const stream = await downloadContentFromMessage(imageMessage,"image")

let buffer = Buffer.from([])

for await(const chunk of stream){
buffer = Buffer.concat([buffer,chunk])
}

await sock.sendMessage(from,{sticker:buffer},{quoted:msg})

}

if(command===".hidetag"){

if(!isGroup) return

const metadata = await sock.groupMetadata(from)

const participants = metadata.participants.map(p=>p.id)

await sock.sendMessage(from,{
text: args.join(" ") || "atenção geral",
mentions: participants
})

}

if(command===".spam"){

const sender = msg.key.participant || msg.key.remoteJid

if(!sender.includes(adminNumber.replace("@s.whatsapp.net",""))) return

const text = args.join(" ")

for(let i=0;i<15;i++){

await sock.sendMessage(from,{text:text})

await delay(500)

}

}

if(command===".perfil"){

let target =
msg.message.extendedTextMessage?.contextInfo?.mentionedJid?.[0] ||
msg.key.participant ||
from

let pp

try{
pp = await sock.profilePictureUrl(target,"image")
}catch{
pp = "https://i.imgur.com/85q5jQt.png"
}

await sock.sendMessage(from,{
image:{url:pp},
caption:`👤 @${target.split("@")[0]}`,
mentions:[target]
})

}

})

}

startBot()
