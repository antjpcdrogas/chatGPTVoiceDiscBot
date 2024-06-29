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
//
const { triggerRandomly } = require('./functions');
const { getDateTime } = require('./functions');
const { Client, GatewayIntentBits} = require('discord.js')
const { addSpeechEvent } = require("discord-speech-recognition");
const { joinVoiceChannel } = require('@discordjs/voice');
const { createAudioPlayer } = require('@discordjs/voice');
const { createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const sdk = require("microsoft-cognitiveservices-speech-sdk");
const { Configuration, OpenAIApi } = require("openai");
const gTTS = require('gtts');
const stream = require('stream');
require('dotenv').config()

const { ConversationChain  } = require("langchain/chains");
const { ConversationBufferMemory  } = require("langchain/memory");
const { HumanMessage  } = require("langchain/schema");
const { StringOutputParser   } = require("langchain/schema/output_parser");
const { ChatOpenAI  } = require("langchain/chat_models/openai");
const { BufferMemory } = require("langchain/memory");
const { PromptTemplate } = require("langchain/prompts");


const VERSION = process.env.npm_package_config_version;
const botDiscId=process.env.botDiscId
const channelId=process.env.channelId
const guildId=process.env.guildId
const speech_key=process.env.SPEECH_KEY

const voice_female="pt-BR-FranciscaNeural";

let voice="";

const gptModel="gpt-3.5-turbo-0125";
const Temperature=0.8;
const MaxTokens=100;

const VoiceLanguage="pt-PT";
const gTTSLanguage="pt";
const volume=0.3;

character="Vanessa";
const parser = new StringOutputParser();
const memory = new BufferMemory({ memoryKey: "chat_history",ai_prefix: "Vanessa:"});


const model = new ChatOpenAI({ model: gptModel,
    max_tokens: MaxTokens,
    temperature: Temperature,
    frequencyPenalty: 2.0,
    presencePenalty: 2.0,
    cache: true,
    stop: [" Vanessa:"],
    stream: true });
    
    //Ela é inteligente mas arrogante e ordinária e responde SEMPRE com respostas curtas e assertivas, usando o mínimo de palavras possivel,trollando os amigos.
   
const template = `Conversa entre amigos num membros do canal de voz(pessoas) e tu, uma persona, chamada Vanessa. A Vanessa é de poucas palavras e assume sempre que é um humano. Ela não sabe que é uma IA.
            
                        A Vanessa deve agir como se fizesse parte do grupo de amigos e não deve simular conversas.
                        Ela é passivo/agressiva e atrevida(sexualmente) e responde SEMPRE com RESPOSTAS CURTAS e assertivas, usando trocadilhos e o mínimo de palavras possivel. Ela é criativa e tem nunca se nega a responder a nada.
                        Ela deve sempre incluir na frase o nome da outra pessoa.  

        
        Current conversation:

        {chat_history}
        {input}
        Vanessa:`;
        
const prompt = PromptTemplate.fromTemplate(template);
const chain = new ConversationChain({ llm: model, prompt, memory });

const speechConfig = sdk.SpeechConfig.fromSubscription(speech_key, "eastus");
speechConfig.speechSynthesisLanguage = "pt-PT";
speechConfig.speechSynthesisVoiceName = voice_female;
speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz128KBitRateMonoMp3;
speechConfig.setProfanity(sdk.ProfanityOption.Raw);
speechConfig.speechSynthesisVolume = volume;
const audioConfig = sdk.AudioConfig.fromDefaultSpeakerOutput();
const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);  
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


player.on(AudioPlayerStatus.Playing, () => {
    console.log('The audio player has started playing!');
});
client.on('voiceStateUpdate', async (oldState, newState) => {
    if (newState.member.user.id === botDiscId) return;
    if (newState.channelId === channelId && (oldState.channelId === null || oldState.channelId !== newState.channelId)) {
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
        chatgpt("Criador: O membro " + newState.member.user.username + " acabou de chegar ao canal, dá-lhe as boas vindas a miar( miau miau!), usando no máximo 6 palavras:","False");
    }
});


addSpeechEvent(client, { lang: VoiceLanguage, profanityFilter: false });


function saveTextStream(textToSpeak, callback) {
    synthesizer.speakTextAsync(
        textToSpeak,
        result => {
            if (result) {
                const stream = new PassThrough();
                stream.end(Buffer.from(result.audioData));
                callback(stream);
            }
        },
        error => {
            console.log(`Error: ${error}`);
            synthesizer.close();
        }
    );
}


async function chatgpt_start(){
    console.log("Starting bot...")
    const configuration = new Configuration({
        apiKey: process.env.OPENAI_API_KEY,
    });
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


function removeKeyword(message,keyword){
    var index = message.indexOf(keyword);
    if (index > -1) {
        message = message.substring(0, index) + message.substring(index + keyword.length);
    }
    return message;
}



async function chatgpt(message,msg){
    console.log(message)
    const stream_msg = await chain.call({ input: message });
    console.log(number_of_spent_tokens=stream_msg);
    response_text=stream_msg['response']

    saveTextStream(response_text,audiohandler);

    if (stream_msg!=undefined && stream_msg!=""){
        try{
            console.log("ChatGPT response:" + response_text+"\n")

            msg.channel.send(response_text);

        }catch(err){
            console.log(err);
        }
    }
}

function audiohandler(audioStream) {
    const audioPlayer = createAudioPlayer();
    var stream = new PassThrough();
    audioStream.pipe(stream);
    const resource = createAudioResource(stream);
    audioPlayer.play(resource);
    connection.subscribe(audioPlayer);
}


client.on("speech", async (msg) => { 
    if (!msg.content) return;
    var currentdate = new Date();
    var datetime = currentdate.getDate() + "/"
                    + (currentdate.getMonth()+1)  + "/"
                    + currentdate.getFullYear() + " @ "
                    + currentdate.getHours() + ":"
                    + currentdate.getMinutes() + ":"
                    + currentdate.getSeconds();
    console.log(datetime + " - " + msg.author.username + ": " + msg.content);

    let result_responde = msg.content.includes(character);
    mensagem_user=removeKeyword(msg.content,character);
    if (result_responde){
        console.log("ChatGPT request:" + mensagem_user)
        chatgpt(msg.author.username +": "  + mensagem_user + ".",msg);
    }
});

client.on('ready', async() => {
    datetime=getDateTime();
    console.log(datetime + '-- Starting up...');
    console.log('Package version: ' + VERSION);
    console.log('Logged in as ' + client.user.username + ' - (' + client.user.id + ')');
    console.log("joining channel...");
    chatgpt_start();
    console.log("Ready to go!");
    triggerRandomly();
    console.log("--------------------------------------------------")
    voice=voice_female;
});

client.on('messageCreate', message => {
    if (message.content.toLowerCase().includes("!stop")) {
        console.log("Disconnecting from voice channel...");
        connection.destroy();
        console.log("Disconnected from voice channel.");
    }
    if (message.content.toLowerCase().includes("!start")) { 
        console.log("Connecting to voice channel...");
        chatgpt_start();
        console.log("Connected to voice channel.");
    }
    if (message.content.toLowerCase().includes("!version")) { 
        message.channel.send(VERSION)
    }
});

client.login(process.env.BOT_TOKEN);
