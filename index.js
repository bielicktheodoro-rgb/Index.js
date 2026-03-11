const {
default: makeWASocket,
useMultiFileAuthState,
fetchLatestBaileysVersion,
DisconnectReason,
downloadContentFromMessage
} = require("@whiskeysockets/baileys")

const P = require("pino")
const axios = require("axios")

const owner = "554299496858@s.whatsapp.net"
const botNumber = "554299496858"

async function startBot(){

const { state, saveCreds } = await useMultiFileAuthState("auth")
const { version } = await fetchLatestBaileysVersion()

const sock = makeWASocket({
version,
logger: P({level:"silent"}),
auth: state,
browser:["LIMAX BOT","Chrome","1.0"]
})

sock.ev.on("creds.update", saveCreds)

sock.ev.on("connection.update", ({connection})=>{
if(connection==="open"){
console.log("🤖 BOT ONLINE")
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
type==="videoMessage"? msg.message.videoMessage.caption :
""

if(!body) return

const command = body.split(" ")[0].toLowerCase()
const args = body.split(" ").slice(1)


// MENU
if(command===".menu"){

const menu = `
╔════ LIMAX BOT V1 ════╗

📥 DOWNLOAD
.play
.tiktok
.insta

🎨 MÍDIA
.s
.toimg

🎮 DIVERSÃO
.ship
.gay
.casamento
.tapa
.beijar

🧠 UTILIDADES
.calcular
.traduzir
.qrcode
.lembrete
.clima

⚙️ BOT
.ping
.info
.restart

╚══════════════════════╝
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
text:`
🤖 LIMAX BOT

⚡ status: online
💾 RAM: ${(process.memoryUsage().heapUsed/1024/1024).toFixed(2)} MB
`
})

}


// RESTART
if(command===".restart"){
sock.sendMessage(from,{text:"♻️ reiniciando"})
process.exit()
}


// CALCULAR
if(command===".calcular"){

try{

const conta = args.join(" ")
const resultado = eval(conta)

sock.sendMessage(from,{
text:`🧮 Resultado: ${resultado}`
})

}catch{
sock.sendMessage(from,{text:"erro na conta"})
}

}


// TRADUZIR
if(command===".traduzir"){

const text = args.join(" ")

sock.sendMessage(from,{
text:`🌎 Tradução:\n${text}`
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

sock.sendMessage(from,{
text:`⏰ lembrete criado`
})

setTimeout(()=>{

sock.sendMessage(from,{
text:`🔔 Lembrete:\n${texto}`
})

},tempo*1000)

}


// STICKER
if(command===".s"){

let image

if(msg.message.imageMessage){
image = msg.message.imageMessage
}

if(!image){
return sock.sendMessage(from,{text:"mande imagem com .s"})
}

const stream = await downloadContentFromMessage(image,"image")

let buffer = Buffer.from([])

for await(const chunk of stream){
buffer = Buffer.concat([buffer,chunk])
}

sock.sendMessage(from,{sticker:buffer},{quoted:msg})

}


// FIGURINHA PARA IMG
if(command===".toimg"){

const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage

if(!quoted) return sock.sendMessage(from,{text:"marque figurinha"})

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
text:`🔎 buscando música: ${nome}`
})

}


// TIKTOK
if(command===".tiktok"){

sock.sendMessage(from,{
text:"📥 baixando vídeo do tiktok"
})

}


// INSTAGRAM
if(command===".insta"){

sock.sendMessage(from,{
text:"📥 baixando vídeo do instagram"
})

}


// SHIP
if(command===".ship"){

sock.sendMessage(from,{
text:`💘 Compatibilidade: ${Math.floor(Math.random()*100)}%`
})

}


// GAY
if(command===".gay"){

sock.sendMessage(from,{
text:`🏳️‍🌈 Nível gay: ${Math.floor(Math.random()*100)}%`
})

}


// CASAMENTO
if(command===".casamento"){

sock.sendMessage(from,{
text:`💍 Chance de casar: ${Math.floor(Math.random()*100)}%`
})

}


// TAPA
if(command===".tapa"){

sock.sendMessage(from,{
text:"👋 *TAPA!*"
})

}


// BEIJAR
if(command===".beijar"){

sock.sendMessage(from,{
text:"💋 *BEIJO!*"
})

}


// CLIMA
if(command===".clima"){

const cidade = args.join(" ")

sock.sendMessage(from,{
text:`🌤 clima em ${cidade}: 25°C`
})

}

})

}

startBot()
