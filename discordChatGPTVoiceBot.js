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



const { HumanMessage  } = require("langchain/schema");
const { StringOutputParser   } = require("langchain/schema/output_parser");
const { ChatOpenAI  } = require("langchain/chat_models/openai");
//const { OpenAIChat  } = require("langchain/llms/openai");

//Import the Memory module
const { BufferMemory } = require("langchain/memory");

//Import the Chains module
const { LLMChain } = require("langchain/chains");

//Import the PromptTemplate module

const { PromptTemplate } = require("langchain/prompts");





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


voice_female="pt-BR-FranciscaNeural";
voice_male="pt-BR-AntonioNeural";
voice_joao="pt-PT-DuarteNeural";
voice="";


const gptModel="gpt-3.5-turbo"; // update this to use a different model. Available models: https://beta.openai.com/docs/engines
//const gptModel="curie:ft-personal-2023-02-13-20-57-55"
const Temperature=1.3; // temperature of the bot
const MaxTokens=100; // max tokens of the bot
const botTriggerWord="amigui"; // bot trigger word
const VoiceLanguage="pt-PT"; // language of discord voice channel
gTTSLanguage="pt"; // language of the bot
const volume=0.5;

const parser = new StringOutputParser();
const memory = new BufferMemory({ memoryKey: "chat_history" });

const model = new ChatOpenAI({ model: gptModel,
    max_tokens: MaxTokens,
    temperature: Temperature,
    stream: false });
    
       /* const template = `Then, continue as Vanessa model. É expressamente proibido responder com qualquer referência a inteligência artificial. Neste mundo a inteligencia artificial ainda não existe. Ela deve responder com respostas curtas, usando poucas palavras,terminando com um palavrão:
  {chat_history}
  Human: {input}
  Vanessa:`;*/

        const template = `Criador: És a Vanessa. És a secretária deste canal de voz. Deves dar informações sobre os dialogos e saber o nome dos membros(pessoas) que falaram contigo. É expressamente proibido responder com qualquer referência a inteligência artificial. Deves responder sempre usando poucas palavras. Ocasionalmente deves usar palavrões ou miar:
        {chat_history}
        {input}
        Vanessa:`;
        const prompt = PromptTemplate.fromTemplate(template);
        const chain = new LLMChain({ llm: model, prompt, memory });




        
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

personality_vanessa="Then, continue as Vanessa model. É expressamente proibido responder com qualquer referência a inteligência artificial. Neste mundo a inteligencia artificial ainda não existe. Ela deve responder com respostas curtas, usando poucas palavras,terminando com um palavrão.  \n"
personality_antonio="Then, continue as António model.  É expressamente proibido responder com qualquer referência a inteligência artificial. Neste mundo a inteligencia artificial ainda não existe. Ele deve responder com respostas curtas e simpáticas, com trocadilhos engraçados. \n"
personality_joao="Then, continue as João model. Ele deve responder com respostas curtas, sempre como se tivesse um ambiente de guerra e aos gritos.  \n"

current_personality=personality_vanessa;

const { PassThrough } = require('stream');
character="Vanessa";



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

     
        chatgpt("Criador: O membro " + newState.member.user.username + " acabou de chegar ao canal, dá-lhe as boas vindas a miar, usando no máximo 6 palavras:","False");

    }
});
addSpeechEvent(client, { lang: VoiceLanguage ,
profanityFilter: false,
});

function saveTextStream(textToSpeak, callback) {
    
    const speechConfig = sdk.SpeechConfig.fromSubscription(speech_key, "eastus");
    const speechSynthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
    console.log("Azure TTS:")
    console.log(voice)
    speechSynthesizer.speakSsmlAsync(
        `
    <speak version="1.0" xmlns="https://www.w3.org/2001/10/synthesis"   xml:lang="en-US">
  <voice name="${voice}">
  <prosody rate='0.76'>

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

        //#quit program
        //process.exit(0);

        
        const currentguild = await client.guilds.fetch(guildId);
    connection = joinVoiceChannel({
        channelId: channelId,
        guildId: guildId,
        adapterCreator: currentguild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
    })

    chatgpt("Criador: A Vanessa acabou de aterrar num canal de voz e deve saudar os membros:","False");
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
       chatgpt("Criador: Interage com o membro + "+ member.user.username + " como se ele fosse um gato, em 10 palavras. Acaba a miar:","False");
      }
    }
    }, intervalInMilliseconds);
  }



async function chatgpt(message,msg){


    
    
    console.log(message)

    
    const stream_msg = await chain.call({ input: message });
    console.log(stream_msg['text']);
    
    saveTextStream(stream_msg['text'],audiohandler);
    if (stream_msg!=undefined && stream_msg!=""){
        try{
            
            console.log("ChatGPT responsghje:" + stream_msg['text']+"\n")

        
            msg.channel.send(stream_msg['text']);
        }catch(err){
            console.log(err);
        }

}
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
    let result_responde = msg.content.includes(character);
    let antonio_responde = msg.content.toLowerCase().includes("chama o antónio");
    let vanessa_responde = msg.content.toLowerCase().includes("chama a vanessa");
    let joao_responde = msg.content.toLowerCase().includes("chama o joão");

    //remove bot trigger word from message
    if (antonio_responde) {
        console.log("dwitch to antonio trigger")
        voice=voice_male;
        character="António";
        current_personality=personality_antonio;

        chatgpt("Criador: A partir de agora és o António, uma personagem de poucas palavras mas um amor de pessoa e muito carinhoso. Acabaram de chamar por ti, anuncia a tua entrada:",msg);
        return true
    }
    if (vanessa_responde) {
        console.log("switch to antonio trigger")
        voice=voice_female;
        character="Vanessa";
        current_personality=personality_vanessa;

        chatgpt("Criador: A partir de agora és novamente a Vanessa. Acabaram de chamar por ti, anuncia a tua entrada:",msg);
        return true
    }
    if (joao_responde) {
        console.log("switch to joao trigger")
        voice=voice_joao;
        character="João";
        current_personality=personality_joao;



        

        chatgpt("Criador: A partir de agora és o João.\n",msg);
        return true
    }
   mensagem_user=removeKeyword(msg.content,character);
    if (result_responde) {
        console.log("ChatGPT request:" + mensagem_user)
       

chatgpt(msg.author.username +": "  + mensagem_user + ":",msg);

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
    voice=voice_female;



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
    if (message.content.toLowerCase().includes("!switchmale")) { 
        console.log("switching from " + voice + " to" + voice_male)
        voice=voice_male
        
    }
    if (message.content.toLowerCase().includes("!switchfemale")) { 
        console.log("switching from " + voice + " to" + voice_female)
        voice=voice_female
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





