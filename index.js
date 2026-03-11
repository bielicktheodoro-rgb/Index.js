const {
default: makeWASocket,
useMultiFileAuthState,
fetchLatestBaileysVersion,
DisconnectReason,
downloadContentFromMessage
} = require("@whiskeysockets/baileys")

const P = require("pino")
const fs = require("fs")

const ytdl = require("ytdl-core")
const yts = require("yt-search")

const { Tiktok } = require("tiktokdl-core")

const OpenAI = require("openai")

const openai = new OpenAI({
apiKey: "SUA_API_KEY_AQUI"
})

const adminNumber = "SEUNUMERO@s.whatsapp.net"

const messageLog = new Map()

async function startBot(){

const { state, saveCreds } = await useMultiFileAuthState("auth")
const { version } = await fetchLatestBaileysVersion()

const sock = makeWASocket({
version,
logger: P({ level: "silent" }),
auth: state
})

sock.ev.on("creds.update", saveCreds)

sock.ev.on("connection.update",(update)=>{

const { connection,lastDisconnect } = update

if(connection==="open"){
console.log("BOT ONLINE")
}

if(connection==="close"){
const shouldReconnect =
lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

if(shouldReconnect) startBot()
}

})

sock.ev.on("messages.upsert",async({messages})=>{

const msg = messages[0]
if(!msg.message) return

const from = msg.key.remoteJid
const msgId = msg.key.id

const sender = msg.key.participant || msg.key.remoteJid

// salva mensagem
messageLog.set(msgId,msg)

setTimeout(()=>{
messageLog.delete(msgId)
},120000)


// -----------------------------
// ANTI DELETE
// -----------------------------

const isProtocol = msg.message.protocolMessage

if(isProtocol){

const deletedId = msg.message.protocolMessage.key.id

if(messageLog.has(deletedId)){

const deletedMsg = messageLog.get(deletedId)

await sock.sendMessage(adminNumber,{
text:`🚫 MENSAGEM APAGADA

👤 ${sender}
`
})

await sock.sendMessage(adminNumber,{
forward:deletedMsg
})

}

return
}


// -----------------------------
// pegar texto
// -----------------------------

const type = Object.keys(msg.message)[0]

let body = ""

if(type==="conversation") body = msg.message.conversation
if(type==="extendedTextMessage") body = msg.message.extendedTextMessage.text

if(!body) return

const command = body.split(" ")[0].toLowerCase()
const args = body.split(" ").slice(1)


// -----------------------------
// TESTE
// -----------------------------

if(command===".teste"){

await sock.sendMessage(from,{
text:"✅ Bot funcionando"
},{quoted:msg})

}


// -----------------------------
// TIKTOK
// -----------------------------

if(command===".tiktok"){

const url = args[0]

if(!url) return sock.sendMessage(from,{text:"Envie o link"})

try{

const data = await Tiktok(url)

await sock.sendMessage(from,{
video:{ url:data.video.noWatermark },
caption:"🎵 TikTok baixado"
},{quoted:msg})

}catch{

sock.sendMessage(from,{text:"Erro ao baixar"})
}

}


// -----------------------------
// YOUTUBE MUSIC
// -----------------------------

if(command===".play"){

const query = args.join(" ")

if(!query) return sock.sendMessage(from,{text:"Digite o nome da música"})

const search = await yts(query)

const video = search.videos[0]

const stream = ytdl(video.url,{filter:"audioonly"})

await sock.sendMessage(from,{
audio:stream,
mimetype:"audio/mpeg"
},{quoted:msg})

}


// -----------------------------
// IA
// -----------------------------

if(command===".ia"){

const pergunta = args.join(" ")

if(!pergunta) return

const response = await openai.chat.completions.create({
model:"gpt-4o-mini",
messages:[
{role:"user",content:pergunta}
]
})

const reply = response.choices[0].message.content

await sock.sendMessage(from,{text:reply},{quoted:msg})

}

})

}

startBot()console.log("==============")

}, 3000)

}

sock.ev.on("connection.update", ({connection,lastDisconnect})=>{

if(connection==="open"){
console.log("BOT ONLINE")
}

if(connection==="close"){

const shouldReconnect =
lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut

if(shouldReconnect){
startBot()
}

}

})

sock.ev.on("messages.upsert", async ({messages})=>{

const msg = messages[0]
if(!msg.message) return

const from = msg.key.remoteJid

const type = Object.keys(msg.message)[0]

const body =
type==="conversation"? msg.message.conversation :
type==="extendedTextMessage"? msg.message.extendedTextMessage.text :
type==="imageMessage"? msg.message.imageMessage.caption :
""

if(!body) return

const command = body.split(" ")[0].toLowerCase()
const args = body.split(" ").slice(1)


// MENU

if(command===".menu"){

const menu = `
╔════ LIMAX BOT ════╗

📥 DOWNLOAD
.play
.tiktok
.insta

🎨 MÍDIA
.s
.toimg

🧠 UTILIDADES
.calcular
.traduzir
.qrcode
.lembrete

⚙️ BOT
.ping
.info
.restart

═══════════════════
`

sock.sendMessage(from,{text:menu},{quoted:msg})

}


// PING

if(command===".ping"){
sock.sendMessage(from,{text:"🏓 pong"})
}


// INFO

if(command===".info"){

sock.sendMessage(from,{
text:`🤖 LIMAX BOT

status: online
ram: ${(process.memoryUsage().heapUsed/1024/1024).toFixed(2)} MB`
})

}


// RESTART

if(command===".restart"){
sock.sendMessage(from,{text:"reiniciando"})
process.exit()
}


// CALCULADORA

if(command===".calcular"){

try{

const conta = args.join(" ")
const resultado = eval(conta)

sock.sendMessage(from,{text:`resultado: ${resultado}`})

}catch{

sock.sendMessage(from,{text:"erro na conta"})

}

}


// TRADUZIR

if(command===".traduzir"){

const text = args.join(" ")

sock.sendMessage(from,{
text:`tradução:\n${text}`
})

}


// QR CODE

if(command===".qrcode"){

const text = args.join(" ")

const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${text}`

sock.sendMessage(from,{
image:{url:url},
caption:"QR Code"
})

}


// LEMBRETE

if(command===".lembrete"){

const tempo = parseInt(args[0])
const texto = args.slice(1).join(" ")

sock.sendMessage(from,{text:"lembrete criado"})

setTimeout(()=>{

sock.sendMessage(from,{
text:`⏰ lembrete:\n${texto}`
})

},tempo*1000)

}


// STICKER

if(command===".s"){

let image = msg.message.imageMessage

if(!image){
return sock.sendMessage(from,{text:"mande uma imagem com .s na legenda"})
}

const stream = await downloadContentFromMessage(image,"image")

let buffer = Buffer.from([])

for await(const chunk of stream){
buffer = Buffer.concat([buffer,chunk])
}

sock.sendMessage(from,{sticker:buffer},{quoted:msg})

}


// STICKER → IMG

if(command===".toimg"){

const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage

if(!quoted) return sock.sendMessage(from,{text:"marque uma figurinha"})

const stream = await downloadContentFromMessage(quoted,"sticker")

let buffer = Buffer.from([])

for await(const chunk of stream){
buffer = Buffer.concat([buffer,chunk])
}

sock.sendMessage(from,{image:buffer},{quoted:msg})

}


// PLAY

if(command===".play"){

const nome = args.join(" ")

sock.sendMessage(from,{
text:`🎵 buscando música: ${nome}`
})

}


// TIKTOK

if(command===".tiktok"){
sock.sendMessage(from,{text:"📥 baixando vídeo do tiktok..."})
}


// INSTAGRAM

if(command===".insta"){
sock.sendMessage(from,{text:"📥 baixando vídeo do instagram..."})
}

})

}

startBot()
