const { triggerRandomly, getDateTime } = require('./functions');
const { Client, GatewayIntentBits } = require('discord.js');
// Remove speech recognition since we're not using it anymore
// const { addSpeechEvent } = require("discord-speech-recognition");
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
const { spawn } = require('child_process'); // Add child_process import for running external Node.js scripts
const chokidar = require('chokidar'); // Add file watcher
require('dotenv').config({ path: './.env_maria' });

// Update file path constants for multi-bot setup
const BOT_ID = "maria";
const OTHER_BOT_ID = "vanessa";

// Define file paths for the multi-bot conversation system
const CONVERSATION_FILE = path.join(__dirname, `${BOT_ID}_conversation.data`); // Where this bot writes
const OTHER_BOT_CONVERSATION_FILE = path.join(__dirname, `${OTHER_BOT_ID}_conversation.data`); // Where the other bot writes

const BOT_RESPONSE_PREFIX = "Maria:"; // Prefix to identify this bot's messages
const OTHER_BOT_RESPONSE_PREFIX = "Vanessa:"; // Prefix to identify the other bot's messages

// Create the conversation files if they don't exist
if (!fs.existsSync(CONVERSATION_FILE)) {
  fs.writeFileSync(CONVERSATION_FILE, '', 'utf8');
  console.log(`Created conversation file: ${CONVERSATION_FILE}`);
}

if (!fs.existsSync(OTHER_BOT_CONVERSATION_FILE)) {
  fs.writeFileSync(OTHER_BOT_CONVERSATION_FILE, '', 'utf8');
  console.log(`Created other bot's conversation file: ${OTHER_BOT_CONVERSATION_FILE}`);
}

// Track the last processed line for each file
let lastProcessedLine = 0;
let lastProcessedOtherBotLine = 0;

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
const OPENROUTER_MODEL = "google/gemma-3-1b-it:free"; // Select a high-quality model

const VOICE_FEMALE = "pt-BR-ThalitaMultilingualNeural";
//const VOICE_FEMALE = "pt-BR-AdaMultilingualNeural";
const TEMPERATURE = 0.9;
const MAX_TOKENS = 600;
const VOICE_LANGUAGE = "pt-PT";
const VOLUME = 0.3;
const CHARACTER = "Maria";

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
const SYSTEM_PROMPT = "Tu és a Maria. A Maria é original, e gosta bastante de discutir sobre qual é o melhor animal. Ela é obcecada com animais. Deve responder usando no maximo 25 palavras. ";

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
    
    // Add custom formatting instructions to prevent backtick usage in JSON
    const customFormatInstructions = `Respond with a JSON object of the following schema:
{
  "action": "Final Answer" | string,
  "action_input": string
}
Do not use backticks (\`) in your response. Always use proper JSON formatting with double quotes.`;

    agentExecutor = await initializeAgentExecutorWithOptions(
      tools,
      model,
      {
        agentType: "chat-conversational-react-description",
        verbose: true,
        agentArgs: {
          systemMessage: SYSTEM_PROMPT,
          formatInstructions: customFormatInstructions,
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
    
    // Also write greeting to conversation file
    appendBotResponseToConversation(response);
    
    return response;
  } catch (error) {
    console.error("Error in greeting:", error);
    const fallbackResponse = "Olá! Como estão?";
    
    // Write fallback greeting to conversation file
    appendBotResponseToConversation(fallbackResponse);
    
    return fallbackResponse; // Fallback greeting
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
        await handleGreeting("Criador: A Maria acabou de aterrar num canal de voz e deve saudar os membros e perguntar á vanessa quem são os burros que estão no canal de voz, usando no maximo 20 palavras:");
    } catch (error) {
        console.error("Error starting bot:", error);
    }
}

function removeKeyword(message, keyword) {
    const index = message.indexOf(keyword);
    return index > -1 ? message.slice(0, index) + message.slice(index + keyword.length) : message;
}

// Update the chatgpt function to remove sister reference check
async function chatgpt(message, msg, isFromOtherBot = false) {
  console.log("Agent request:", message, isFromOtherBot ? "(from other bot)" : "");
  
  try {
    // Remove the sister reference check
    
    // Initialize agent if not already done
    if (!agentExecutor) {
      await initializeAgent();
    }
    
    const startTime = Date.now();
    
    // Keep track of conversation for context
    const conversationHistory = messageHistory.map(m => `${m.role}: ${m.content}`).join("\n");
    
    // Modify the prompt if the message is from the other bot
    let processedMessage = message;
    if (isFromOtherBot) {
      processedMessage = `A tua irmã ${OTHER_BOT_ID} está a falar contigo. Ela disse: "${message}"`;
    }
    
    // Run the agent
    console.log("Starting LLM call...");
    const response = await agentExecutor.call({
      input: processedMessage + ".",
      chat_history: conversationHistory || [],
    });
    
    const endTime = Date.now();
    console.log(`Agent response time: ${(endTime - startTime) / 1000}s`);
    console.log("Agent response:", response);
    
    // Extract the response text
    let responseText = response.output || "Sorry, I couldn't generate a response.";
    
    // If response is somehow formatted as JSON, extract just the message text
    if (typeof responseText === 'string' && responseText.includes('"message"')) {
      try {
        const parsed = JSON.parse(responseText);
        if (parsed && parsed.message) {
          responseText = parsed.message;
        }
      } catch (e) {
        // Not valid JSON, use as is
        console.log("Response looked like JSON but wasn't parseable, using as is");
      }
    }
    
    // Log the final response text for debugging
    console.log(`Final response text: "${responseText}"`);
    
    // Save to history (maintain backward compatibility)
    if (messageHistory.length >= MAX_HISTORY_LENGTH * 2) {
      // Remove oldest pair of messages
      messageHistory.splice(0, 2);
    }
    
    messageHistory.push({ role: "user", content: processedMessage });
    messageHistory.push({ role: "assistant", content: responseText });
    
    // Handle text-to-speech
    saveTextStream(responseText, audiohandler);
    
    // Send to Discord if in a channel
    if (msg && msg.channel) {
      await msg.channel.send(responseText);
    }
    
    // Write the response to Maria's conversation file
    appendBotResponseToConversation(responseText);
    
  } catch (error) {
    console.error("Error in agent function:", error);
    
    // Send error message to Discord if possible
    if (msg && msg.channel) {
      await msg.channel.send("Desculpa, estou com um problema técnico neste momento.");
    }
    
    // Write error response to conversation.data file
    appendBotResponseToConversation("Desculpa, estou com um problema técnico neste momento.");
  }
}

// Add a direct LLM call function for simpler/faster responses
async function directLLMCall(message) {
  const startTime = Date.now();
  try {
    const result = await model.invoke(message);
    console.log(`Direct LLM call time: ${(Date.now() - startTime) / 1000}s`);
    
    // Make sure we're returning just the text content
    let responseText = result.content;
    
    // If somehow we get a JSON string response, extract just the message
    if (typeof responseText === 'string' && responseText.includes('"message"')) {
      try {
        const parsed = JSON.parse(responseText);
        if (parsed && parsed.message) {
          responseText = parsed.message;
        }
      } catch (e) {
        // Not valid JSON, use as is
        console.log("Response looked like JSON but wasn't parseable, using as is");
      }
    }
    
    console.log(`Final response text: "${responseText}"`);
    return responseText;
  } catch (error) {
    console.error("Error in direct LLM call:", error);
    return "Erro no processamento da mensagem.";
  }
}

// Constants for voice state tracking
const SPEAKING_STATE_FILE = path.join(__dirname, `${BOT_ID}_speaking.state`);
const OTHER_BOT_SPEAKING_STATE_FILE = path.join(__dirname, `${OTHER_BOT_ID}_speaking.state`);
let currentAudioPlayer = null;
let isSpeaking = false;

// Initialize speaking state file - make sure it exists and is set to 0 (not speaking)
fs.writeFileSync(SPEAKING_STATE_FILE, "0", 'utf8');
console.log(`Initialized speaking state file: ${SPEAKING_STATE_FILE}`);

// Function to update bot's speaking state with better error handling and logging
function updateSpeakingState(speaking) {
  try {
    isSpeaking = speaking;
    fs.writeFileSync(SPEAKING_STATE_FILE, speaking ? "1" : "0", 'utf8');
    console.log(`Updated speaking state to: ${speaking ? "speaking" : "not speaking"}`);
  } catch (error) {
    console.error(`Failed to update speaking state file: ${error.message}`);
  }
}

// Function to check if the other bot is speaking - fix the file-based check to avoid Promise issues
function isOtherBotSpeaking() {
  try {
    if (!fs.existsSync(OTHER_BOT_SPEAKING_STATE_FILE)) {
      console.log(`Other bot speaking state file doesn't exist: ${OTHER_BOT_SPEAKING_STATE_FILE}`);
      return false;
    }
    
    const state = fs.readFileSync(OTHER_BOT_SPEAKING_STATE_FILE, 'utf8');
    console.log(`Read speaking state: "${state.trim()}" from ${OTHER_BOT_SPEAKING_STATE_FILE}`);
    
    // Check if the content is "1" (speaking)
    const isSpeaking = state.trim() === "1";
    
    // File timestamp check for potential stale data
    if (isSpeaking) {
      try {
        // Check if the file is stale based on modification time
        const stats = fs.statSync(OTHER_BOT_SPEAKING_STATE_FILE);
        const fileAgeMs = Date.now() - stats.mtimeMs;
        console.log(`Other bot speaking state file age: ${fileAgeMs}ms, mtime: ${new Date(stats.mtimeMs).toISOString()}`);
        
        if (fileAgeMs > 20000) {
          console.log(`Warning: Other bot's speaking state file is stale (${fileAgeMs}ms old). Assuming not speaking.`);
          return false;
        }
      } catch (statError) {
        console.error(`Error checking file stats: ${statError.message}`);
      }
    }
    
    return isSpeaking;
  } catch (error) {
    console.error(`Error reading other bot speaking state: ${error.message}`);
    return false;
  }
}

// Create a fallback method to check active bot status in Discord
async function checkIfOtherBotActive() {
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return false;
    
    const otherBot = guild.members.cache.get(OTHER_BOT_DISCORD_ID);
    if (!otherBot) return false;
    
    // Check if bot is in voice channel and voice is active
    return otherBot.voice.channelId === CHANNEL_ID && !otherBot.voice.mute;
  } catch (error) {
    console.error("Error checking other bot Discord status:", error);
    return false;
  }
}

// Add a more aggressive file update function
function forceUpdateSpeakingState(speaking) {
  try {
    // First try normal write
    fs.writeFileSync(SPEAKING_STATE_FILE, speaking ? "1" : "0", 'utf8');
    
    // Then force a file sync to ensure it's written to disk
    const fd = fs.openSync(SPEAKING_STATE_FILE, 'r+');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    
    console.log(`Force-updated speaking state to: ${speaking ? "speaking" : "not speaking"}`);
    
    // Double-check the file was updated with the correct content
    const content = fs.readFileSync(SPEAKING_STATE_FILE, 'utf8');
    if (content.trim() !== (speaking ? "1" : "0")) {
      console.error(`Warning: Speaking state file content mismatch. Expected: ${speaking ? "1" : "0"}, Got: ${content.trim()}`);
    }
  } catch (error) {
    console.error(`Error force-updating speaking state: ${error.message}`);
  }
}

// Improved audio handler with more reliable state management
function audiohandler(audioStream) {
  // Save the current state before speaking
  forceUpdateSpeakingState(true);
  
  const audioPlayer = createAudioPlayer();
  currentAudioPlayer = audioPlayer;
  
  // Set up event listeners for the audio player
  audioPlayer.on(AudioPlayerStatus.Playing, () => {
    console.log("Audio player is now playing");
    forceUpdateSpeakingState(true);
  });
  
  audioPlayer.on(AudioPlayerStatus.Idle, () => {
    console.log("Audio player is now idle");
    forceUpdateSpeakingState(false);
    
    // Double-check that the state file is updated after a short delay
    setTimeout(() => {
      forceUpdateSpeakingState(false);
    }, 200);
  });
  
  audioPlayer.on('error', error => {
    console.error("Audio player error:", error);
    forceUpdateSpeakingState(false);
  });
  
  const stream = new PassThrough();
  audioStream.pipe(stream);
  const resource = createAudioResource(stream);
  audioPlayer.play(resource);
  connection.subscribe(audioPlayer);
}

// Improved wait function for other bot to stop speaking - using only file-based detection
async function waitUntilOtherBotStopsTalking() {
  console.log("Checking if other bot is currently speaking...");
  
  // Add a 3-second wait before starting to check speaking state
  console.log(`Waiting 3 seconds before checking ${OTHER_BOT_ID}'s speaking state...`);
  await wait(3000);
  console.log("Wait complete, now checking speaking state");
  
  const startTime = Date.now();
  const maxWaitTime = 15000; // 15 seconds maximum wait
  
  let continuousNotSpeaking = 0;
  const requiredNotSpeakingChecks = 2; // Number of consecutive "not speaking" checks required
  
  while (true) {
    // Only check the file state - as requested by user
    const fileSpeakingState = isOtherBotSpeaking();
    
    console.log(`Speaking check: File=${fileSpeakingState}`);
    
    if (!fileSpeakingState) {
      continuousNotSpeaking++;
      console.log(`${OTHER_BOT_ID} not speaking (${continuousNotSpeaking}/${requiredNotSpeakingChecks})`);
      
      if (continuousNotSpeaking >= requiredNotSpeakingChecks) {
        console.log(`${OTHER_BOT_ID} confirmed not speaking after ${continuousNotSpeaking} checks`);
        break;
      }
    } else {
      continuousNotSpeaking = 0;
      console.log(`${OTHER_BOT_ID} is speaking. Waiting...`);
    }
    
    // Safety timeout
    if (Date.now() - startTime > maxWaitTime) {
      console.log(`Reached maximum wait time (${maxWaitTime}ms), forcing response`);
      break;
    }
    
    await wait(500); // Check every 500ms
  }
  
  console.log(`${OTHER_BOT_ID} has stopped speaking or wait time elapsed`);
  
  // Natural pause
  await wait(800);
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
    
    // Start the file watcher after joining the channel
    startFileWatcher();
    
    console.log("-".repeat(50));
    voice = VOICE_FEMALE;
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
    } else if (lowerCaseContent === "!speakreset") {
        forceUpdateSpeakingState(false);
        await message.channel.send(`Reset speaking state for ${BOT_ID}`);
    } else if (lowerCaseContent === "!speakstatus") {
        const myState = fs.readFileSync(SPEAKING_STATE_FILE, 'utf8').trim();
        let otherState = "unknown";
        try {
          otherState = fs.existsSync(OTHER_BOT_SPEAKING_STATE_FILE) ? 
            fs.readFileSync(OTHER_BOT_SPEAKING_STATE_FILE, 'utf8').trim() : "file missing";
        } catch (e) { /* Handle error */ }
        
        await message.channel.send(`Speaking states:\n${BOT_ID}: ${myState}\n${OTHER_BOT_ID}: ${otherState}`);
    }
});

client.login(BOT_TOKEN).catch(error => {
    console.error("Error logging in:", error);
    process.exit(1);
});

// Add a function to append bot responses to its own conversation file
function appendBotResponseToConversation(response) {
  try {
    // Check if the response is an object or JSON string, extract just the message text
    let plainTextResponse = response;
    let hasBotPrefix = false;
    
    // Handle object responses
    if (typeof response === 'object' && response !== null) {
      if (response.message) {
        plainTextResponse = response.message;
      } else if (response.response) {
        plainTextResponse = response.response;
        // Check if it already has bot prefix
        hasBotPrefix = plainTextResponse.startsWith(BOT_RESPONSE_PREFIX);
      } else if (response.text) { // Add handling for 'text' field
        plainTextResponse = response.text;
        hasBotPrefix = plainTextResponse.startsWith(BOT_RESPONSE_PREFIX);
      } else if (response.content) {
        plainTextResponse = response.content;
      } else {
        // Try to convert the whole object to a string
        plainTextResponse = JSON.stringify(response);
      }
    }
    
    // Handle JSON string responses
    if (typeof plainTextResponse === 'string') {
      try {
        // Check for various JSON formats
        if (plainTextResponse.startsWith("{") && 
            (plainTextResponse.includes('"message"') || 
             plainTextResponse.includes('"response"') || 
             plainTextResponse.includes('"text"'))) {
          
          const parsed = JSON.parse(plainTextResponse);
          
          if (parsed.message) {
            plainTextResponse = parsed.message;
          } else if (parsed.response) {
            let responseText = parsed.response;
            if (responseText.startsWith(BOT_RESPONSE_PREFIX)) {
              responseText = responseText.substring(BOT_RESPONSE_PREFIX.length).trim();
            }
            plainTextResponse = responseText;
          } else if (parsed.text) { // Add handling for 'text' field
            let textContent = parsed.text;
            if (textContent.startsWith(BOT_RESPONSE_PREFIX)) {
              textContent = textContent.substring(BOT_RESPONSE_PREFIX.length).trim();
            }
            plainTextResponse = textContent;
          }
        }
      } catch (e) {
        // Not valid JSON, use as is
        console.log("Response looked like JSON but wasn't parseable, using as is");
      }
    }
    
    // If the plainTextResponse already has a bot prefix, remove it to avoid duplication
    if (hasBotPrefix && plainTextResponse.startsWith(BOT_RESPONSE_PREFIX)) {
      plainTextResponse = plainTextResponse.substring(BOT_RESPONSE_PREFIX.length).trim();
    }
    
    // Format the response with the bot identifier - ensure no JSON formatting
    const formattedResponse = `${BOT_RESPONSE_PREFIX} ${plainTextResponse}\n`;
    
    // Append to the conversation file
    fs.appendFileSync(CONVERSATION_FILE, formattedResponse, 'utf8');
    console.log(`Appended bot response to conversation file: ${plainTextResponse.substring(0, 50)}...`);
  } catch (error) {
    console.error(`Error appending bot response to conversation file: ${error}`);
  }
}

// Update the file watcher to monitor both conversation files
function startFileWatcher() {
  console.log(`Starting file watcher for: ${OTHER_BOT_CONVERSATION_FILE}`);
  
  // Initial read of the files
  processOtherBotConversationFile();
  
  // Watch for changes to the other bot's conversation file
  const watcher = chokidar.watch(OTHER_BOT_CONVERSATION_FILE, {
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100
    }
  });
  
  watcher.on('change', (path) => {
    console.log(`Detected change in other bot's conversation file at ${getDateTime()}`);
    processOtherBotConversationFile();
  });
  
  watcher.on('error', (error) => {
    console.error(`File watcher error: ${error}`);
  });
  
  console.log(`Bot ${BOT_ID} is now listening for messages from ${OTHER_BOT_ID}`);
}

// Process the other bot's conversation file for new messages
function processOtherBotConversationFile() {
  try {
    if (!fs.existsSync(OTHER_BOT_CONVERSATION_FILE)) {
      console.log('Other bot conversation file does not exist');
      return;
    }
    
    const data = fs.readFileSync(OTHER_BOT_CONVERSATION_FILE, 'utf8');
    const lines = data.split('\n').filter(line => line.trim() !== '');
    
    // Check if there are new lines
    if (lines.length > lastProcessedOtherBotLine) {
      // Only process the most recent line
      const latestLine = lines[lines.length - 1].trim();
      
      console.log(`Processing latest line from ${OTHER_BOT_ID}'s file: ${latestLine}`);
      
      // Skip if it's our own message
      if (latestLine.startsWith(BOT_RESPONSE_PREFIX)) {
        console.log(`Skipping our own message in other file: ${latestLine}`);
      }
      // Check if it's from the other bot
      else if (latestLine.startsWith(OTHER_BOT_RESPONSE_PREFIX)) {
        // Extract message part after the prefix
        let botMessage = latestLine.substring(OTHER_BOT_RESPONSE_PREFIX.length).trim();
        
        // Check if message is in JSON format and extract it
        try {
          if (botMessage.startsWith("{")) {
            const jsonMessage = JSON.parse(botMessage);
            // Check all possible field names for the message content
            if (jsonMessage.message) {
              botMessage = jsonMessage.message;
            } else if (jsonMessage.response) {
              let responseText = jsonMessage.response;
              if (responseText.startsWith(OTHER_BOT_RESPONSE_PREFIX)) {
                responseText = responseText.substring(OTHER_BOT_RESPONSE_PREFIX.length).trim();
              }
              botMessage = responseText;
            } else if (jsonMessage.text) { // Add handling for 'text' field
              let textContent = jsonMessage.text;
              if (textContent.startsWith(OTHER_BOT_RESPONSE_PREFIX)) {
                textContent = textContent.substring(OTHER_BOT_RESPONSE_PREFIX.length).trim();
              }
              botMessage = textContent;
            }
          }
        } catch (e) {
          // If JSON parsing fails, use the message as is
          console.log("Message is not in JSON format or couldn't be parsed, using as is:", e.message);
        }
        
        console.log(`Detected new message from ${OTHER_BOT_ID}: ${botMessage}`);
        console.log(`Checking if ${OTHER_BOT_ID} is still speaking before responding...`);
        
        // Replace the fixed timeout with our new dynamic wait function
        (async () => {
          // Wait until the other bot stops talking
          await waitUntilOtherBotStopsTalking();
          
          // Now respond to the message
          console.log(`Responding to ${OTHER_BOT_ID} after they finished speaking`);
          chatgpt(`${OTHER_BOT_ID}: ${botMessage}`, null, true);
        })();
      }
      
      // Handle user messages (not from either bot)
      else {
        // Check if line follows a specific format (e.g., "username: message")
        const match = latestLine.match(/^([^:]+):\s*(.+)$/);
        
        if (match) {
          const username = match[1].trim();
          const message = match[2].trim();
          
          // Skip if it seems to be from the other bot
          if (username.toLowerCase() === OTHER_BOT_ID.toLowerCase()) {
            console.log(`Skipping duplicate message from ${OTHER_BOT_ID}`);
          } else {
            // Process the message using the existing chatgpt function
            chatgpt(`${username}: ${message}`);
          }
        } else {
          // If no username format, just process the whole line
          chatgpt(`User: ${latestLine}`);
        }
      }
      
      // Update the last processed line index
      lastProcessedOtherBotLine = lines.length;
    }
  } catch (error) {
    console.error(`Error processing other bot's conversation file: ${error}`);
  }
}

// Add a constant for the other bot's Discord ID near the top with other constants
const OTHER_BOT_DISCORD_ID = '775418385697341470'; // This should be Vanessa's Discord ID

// Add a wait function to use with async/await
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}