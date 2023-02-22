////////////////////////////////////////////////////////////////////////////////////////
//author: Quskian
//email: ad@tarbase.com
//version: 1.0
//description: bot that connects to voice channel using discord.js v14
//dependencies: discord.js v14, discord-speech-recognition, @discordjs/voice, dotenv, openai, gtts
//usage: node discordChatGPTVoiceBot.js
//notes:
// 1. create a .env file with the following variables:
// botDiscId=your bot id
// channelId=your channel id
// guildId=your guild id
// OPENAI_API_KEY=your openai api key
// 2. create a tmp folder in the same folder as the bot
// 3. install all dependencies
// 4. run the bot using node discordChatGPTVoiceBot.js. Bot should join the channel and start listening to speech
// 5. Join the channel to hear a personalized greeting from the bot
// 6. Say the trigger word "reply" to get a response from the bot
////////////////////////////////////////////////////////////////////////////////////////
const { Client, GatewayIntentBits} = require('discord.js')
const { addSpeechEvent } = require("discord-speech-recognition");
const { joinVoiceChannel } = require('@discordjs/voice');
const { createAudioPlayer } = require('@discordjs/voice');
const { createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
var fs = require('fs');
const { Configuration, OpenAIApi } = require("openai");
const gTTS = require('gtts');
const { count } = require('console');
require('dotenv').config()

// take this value as script argument

const botDiscId=process.env.botDiscId
const channelId=process.env.channelId
const guildId=process.env.guildId
const gptModel="text-davinci-003"; // update this to use a different model. Available models: https://beta.openai.com/docs/engines
//const gptModel="curie:ft-personal-2023-02-13-20-57-55"
const Temperature=1.2; // temperature of the bot
const MaxTokens=100; // max tokens of the bot
const botTriggerWord="amigui"; // bot trigger word
const VoiceLanguage="pt-PT"; // language of discord voice channel
gTTSLanguage="pt"; // language of the bot
const volume=0.5;
const player = createAudioPlayer();
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences
    ]
})

player.on(AudioPlayerStatus.Playing, () => {
    console.log('The audio player has started playing!');
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    //console.log(oldState, newState);
    // do nothing if the user is the bot id
    if (newState.member.user.id === botDiscId) return;
    if (newState.channelId === channelId && (oldState.channelId === null || oldState.channelId !== newState.channelId)) { // User Joins a voice channel. Ignore all others events not related with the target channel
        // User Joins a voice channel
        console.log("someone joined channel");
        const currentguild = await client.guilds.fetch(guildId);
        connection = joinVoiceChannel({
            channelId: channelId,
            guildId: guildId,
            adapterCreator: currentguild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });
        console.log(newState.member);
        chatgpt("O membro" + newState.member.user.username + " acabou de chegar, dá-lhe as boas vindas energeticamente e termina a resposta a miar.",newState.member.channel );
    }
});
addSpeechEvent(client, { lang: VoiceLanguage ,
profanityFilter: false,
});
async function saveTextFile(textToSpeak,finalName) {
    try
    {
    var gtts = new gTTS(textToSpeak, gTTSLanguage);

    gtts.save(finalName, function (err, result) {
        if(err) { throw new Error(err) }
        console.log('Audio file saved.');
    }); 
    }
    catch(err)
    {
    console.log("Not able to read text, try again.");
    console.log(err);
    }
    }
     
async function chatgpt_start(){
    console.log("Starting bot...")
        const configuration = new Configuration({ //TODO: add fine-tuning and custom model
            apiKey: process.env.OPENAI_API_KEY,
        });
        openai = new OpenAIApi(configuration);
        const currentguild = await client.guilds.fetch(guildId);
    connection = joinVoiceChannel({
        channelId: channelId,
        guildId: guildId,
        adapterCreator: currentguild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
    })
    chatgpt("Acabaste de resuscitar, diz o quanto agradecido estás por estares vivo novamentes","sdfsdfsd");
}


//remove keywork from string message
function removeKeyword(message,keyword){
    var index = message.indexOf(keyword);
    if (index > -1) {
        message = message.substring(0, index) + message.substring(index + keyword.length);

    }
    return message;
}

async function chatgpt(message,msg){
    console.log("ChatGPT request:" + message)

const completion = await openai.createCompletion({
    model: gptModel,
    prompt: message + ". \n",

    max_tokens: MaxTokens,
    temperature: Temperature,
    //suffix: " ->",
    //presencePenalty: 0, 
    //frequencyPenalty: 0,
    //bestOf: 1,
    //n: 1,
    stop:["\n"]
});
//
    
console.log(completion.data.usage)
res=completion.data.choices[0];
console.log("ChatGPT response:" + res.text)
//msg.channel.send(res.text);
var fileName = "tmp/" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + ".mp3";
saveTextFile(res.text,fileName);

//wait until file is created
if   (fs.existsSync(fileName)) {console.log("sdf");return;}
    count=0;
    while (!fs.existsSync(fileName)) {
    console.log("waiting for file to be created.");
    await sleep_func(100);
    
    //exit if file is not created after 4 seconds
    if (count > 40) { console.log("file not created.");
         return;}
    count++;

}
    connection1(fileName);
}


async function connection1(filename) {
    const currentguild = await client.guilds.fetch(guildId);
        connection = joinVoiceChannel({
            channelId: channelId,
            guildId: guildId,
            adapterCreator: currentguild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        })
        resource = createAudioResource(filename, { inlineVolume: true });
        resource.volume.setVolume(volume);
        player.play(resource);
        connection.subscribe(player);
        console.log("playing audio file: " + filename);
        
    }
    function sleep_func(millis) {
        return new Promise(resolve => setTimeout(resolve, millis));
    }
//////////////////////
client.on("speech", async (msg) => { 
    // If bot didn't recognize speech, content will be empty
    //count number of files inside tmp folder
    var count = 0;
    fs.readdirSync("tmp").forEach(file => {
        count++;
    });
    if (count > 10) {
        console.log("Cleaning up tmp folder...")
        fs.readdirSync("tmp").forEach(file => {
            fs.unlinkSync("tmp/"+file);
            
        });
            //delete all files in tmp folder
            chatgpt("Informa que já limpaste a pasta temporária.","sdfsdfsd");
    }
    if (!msg.content) return;
    var currentdate = new Date();
    var datetime = currentdate.getDate() + "/"
                    + (currentdate.getMonth()+1)  + "/"
                    + currentdate.getFullYear() + " @ "
                    + currentdate.getHours() + ":"
                    + currentdate.getMinutes() + ":"
                    + currentdate.getSeconds();
    console.log(datetime + " - " + msg.author.username + ": " + msg.content);
    
    //bot trigger word
    let result_responde = msg.content.toLowerCase().includes(botTriggerWord);
    if (result_responde) {
    chatgpt("Tu és o Amiguinho. Eu sou o " + msg.author.username + ". Deves dar respostas curtas, agressivas e ofensivas. A pergunta é esta: " + msg.content,msg);
    }
});


client.on('ready', async() => {
console.log('Starting up...');
    //delete all files in tmp folder
    console.log('Cleaning up tmp folder...')
    fs.readdirSync("tmp").forEach(file => {
        fs.unlinkSync("tmp/"+file);
    })
    console.log('Cleaning up done.')
    //get client username
    console.log('Logged in as ' + client.user.username + ' - (' + client.user.id + ')');
    console.log("joining channel...");
    await chatgpt_start();
    console.log("Ready to go!");
    console.log("--------------------------------------------------")
    
}
);
//check if someone jointed channel
client.on('messageCreate', message => { // when there is a message sent
    


    //disconnect from voice channel
    if (message.content.toLowerCase().includes("!stop")) {
        console.log("Disconnecting from voice channel...");
        connection.destroy();
        console.log("Disconnected from voice channel.");
    }

    //connect to 
    if (message.content.toLowerCase().includes("!start")) { 
        console.log("Connecting to voice channel...");
        chatgpt_start();
        console.log("Connected to voice channel.");
    }


   /* if (message.content === "!status") {
        // msg is equal to the message content without !status keywork
        msg=removeKeyword(message.content,"!status");
        console.log("----->" + msg);
        chatgpt(msg,message.channel);
        //message.channel.send("I'm alive!")   
    }
    if (msg) {
        msg=removeKeyword(message.content,"!status");
        console.log("----->" + msg);
        chatgpt(msg,message.channel);
    }*/
})
client.login(process.env.BOT_TOKEN);
