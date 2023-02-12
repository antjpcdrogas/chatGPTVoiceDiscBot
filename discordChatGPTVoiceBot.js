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
require('dotenv').config()


const botDiscId=process.env.botDiscId
const channelId=process.env.channelId
const guildId=process.env.guildId
const gptModel="text-davinci-003"; // update this to use a different model. Available models: https://beta.openai.com/docs/engines
const botTriggerWord="reply"; // bot trigger word
const VoiceLanguage="en-EN"; // language of discord voice channel
gTTSLanguage="en"; // language of the bot
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
        chatgpt("A player named" + newState.member.user.username + " just joined the voice channel, greet him energetically!",newState.member.channel );
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
    }
async function chatgpt(message,msg){
const completion = await openai.createCompletion({
    model: gptModel,
    prompt: message,
    max_tokens: 50,
    temperature: 0.1,
    //presencePenalty: 0,
    //frequencyPenalty: 0,
    //bestOf: 1,
    //n: 1,
    stop: ["stop"]
});
//
    
console.log(completion.data.usage)
res=completion.data.choices[0];
console.log("ChatGPT response:" + res.text)
//msg.channel.send(res.text);
var fileName = "tmp/" + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + ".mp3";
saveTextFile(res.text,fileName);
//wait 2 seconds
//wait until file is created
if   (fs.existsSync(fileName)) {console.log("sdf");return;}
    while (!fs.existsSync(fileName)) {
    console.log("waiting for file to be created.");
    await sleep_func(1000);
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
    chatgpt(msg.content,msg);
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
    if (message.content === "!status") {
        message.channel.send("I'm alive!")   
    }
})
client.login(process.env.BOT_TOKEN);