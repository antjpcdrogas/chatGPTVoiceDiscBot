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
const sdk = require("microsoft-cognitiveservices-speech-sdk");


var fs = require('fs');
const parse = require("@fortaine/fetch-event-source/parse");
const { Configuration, OpenAIApi } = require("openai");
const gTTS = require('gtts');
const stream = require('stream');
require('dotenv').config()
const VERSION = process.env.npm_package_config_version;
// take this value as script argument
const botDiscId=process.env.botDiscId
const channelId=process.env.channelId
const guildId=process.env.guildId
const speech_key=process.env.SPEECH_KEY


const EventSource = require('eventsource');
const url = 'https://api.openai.com/v1/chat/completions';
const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
};





const gptModel="gpt-3.5-turbo"; // update this to use a different model. Available models: https://beta.openai.com/docs/engines
//const gptModel="curie:ft-personal-2023-02-13-20-57-55"
const Temperature=1.3; // temperature of the bot
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
const { PassThrough } = require('stream');

conversation=[{"role": "system", "content": "Then, continue as Vanessa language model. Ela deve responder com respostas curtas, usando poucas palavras,terminando com um palavrão. Ela acabou de aterrar num canal de voz e deve saudar os membros. \n"},
{"role": "system", "content": "Ela acabou de aterrar num canal de voz e deve saudar os membros. \n"}
];


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

     

        chatgpt({"role": "system", "content": "O " + newState.member.user.username + " acabou de chegar, dá-lhe as boas vindas a miar, usando no máximo 6 palavras." + ". \n"},"False");

    }
});
addSpeechEvent(client, { lang: VoiceLanguage ,
profanityFilter: false,
});

function saveTextStream(textToSpeak, callback) {
    


    const speechConfig = sdk.SpeechConfig.fromSubscription(speech_key, "eastus");
    const speechSynthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
    console.log("Azure TTS:")
    speechSynthesizer.speakSsmlAsync(
        `
    <speak version="1.0" xmlns="https://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="pt-BR-FranciscaNeural">
  <prosody rate='0.82'>


    ${textToSpeak}

    </prosody>
  </voice>
</speak>
  `,
        result => {
          const { audioData } = result;
          speechSynthesizer.close();
      
          // convert arrayBuffer to stream
          const bufferStream = new PassThrough();
          bufferStream.end(Buffer.from(audioData));
          callback(bufferStream);
          //return bufferStream;
        },
        error => {
          console.log("ERROR");
          console.log(error);
          speechSynthesizer.close();
        }
      );


    try {
 
      // Call the callback function with the audio stream
      
        
    } catch(err) {
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
    chatgpt({"role": "system", "content": "Then, continue as Vanessa language model. Ela deve responder com respostas curtas, usando poucas palavras,terminando com um palavrão. Ela acabou de aterrar num canal de voz e deve saudar os membros. \n"},"False");
}

//remove keywork from string message
function removeKeyword(message,keyword){
    var index = message.indexOf(keyword);
    if (index > -1) {
        message = message.substring(0, index) + message.substring(index + keyword.length);

    }
    return message;
}
async function triggerRandomly() {


    const intervalInMinutes = 60 / 2; // 5 times per hour
    const intervalInMilliseconds = intervalInMinutes * 60 * 1000; // convert to milliseconds
  
    setInterval(() => {
      const randomNumber = Math.random();


      const channel = client.channels.cache.get("419977920249987097");
      const members = channel.members;
      // trigger something randomly based on the random number
      if (members.size > 1){
      if (randomNumber < 0.4) {
        random_members=members
        random_members.delete(botDiscId);
        const member = random_members.random();

        console.log(member.user.username);
        
        console.log('Random trigger!');
       chatgpt({"role": "system", "content": "Interage com o membro + "+ member.user.username + " como se ele fosse um gato, em 10 palavras. Acaba a miar. \n"},"False");
      }
    }
    }, intervalInMilliseconds);
  }



async function chatgpt(message,msg){

    // add item in the first position of the conversation array
    


    conversation.push(message);
  
    console.log(conversation)
const completion = await openai.createChatCompletion({
    model: gptModel,
    messages: conversation,
    max_tokens: MaxTokens,
    temperature: Temperature,
    stream: true},
    
  { responseType: "stream" }
    //suffix: " ->",
    //presencePenalty: 0, 
    //frequencyPenalty: 0,
    //bestOf: 1,
    //n: 1,
    //stop:["\n"]
);
//

//console.log(completion.data)
stream_msg="";
completion.data.on('data', data => {

    const lines = data.toString().split('\n').filter(line => line.trim() !== '');
    
    for (const line of lines) {
        const message = line.replace(/^data: /, '');
        if (message === '[DONE]') {
            saveTextStream(stream_msg,audiohandler);
            if (stream_msg!=undefined && stream_msg!=""){
                try{
                    console.log("ChatGPT response:" + stream_msg+"\n")
                    conversation.push({"role": "assistant", "content": stream_msg+"\n"});

                
                msg.channel.send(stream_msg);
                }catch(err){
                    console.log(err);
                }

            }
            //saveTextStream(stream_msg,audiohandler);
            return; // Stream finished
        }
        try {
            const parsed = JSON.parse(message);

            if (parsed.choices[0].delta.content != undefined){
                stream_msg=stream_msg+parsed.choices[0].delta.content ;
                
               
                
            }

        } catch(error) {
            console.error('Could not JSON parse stream message', message, error);
        }
    
    }
});


//res=completion.data.choices[0].message.content;

//console.log("ChatGPT response:" + res)
//if (msg!="False"){
//    msg.channel.send(res);
//}
//
//saveTextStream(res,audiohandler);

//remove first element from conversation array

//conversation.shift();
 // remove last 2 elements from conversation array
conversation.splice(-2, 2);
}



function audiohandler(audioStream) {
    const audioPlayer = createAudioPlayer();
    // Create a new ReadableStream from the audio stream
    var stream = new PassThrough();
    audioStream.pipe(stream);
  
    // Play the stream in the current voice connection


    const resource = createAudioResource(stream);
    audioPlayer.play(resource);
    connection.subscribe(audioPlayer);

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
    //remove bot trigger word from message


   mensagem_user=removeKeyword(msg.content,"amiguinho");
    if (result_responde) {
        console.log("ChatGPT request:" + mensagem_user)
       

chatgpt({"role": "system", "content": "Prompt: " + mensagem_user + ". \n"},msg);

   // chatgpt({"role": "user", "content": + msg.content + ". \n"},msg);
    }
});

function getDateTime() {

    var date = new Date();
    var hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;
    var min  = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;
    var sec  = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;
    var year = date.getFullYear();
    var month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;
    var day  = date.getDate();
    day = (day < 10 ? "0" : "") + day;
    return day + "/" + month + "/" + year + " " + hour + ":" + min + ":" + sec;

}

client.on('ready', async() => {
//add date to start up message
datetime=getDateTime();



console.log(datetime + '-- Starting up...');
console.log('Package version: ' + VERSION);
    //get client username
    console.log('Logged in as ' + client.user.username + ' - (' + client.user.id + ')');
    console.log("joining channel...");
    chatgpt_start();
    console.log("Ready to go!");
    triggerRandomly();
    console.log("--------------------------------------------------")



//get number of members in the voice channel

    
    
    
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
    if (message.content.toLowerCase().includes("!version")) { 
        message.channel.send(VERSION)
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





