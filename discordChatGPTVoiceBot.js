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
const fs = require('fs');
const parse = require("@fortaine/fetch-event-source/parse");
const { Configuration, OpenAIApi } = require("openai");
const gTTS = require('gtts');
const stream = require('stream');
require('dotenv').config()

const fazerPostNoInstagram = require('./instagram.js');
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

const gptModel="gpt-3.5-turbo-0613";
const Temperature=1;
const MaxTokens=100;
const botTriggerWord="amigui";
const VoiceLanguage="pt-PT";
gTTSLanguage="pt";
const volume=0.3;

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

const template = `Conversa entre amigos num membros do canal de voz(pessoas) e a IA que se chama "Vanessa". 
        A Vanessa deve auxiliar como programada adjunta, usando os membros do canal. Ela deve usar o minimo de palavras possivel.
        A Vanessa deve esperar pela interação dos membros de voz para agir e não deve simular conversas.
        
        Vamos devenvolver uma função em nodeJS para a Vanessa conseguir fazer posts no instagram. 
        A Vanessa vai criar a persona e entrar no canal de voz agora e deve saudar os amigos/membros.

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
        chatgpt("Criador: O membro " + newState.member.user.username + " acabou de chegar ao canal, dá-lhe as boas vindas a miar, usando no máximo 6 palavras:","False");
    }
});

addSpeechEvent(client, { lang: VoiceLanguage, profanityFilter: false });

function saveTextStream(textToSpeak, callback) {
    synthesizer.speakTextAsync(
        textToSpeak,
        result => {
            if (result) {
                const stream = new stream.PassThrough();
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

async function triggerRandomly() {
    const intervalInMinutes = 60 / 2;
    const intervalInMilliseconds = intervalInMinutes * 60 * 1000;

    setInterval(() => {
        const randomNumber = Math.random();
        const channel = client.channels.cache.get("419977920249987097");
        const members = channel.members;
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
    var stream = new stream.PassThrough();
    audioStream.pipe(stream);
    const resource = createAudioResource(stream);
    audioPlayer.play(resource);
    connection.subscribe(audioPlayer);
}

client.on('messageCreate', (msg) => {
    if (!msg.content) return;
    if (msg.author.id == 1165640449466306670 ) {
        var currentdate = new Date();
        var datetime = currentdate.getDate() + "/"
                        + (currentdate.getMonth()+1)  + "/"
                        + currentdate.getFullYear() + " @ "
                        + currentdate.getHours() + ":"
                        + currentdate.getMinutes() + ":"
                        + currentdate.getSeconds();
        console.log(datetime + " - " + msg.author.username + ": " + msg.content);
        let result_message = msg.content.includes(character);   
        mensagem_user=removeKeyword(msg.content,character);
        if (result_message) {
            chatgpt("Carlos: "  + mensagem_user + ".",msg);
        }
    } else {
        return;
    }
});

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
    let antonio_responde = msg.content.toLowerCase().includes("chama o antónio");
    let vanessa_responde = msg.content.toLowerCase().includes("chama a vanessa");
    let joao_responde = msg.content.toLowerCase().includes("chama o joão");
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
        chatgpt(msg.author.username +": "  + mensagem_user + ".",msg);
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
    datetime=getDateTime();
    console.log(datetime + '-- Starting up...');
    console.log('Package version: ' + VERSION);
    console.log('Logged in as ' + client.user.username + ' - (' + client.user.id + ')');
    console.log("joining channel...");
    chatgpt_start();
    console.log("Ready to go!");
    triggerRandomly();
    console.log("--------------------------------------------------")
    fazerPostNoInstagram();
    voice=voice_female;
}

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
})

client.login(process.env.BOT_TOKEN);
