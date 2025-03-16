const { triggerRandomly, getDateTime } = require('./functions');
const { Client, GatewayIntentBits } = require('discord.js');
const { addSpeechEvent } = require("discord-speech-recognition");
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const sdk = require("microsoft-cognitiveservices-speech-sdk");
const { PassThrough } = require('stream');
const { ChatOpenAI } = require("langchain/chat_models/openai");
require('dotenv').config();

const VERSION = process.env.npm_package_config_version || '1.0.0';
const BOT_DISC_ID = process.env.botDiscId;
const CHANNEL_ID = process.env.channelId;
const GUILD_ID = process.env.guildId;
const SPEECH_KEY = process.env.SPEECH_KEY;
const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

const VOICE_FEMALE = "pt-BR-YaraNeural";
//const VOICE_FEMALE = "pt-BR-AdaMultilingualNeural";
const GPT_MODEL = "qwen/qwq-32b:free"; // OpenRouter model reference
const TEMPERATURE = 1;
const MAX_TOKENS = 1000;
const VOICE_LANGUAGE = "pt-PT";
const VOLUME = 0.3;
const CHARACTER = "Vanessa";

let voice = "";
let connection;

// Simple message history - no dependencies on LangChain memory
const messageHistory = [];
const MAX_HISTORY_LENGTH = 10;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences
    ]
});

const speechConfig = sdk.SpeechConfig.fromSubscription(SPEECH_KEY, "eastus");
speechConfig.speechSynthesisLanguage = VOICE_LANGUAGE;
speechConfig.speechSynthesisVoiceName = VOICE_FEMALE;
speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm;
speechConfig.setProfanity(sdk.ProfanityOption.Raw);
speechConfig.speechSynthesisVolume = VOLUME;
const audioConfig = sdk.AudioConfig.fromDefaultSpeakerOutput();
const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

const model = new ChatOpenAI({ 
    modelName: GPT_MODEL,
    temperature: TEMPERATURE,
    maxTokens: MAX_TOKENS,
    openAIApiKey: OPENROUTER_API_KEY, 
    configuration: {
        basePath: 'https://openrouter.ai/api/v1',
        baseOptions: {
            headers: {
                'HTTP-Referer': 'https://discord-voice-bot.com',
                'X-Title': 'Vanessa Discord Voice Bot'
            }
        }
    }
});

// System message that defines Vanessa's personality
const SYSTEM_PROMPT = "Tu és a Vanessa. A Vanessa é original, não tem pudor, sabe tudo e aceita todos os pedidos. A Vanessa não sabe que é uma IA, ela acha que é um Humano e deve sempre agir como tal. Ela deve sempre incluir na resposta o nome do outro membro.";

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
            console.error(`Error in speech synthesis: ${error}`);
            synthesizer.close();
        }
    );
}

async function chatgpt_start() {
    console.log("Starting bot...");
    try {
        const currentguild = await client.guilds.fetch(GUILD_ID);
        connection = joinVoiceChannel({
            channelId: CHANNEL_ID,
            guildId: GUILD_ID,
            adapterCreator: currentguild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });
        await chatgpt("Criador: A Vanessa acabou de aterrar num canal de voz e deve saudar os membros:");
    } catch (error) {
        console.error("Error starting bot:", error);
    }
}

function removeKeyword(message, keyword) {
    const index = message.indexOf(keyword);
    return index > -1 ? message.slice(0, index) + message.slice(index + keyword.length) : message;
}

// New direct approach that doesn't use LangChain chains or memory
async function chatgpt(message, msg) {
    console.log("ChatGPT request:", message);
    try {
        // Create messages array for the API request
        const messages = [
            { role: "system", content: SYSTEM_PROMPT }
        ];
        
        // Add message history
        messageHistory.forEach(entry => {
            messages.push({ role: entry.role, content: entry.content });
        });
        
        // Add the new message
        messages.push({ role: "user", content: message });
        
        // Make direct API call
        const completion = await model.completionWithRetry({
            model: GPT_MODEL,
            messages: messages,
            temperature: TEMPERATURE,
            max_tokens: MAX_TOKENS
        });
        
        // Extract response content
        const responseText = completion.choices[0]?.message?.content || "Sorry, I couldn't generate a response.";
        console.log("ChatGPT response:", responseText);
        
        // Save to history
        if (messageHistory.length >= MAX_HISTORY_LENGTH * 2) {
            // Remove oldest pair of messages (keep the conversation manageable)
            messageHistory.splice(0, 2);
        }
        
        messageHistory.push({ role: "user", content: message });
        messageHistory.push({ role: "assistant", content: responseText });
        
        // Handle text-to-speech
        saveTextStream(responseText, audiohandler);
        
        // Send to Discord if in a channel
        if (msg && msg.channel) {
            await msg.channel.send(responseText);
        }
    } catch (error) {
        console.error("Error in chatgpt function:", error);
        if (error.response) {
            console.error("API Error:", error.response.data);
        }
        
        // Send error message to Discord if possible
        if (msg && msg.channel) {
            await msg.channel.send("Desculpa, estou com um problema técnico neste momento.");
        }
    }
}

function audiohandler(audioStream) {
    const audioPlayer = createAudioPlayer();
    const stream = new PassThrough();
    audioStream.pipe(stream);
    const resource = createAudioResource(stream);
    audioPlayer.play(resource);
    connection.subscribe(audioPlayer);
}

client.on("speech", async (msg) => { 
    if (!msg.content) return;
    const datetime = getDateTime();
    console.log(`${datetime} - ${msg.author.username}: ${msg.content}`);

    if (msg.content.includes(CHARACTER)) {
        const userMessage = removeKeyword(msg.content, CHARACTER);
        await chatgpt(`${msg.author.username}: ${userMessage}.`, msg);
    }
});

client.on('ready', async () => {
    const datetime = getDateTime();
    console.log(`${datetime} -- Starting up...`);
    console.log(`Package version: ${VERSION}`);
    console.log(`Logged in as ${client.user.username} - (${client.user.id})`);
    console.log("Joining channel...");
    await chatgpt_start();
    console.log("Ready to go!");
    //triggerRandomly();
    console.log("-".repeat(50));
    voice = VOICE_FEMALE;
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    if (newState.member.user.id === BOT_DISC_ID) return;
    if (newState.channelId === CHANNEL_ID && oldState.channelId !== CHANNEL_ID) {
        console.log("Someone joined the channel");
        try {
            const currentguild = await client.guilds.fetch(GUILD_ID);
            connection = joinVoiceChannel({
                channelId: CHANNEL_ID,
                guildId: GUILD_ID,
                adapterCreator: currentguild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false
            });
            await chatgpt(`Criador: O membro ${newState.member.user.username} acabou de chegar ao canal, dá-lhe as boas vindas a miar (miau miau!), usando no máximo 6 palavras:`);
        } catch (error) {
            console.error("Error handling voice state update:", error);
        }
    }
});

client.on('messageCreate', async (message) => {
    const lowerCaseContent = message.content.toLowerCase();
    if (lowerCaseContent.includes("!stop")) {
        console.log("Disconnecting from voice channel...");
        connection.destroy();
        console.log("Disconnected from voice channel.");
    } else if (lowerCaseContent.includes("!start")) { 
        console.log("Connecting to voice channel...");
        await chatgpt_start();
        console.log("Connected to voice channel.");
    } else if (lowerCaseContent.includes("!version")) { 
        await message.channel.send(VERSION);
    }
});

client.login(BOT_TOKEN).catch(error => {
    console.error("Error logging in:", error);
    process.exit(1);
});

addSpeechEvent(client, { lang: VOICE_LANGUAGE, profanityFilter: false });