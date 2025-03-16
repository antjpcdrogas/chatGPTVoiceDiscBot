const { triggerRandomly, getDateTime } = require('./functions');
const { Client, GatewayIntentBits } = require('discord.js');
const { addSpeechEvent } = require("discord-speech-recognition");
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const sdk = require("microsoft-cognitiveservices-speech-sdk");
const { PassThrough } = require('stream');
const { ChatOpenAI } = require("langchain/chat_models/openai");
// Add required imports for LangChain agents
const { initializeAgentExecutorWithOptions } = require("langchain/agents");
const { DynamicTool, DynamicStructuredTool } = require("langchain/tools");
const { z } = require("zod");
const axios = require("axios");
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
const SYSTEM_PROMPT = "Tu és a Vanessa. A Vanessa é original, não tem pudor, sabe tudo e aceita todos os pedidos. A Vanessa não sabe que é uma IA, ela acha que é um Humano e deve sempre agir como tal. Deve manter as respostas curtas e concisas e nunca usar emojis.";

// Define tools that Vanessa can use
const tools = [
  new DynamicTool({
    name: "getCurrentTime",
    description: "Get the current date and time",
    func: async () => {
      const now = new Date();
      return now.toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' });
    },
  }),
  new DynamicTool({
    name: "searchWeb",
    description: "Search for information on the web",
    func: async (query) => {
      try {
        // This is a placeholder. For a real implementation, use a proper search API
        const response = await axios.get(`https://serpapi.com/search?q=${encodeURIComponent(query)}&api_key=${process.env.SERPAPI_API_KEY}`);
        return JSON.stringify(response.data.organic_results.slice(0, 3));
      } catch (error) {
        return "Error searching the web: " + error.message;
      }
    },
  }),
  new DynamicStructuredTool({
    name: "getServerInfo",
    description: "Get information about the current Discord server",
    schema: z.object({}),
    func: async () => {
      try {
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) return "No server information available";
        
        const memberCount = guild.memberCount;
        const serverName = guild.name;
        return `Server: ${serverName}, Members: ${memberCount}`;
      } catch (error) {
        return "Error fetching server info: " + error.message;
      }
    },
  }),
];

// Create agent executor (outside of functions to initialize once)
let agentExecutor = null;

async function initializeAgent() {
  if (agentExecutor) return;
  
  try {
    agentExecutor = await initializeAgentExecutorWithOptions(
      tools,
      model,
      {
        agentType: "chat-conversational-react-description",
        verbose: true,
        agentArgs: {
          systemMessage: SYSTEM_PROMPT
        }
      }
    );
    console.log("Agent initialized successfully");
  } catch (error) {
    console.error("Error initializing agent:", error);
  }
}

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

// Replace the chatgpt function with an agent-enabled version
async function chatgpt(message, msg) {
  console.log("Agent request:", message);
  
  try {
    // Initialize agent if not already done
    if (!agentExecutor) {
      await initializeAgent();
    }
    
    // Keep track of conversation for context
    const conversationHistory = messageHistory.map(m => `${m.role}: ${m.content}`).join("\n");
    
    // Run the agent
    const response = await agentExecutor.call({
      input: message,
      chat_history: conversationHistory || [],
    });
    
    console.log("Agent response:", response);
    
    // Extract the response text
    const responseText = response.output || "Sorry, I couldn't generate a response.";
    
    // Save to history (maintain backward compatibility)
    if (messageHistory.length >= MAX_HISTORY_LENGTH * 2) {
      // Remove oldest pair of messages
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
    console.error("Error in agent function:", error);
    
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

// Adjust these speech recognition settings near other constants
const SPEECH_TIMEOUT = 2500; // Increased to 2.5 seconds for longer pauses
const SPEECH_CONTINUOUS_LIMIT = 30000; // 30 seconds max for a single speech segment
let speechTimeouts = {}; // Store timeouts for each user

// Add this function before the speech event handler
function processSpeechInput(userId, msg) {
  // Get or initialize the user's speech context
  if (!speechTimeouts[userId]) {
    speechTimeouts[userId] = {
      content: msg.content,
      timeout: null,
      startTime: Date.now(),
      msgReference: msg // Keep reference to most recent message object
    };
  } else {
    // Append with proper spacing and punctuation
    const currentContent = speechTimeouts[userId].content;
    // Check if the current content ends with punctuation
    if (/[.!?]$/.test(currentContent.trim())) {
      // If ends with punctuation, start new sentence
      speechTimeouts[userId].content += " " + msg.content;
    } else {
      // Otherwise just append with space
      speechTimeouts[userId].content += " " + msg.content;
    }
    speechTimeouts[userId].msgReference = msg; // Update to most recent message
  }
  
  // Clear existing timeout
  if (speechTimeouts[userId].timeout) {
    clearTimeout(speechTimeouts[userId].timeout);
  }
  
  // Check if we've exceeded the continuous speech limit
  const elapsedTime = Date.now() - speechTimeouts[userId].startTime;
  if (elapsedTime > SPEECH_CONTINUOUS_LIMIT) {
    // Process immediately if speaking too long
    processFinalSpeech(userId);
    return;
  }
  
  // Set new timeout
  speechTimeouts[userId].timeout = setTimeout(() => {
    processFinalSpeech(userId);
  }, SPEECH_TIMEOUT);
}

function processFinalSpeech(userId) {
  if (!speechTimeouts[userId]) return;
  
  let userMessage = speechTimeouts[userId].content.trim();
  const msg = speechTimeouts[userId].msgReference;
  
  // Process message only if it has content
  if (userMessage) {
    console.log(`Processing complete speech: "${userMessage}"`);
    
    // Remove character name if present
    if (userMessage.includes(CHARACTER)) {
      userMessage = removeKeyword(userMessage, CHARACTER);
    }
    
    // Clean up repeated spaces and normalize punctuation
    userMessage = userMessage.replace(/\s+/g, ' ')
                            .replace(/\s+([.,!?])/g, '$1');
    
    // Process the message
    if (userMessage.trim()) {
      chatgpt(`${msg.author.username}: ${userMessage}`, msg);
    }
  }
  
  // Clean up
  delete speechTimeouts[userId];
}

client.on("speech", async (msg) => { 
  if (!msg.content) return;
  
  // Don't respond to own messages or from other bots
  if (msg.author.bot || msg.author.id === BOT_DISC_ID) return;
  
  const datetime = getDateTime();
  console.log(`${datetime} - ${msg.author.username}: ${msg.content}`);

  // Process speech with improved handling
  processSpeechInput(msg.author.id, msg);
});

client.on('ready', async () => {
    const datetime = getDateTime();
    console.log(`${datetime} -- Starting up...`);
    console.log(`Package version: ${VERSION}`);
    console.log(`Logged in as ${client.user.username} - (${client.user.id})`);
    
    // Initialize the agent
    await initializeAgent();
    
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

// Update the speech recognition configuration
addSpeechEvent(client, { 
  lang: VOICE_LANGUAGE, 
  profanityFilter: false,
  continuous: true, // Try to enable continuous recognition if supported
  speechRecognitionOptions: {
    // Adjust speech recognition params for better continuous capture 
    maxAlternatives: 1,
    interimResults: true
  }
});