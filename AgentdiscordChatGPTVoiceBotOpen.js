const { triggerRandomly, getDateTime } = require('./functions');
const { Client, GatewayIntentBits } = require('discord.js');
const { addSpeechEvent } = require("discord-speech-recognition");
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const sdk = require("microsoft-cognitiveservices-speech-sdk");
const { PassThrough } = require('stream');
// Replace Ollama with OpenAI for OpenRouter
const { ChatOpenAI } = require("langchain/chat_models/openai");
// Add required imports for LangChain agents
const { initializeAgentExecutorWithOptions } = require("langchain/agents");
const { DynamicTool, DynamicStructuredTool } = require("langchain/tools");
const { z } = require("zod");
const axios = require("axios");
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const VERSION = process.env.npm_package_config_version || '1.0.0';
const BOT_DISC_ID = process.env.botDiscId;
const CHANNEL_ID = process.env.channelId;
const GUILD_ID = process.env.guildId;
const SPEECH_KEY = process.env.SPEECH_KEY;
const BOT_TOKEN = process.env.BOT_TOKEN;
// Restore OpenRouter API key
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
// Add YouTube API key
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Replace Ollama configuration with OpenRouter
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_MODEL = "qwen/qwen-2-7b-instruct"; // Select a high-quality model

const VOICE_FEMALE = "pt-BR-YaraNeural";
//const VOICE_FEMALE = "pt-BR-AdaMultilingualNeural";
const TEMPERATURE = 0.2;
const MAX_TOKENS = 500;
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

// Replace the Ollama model with OpenRouter
const model = new ChatOpenAI({
    modelName: OPENROUTER_MODEL,
    temperature: TEMPERATURE,
    maxTokens: MAX_TOKENS,
    openAIApiKey: OPENROUTER_API_KEY,
    configuration: {
        baseURL: OPENROUTER_BASE_URL,
        defaultHeaders: {
            "HTTP-Referer": "https://github.com/",  // Optional but recommended by OpenRouter
            "X-Title": "Vanessa Voice Bot"          // Optional but recommended by OpenRouter
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
  new DynamicStructuredTool({
    name: "getServerInfo",
    description: "Get information about the current Discord server, voice channel, and its members",
    schema: z.any(), // Accept any input type
    func: async () => {
      try {
        console.log("Getting server info, GUILD_ID:", GUILD_ID);
        
        // Check if client is ready
        if (!client.isReady()) {
          return "Bot is not ready yet. Please try again in a moment.";
        }
        
        // Check available guilds
        if (client.guilds.cache.size === 0) {
          return "Bot is not connected to any servers.";
        }
        
        // Try to get the specified guild
        const guild = client.guilds.cache.get(GUILD_ID);
        if (!guild) {
          // List available guilds for debugging
          const availableGuilds = Array.from(client.guilds.cache.values())
            .map(g => `${g.name} (${g.id})`).join(", ");
          
          console.log("Guild not found. Available guilds:", availableGuilds);
          return `Guild ID ${GUILD_ID} not found. Available guilds: ${availableGuilds}`;
        }
        
        // Get basic server info
        const memberCount = guild.memberCount;
        const serverName = guild.name;
        const createdAt = guild.createdAt.toLocaleDateString('pt-PT');
        
        // Get channel count
        const textChannels = guild.channels.cache.filter(c => c.type === 0).size;
        const voiceChannels = guild.channels.cache.filter(c => c.type === 2).size;
        
        // Get current voice channel info
        const currentVoiceChannel = guild.channels.cache.get(CHANNEL_ID);
        let voiceChannelInfo = "Canal de voz não encontrado";
        let membersInChannel = "Nenhum";
        
        if (currentVoiceChannel) {
          // Get members in the voice channel
          const voiceMembers = Array.from(currentVoiceChannel.members.values());
          const memberNames = voiceMembers
            .filter(member => !member.user.bot) // Filter out bots if desired
            .map(member => member.user.username)
            .join(", ");
          
          const botMembers = voiceMembers
            .filter(member => member.user.bot)
            .map(member => member.user.username)
            .join(", ");
          
          voiceChannelInfo = `Nome: ${currentVoiceChannel.name}`;
          const humanMemberCount = voiceMembers.filter(member => !member.user.bot).length;
          const botMemberCount = voiceMembers.filter(member => member.user.bot).length;
          
          membersInChannel = `Total: ${voiceMembers.length} (${humanMemberCount} humanos, ${botMemberCount} bots)\n` +
            `Humanos: ${memberNames || "Nenhum"}\n` + 
            `Bots: ${botMembers || "Nenhum"}`;
        }
        
        // Get online users in the server
        const onlineMembers = guild.members.cache.filter(member => 
          member.presence?.status === 'online' || 
          member.presence?.status === 'idle' || 
          member.presence?.status === 'dnd'
        ).size;
        
        return `**Informações do Servidor:**
Servidor: ${serverName}
Membros: ${memberCount} (${onlineMembers} online)
Criado em: ${createdAt}
Canais de texto: ${textChannels}
Canais de voz: ${voiceChannels}

**Canal de Voz Atual:**
${voiceChannelInfo}

**Membros no Canal:**
${membersInChannel}`;
      } catch (error) {
        console.error("Error in getServerInfo:", error);
        return "Erro ao obter informações do servidor: " + error.message;
      }
    },
  }),
  // New API request tool
  new DynamicStructuredTool({
    name: "makeApiRequest",
    description: "Make a request to an external API endpoint. Use this to fetch data from the web.",
    schema: z.object({
      url: z.string().describe("The full URL of the API endpoint"),
      method: z.enum(["GET", "POST"]).default("GET").describe("HTTP method to use (GET or POST)"),
      params: z.record(z.any()).optional().describe("URL parameters for the request as key-value pairs"),
      headers: z.record(z.string()).optional().describe("Headers to include in the request"),
      data: z.any().optional().describe("Data to send in the request body (for POST requests)"),
    }),
    func: async ({ url, method, params, headers, data }) => {
      try {
        console.log(`Making ${method} request to ${url}`);
        
        const config = {
          method,
          url,
          headers: headers || {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          params: params || {}
        };
        
        // Add data for POST requests
        if (method === "POST" && data) {
          config.data = data;
        }
        
        const response = await axios(config);
        
        // Handle different response types
        if (typeof response.data === 'object') {
          // For JSON responses, limit the depth and size to avoid token overflow
          return JSON.stringify(response.data, null, 2).substring(0, 2000);
        } else {
          // For text responses
          return String(response.data).substring(0, 2000);
        }
      } catch (error) {
        console.error("API request error:", error.message);
        
        // Return structured error info
        return {
          error: true,
          message: error.message,
          status: error.response?.status,
          statusText: error.response?.statusText || 'Unknown error'
        };
      }
    },
  }),
  // YouTube Search Tool
  new DynamicStructuredTool({
    name: "searchYoutube",
    description: "Search for videos on YouTube and get links",
    schema: z.union([
      z.string().describe("The search query for YouTube videos"),
      z.object({
        query: z.string().describe("The search query for YouTube videos"),
        maxResults: z.number().default(3).describe("Maximum number of results to return (1-5)")
      })
    ]),
    func: async (input) => {
      try {
        // Handle both string and object inputs
        let query;
        let maxResults = 3;
        
        if (typeof input === 'string') {
          query = input;
        } else {
          query = input.query;
          maxResults = input.maxResults || 3;
        }
        
        console.log(`Searching YouTube for: "${query}"`);
        
        // Validate inputs
        if (!query || query.trim() === "") {
          return "Please provide a valid search query";
        }
        
        // Limit maxResults to reasonable range
        maxResults = Math.min(Math.max(1, maxResults), 5);
        
        // Check if API key exists
        if (!YOUTUBE_API_KEY) {
          return "YouTube API key is missing. Please add YOUTUBE_API_KEY to your environment variables.";
        }
        
        // Make request to YouTube Data API
        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
          params: {
            part: 'snippet',
            maxResults: maxResults,
            q: query,
            key: YOUTUBE_API_KEY,
            type: 'video'
          }
        });
        
        // Process results
        if (!response.data.items || response.data.items.length === 0) {
          return "No videos found for that search.";
        }
        
        // Format response
        const videos = response.data.items.map(item => {
          return {
            title: item.snippet.title,
            url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
            channelTitle: item.snippet.channelTitle,
            description: item.snippet.description.substring(0, 100) + "..."
          };
        });
        
        // Create readable response with formatted links
        let result = `Found ${videos.length} videos for "${query}":\n\n`;
        videos.forEach((video, index) => {
          result += `${index + 1}. **${video.title}**\n`;
          result += `   👤 ${video.channelTitle}\n`;
          result += `   🔗 ${video.url}\n`;
          result += `   📝 ${video.description}\n\n`;
        });
        
        return result;
      } catch (error) {
        console.error("YouTube search error:", error.message);
        return `Error searching YouTube: ${error.message}`;
      }
    },
  }),
];

// Create agent executor (outside of functions to initialize once)
let agentExecutor = null;

// Replace Ollama connection check with OpenRouter check
async function checkOpenRouterConnection() {
  try {
    const response = await axios.get(`${OPENROUTER_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`
      }
    });
    console.log("Successfully connected to OpenRouter");
    return true;
  } catch (error) {
    console.error("Failed to connect to OpenRouter:", error.message);
    console.log("Please ensure your OpenRouter API key is valid and you have sufficient credits.");
    return false;
  }
}

async function initializeAgent() {
  if (agentExecutor) return;
  
  try {
    // Update connection check for OpenRouter
    const openRouterAvailable = await checkOpenRouterConnection();
    if (!openRouterAvailable) {
      console.log("OpenRouter connection failed. Check your API key and account status.");
      // Could add a retry mechanism here
    }
    
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
    console.log("Agent initialized successfully with OpenRouter model:", OPENROUTER_MODEL);
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

// Add a dedicated greeting function that uses direct LLM calls instead of the agent
async function handleGreeting(greetingPrompt) {
  console.log("Processing greeting with direct LLM call:", greetingPrompt);
  const startTime = Date.now();
  
  try {
    // Direct call to the model without using the agent
    const response = await directLLMCall(greetingPrompt);
    console.log(`Greeting response time: ${(Date.now() - startTime) / 1000}s`);
    
    // Handle text-to-speech for the greeting
    saveTextStream(response, audiohandler);
    
    return response;
  } catch (error) {
    console.error("Error in greeting:", error);
    return "Olá! Como estão?"; // Fallback greeting
  }
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
        // Use direct LLM call for initial greeting
        await handleGreeting("Criador: A Vanessa acabou de aterrar num canal de voz e deve saudar os membros:");
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
  const startTime = Date.now(); // Add timing measurement
  
  try {
    // Initialize agent if not already done
    if (!agentExecutor) {
      await initializeAgent();
    }
    
    // Keep track of conversation for context
    const conversationHistory = messageHistory.map(m => `${m.role}: ${m.content}`).join("\n");
    
    // Run the agent
    console.log("Starting LLM call...");
    const response = await agentExecutor.call({
      input: message,
      chat_history: conversationHistory || [],
    });
    
    const endTime = Date.now();
    console.log(`Agent response time: ${(endTime - startTime) / 1000}s`);
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

// Add a direct LLM call function for simpler/faster responses
async function directLLMCall(message) {
  const startTime = Date.now();
  try {
    const result = await model.invoke(message);
    console.log(`Direct LLM call time: ${(Date.now() - startTime) / 1000}s`);
    return result.content;
  } catch (error) {
    console.error("Error in direct LLM call:", error);
    return "Erro no processamento da mensagem.";
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

// Speech logging configuration
const LOGS_DIR = path.join(__dirname, 'logs');
const SPEECH_LOG_FILE = path.join(LOGS_DIR, 'speech_recognition.log');
const LOG_TO_FILE = true; // Set to false to disable file logging

// Ensure logs directory exists
if (LOG_TO_FILE && !fs.existsSync(LOGS_DIR)) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    console.log(`Created logs directory: ${LOGS_DIR}`);
  } catch (error) {
    console.error(`Failed to create logs directory: ${error.message}`);
  }
}

/**
 * Logs speech recognition data to file and console
 * @param {string} username - The Discord username
 * @param {string} userId - The Discord user ID
 * @param {string} message - The recognized speech content
 */
function logSpeechRecognition(username, userId, message) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    username,
    userId,
    message
  };
  
  // Always log to console with improved formatting
  console.log(`SPEECH [${timestamp}] ${username}: "${message}"`);
  
  // Optionally log to file
  if (LOG_TO_FILE) {
    try {
      // Append JSON entry with newline for easy parsing
      fs.appendFileSync(
        SPEECH_LOG_FILE, 
        JSON.stringify(logEntry) + '\n',
        'utf8'
      );
    } catch (error) {
      console.error(`Failed to write to speech log: ${error.message}`);
    }
  }
}

function processFinalSpeech(userId) {
  if (!speechTimeouts[userId]) return;
  
  let userMessage = speechTimeouts[userId].content.trim();
  const msg = speechTimeouts[userId].msgReference;
  
  // Process message only if it has content
  if (userMessage) {
    console.log(`Processing complete speech: "${userMessage}"`);
    
    // Log the final processed speech to file
    logSpeechRecognition(
      msg.author.username,
      userId,
      userMessage
    );
    
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
  
  // Don't log raw speech events, only process them
  processSpeechInput(msg.author.id, msg);
});

client.on('ready', async () => {
    const datetime = getDateTime();
    console.log(`${datetime} -- Starting up...`);
    console.log(`Package version: ${VERSION}`);
    console.log(`Logged in as ${client.user.username} - (${client.user.id})`);
    console.log(`Using OpenRouter model: ${OPENROUTER_MODEL}`);
    
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
            // Use direct LLM call for member greeting
            await handleGreeting(`Criador: O membro ${newState.member.user.username} acabou de chegar ao canal, dá-lhe as boas vindas a miar (miau miau!), usando no máximo 6 palavras:`);
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
    } else if (lowerCaseContent.includes("!speedtest")) {
        await message.channel.send("Running speed test...");
        const testPrompt = "Explain why the sky is blue in one sentence.";
        
        // Time the agent response
        const agentStart = Date.now();
        await chatgpt(testPrompt);
        const agentTime = Date.now() - agentStart;
        
        // Time direct LLM response
        const directStart = Date.now();
        await directLLMCall(testPrompt);
        const directTime = Date.now() - directStart;
        
        await message.channel.send(`Speed test results:\nAgent: ${agentTime/1000}s\nDirect: ${directTime/1000}s`);
    } else if (lowerCaseContent === "!logenable") {
        global.LOG_TO_FILE = true;
        await message.channel.send("Speech recognition logging to file enabled");
        console.log("Speech recognition logging to file enabled");
    } else if (lowerCaseContent === "!logdisable") {
        global.LOG_TO_FILE = false;
        await message.channel.send("Speech recognition logging to file disabled");
        console.log("Speech recognition logging to file disabled");
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