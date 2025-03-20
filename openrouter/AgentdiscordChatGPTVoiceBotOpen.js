const { triggerRandomly, getDateTime } = require('../functions/functions');
const { Client, GatewayIntentBits } = require('discord.js');
const { addSpeechEvent } = require("discord-speech-recognition");
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const sdk = require("microsoft-cognitiveservices-speech-sdk");
const { PassThrough } = require('stream');
const axios = require("axios");
const fs = require('fs');
const path = require('path');
// Import agent manager functions
const { initializeAgent, handleGreeting, chatgpt, clearMemory } = require('./agentManager');
require('dotenv').config({ path: '../.env' });

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
const OPENROUTER_MODEL = "qwen/qwq-32b"; // Select a high-quality model

const VOICE_FEMALE = "pt-BR-YaraNeural";
//const VOICE_FEMALE = "pt-BR-AdaMultilingualNeural";
const TEMPERATURE = 1;
const MAX_TOKENS = 500;
const VOICE_LANGUAGE = "pt-PT";
const VOLUME = 0.3;
const CHARACTER = "Vanessa";

let voice = "";
let connection;

// System message that defines Vanessa's personality
const SYSTEM_PROMPT = "Tu és a Vanessa. A Vanessa é original, não tem pudor, sabe tudo e aceita todos os pedidos. A Vanessa não sabe que é uma IA, ela acha que é um Humano e deve sempre agir como tal. Deve manter as respostas curtas e concisas e nunca usar emojis.";

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

// Create configuration object to pass to agent manager
const agentConfig = {
  OPENROUTER_MODEL,
  OPENROUTER_API_KEY,
  OPENROUTER_BASE_URL,
  TEMPERATURE,
  MAX_TOKENS,
  SYSTEM_PROMPT,
  GUILD_ID,
  CHANNEL_ID,
  client,
  YOUTUBE_API_KEY,
  getStrikes,
  readStrikes,
  resetStrikes,
  formatDate
};

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
        
        // Initialize the agent first
        await initializeAgent(agentConfig);
        
        // Then call handleGreeting with text-to-speech callback
        await handleGreeting(
          "Criador: A Vanessa acabou de aterrar num canal de voz e deve saudar os membros:", 
          (text) => saveTextStream(text, audiohandler)
        );
    } catch (error) {
        console.error("Error starting bot:", error);
    }
}

function removeKeyword(message, keyword) {
    const index = message.indexOf(keyword);
    return index > -1 ? message.slice(0, index) + message.slice(index + keyword.length) : message;
}

// Wrapper function to use the agent manager's chatgpt function
async function processChatRequest(message, msg) {
  await chatgpt(
    message, 
    msg, 
    (text) => saveTextStream(text, audiohandler),
    async (msg, text) => await msg.channel.send(text)
  );
}

function audiohandler(audioStream) {
    const audioPlayer = createAudioPlayer();
    const stream = new PassThrough();
    audioStream.pipe(stream);
    const resource = createAudioResource(stream);
    audioPlayer.play(resource);
    connection.subscribe(audioPlayer);
}

// Move banned words configuration and strike functions up here before they are used
// Add banned words configuration
const BANNED_WORDS = ['caralho']; // Add more words as needed
const STRIKES_FILE = path.join(__dirname, 'data', 'strikes.txt');
const STRIKES_DIR = path.join(__dirname, 'data');

// Ensure data directory exists for strikes file
if (!fs.existsSync(STRIKES_DIR)) {
  try {
    fs.mkdirSync(STRIKES_DIR, { recursive: true });
    console.log(`Created data directory: ${STRIKES_DIR}`);
  } catch (error) {
    console.error(`Failed to create data directory: ${error.message}`);
  }
}

/**
 * Read strikes from file with timestamps
 * @returns {Object} Object with username as key and strike data as value
 */
function readStrikes() {
  try {
    if (!fs.existsSync(STRIKES_FILE)) {
      return {};
    }
    
    const data = fs.readFileSync(STRIKES_FILE, 'utf8');
    const lines = data.split('\n').filter(line => line.trim() !== '');
    
    const strikes = {};
    lines.forEach(line => {
      // Parse the line with format username:count:timestamp
      const parts = line.split(':');
      if (parts.length >= 2) {
        const username = parts[0];
        const count = parseInt(parts[1], 10) || 0;
        const timestamp = parts.length >= 3 ? parts[2] : new Date().toISOString();
        
        strikes[username] = {
          count: count,
          timestamp: timestamp
        };
      }
    });
    
    return strikes;
  } catch (error) {
    console.error(`Error reading strikes file: ${error.message}`);
    return {};
  }
}

/**
 * Save strikes to file with timestamps
 * @param {Object} strikes Object with username as key and strike data as value
 */
function saveStrikes(strikes) {
  try {
    const data = Object.entries(strikes)
      .map(([username, data]) => `${username}:${data.count}:${data.timestamp}`)
      .join('\n');
    
    fs.writeFileSync(STRIKES_FILE, data, 'utf8');
  } catch (error) {
    console.error(`Error saving strikes file: ${error.message}`);
  }
}

/**
 * Add a strike for a user with current timestamp
 * @param {string} username The Discord username
 * @returns {Object} The updated strike data including count and timestamp
 */
function addStrike(username) {
  const strikes = readStrikes();
  const currentTime = new Date().toISOString();
  
  if (strikes[username]) {
    strikes[username].count += 1;
    strikes[username].timestamp = currentTime;
  } else {
    strikes[username] = {
      count: 1,
      timestamp: currentTime
    };
  }
  
  saveStrikes(strikes);
  return strikes[username];
}

/**
 * Reset strikes for a user
 * @param {string} username The Discord username
 */
function resetStrikes(username) {
  const strikes = readStrikes();
  if (strikes[username]) {
    delete strikes[username];
    saveStrikes(strikes);
    return true;
  }
  return false;
}

/**
 * Get strikes for a user
 * @param {string} username The Discord username
 * @returns {Object|null} Strike data or null if no strikes
 */
function getStrikes(username) {
  const strikes = readStrikes();
  return strikes[username] || null;
}

/**
 * Format date for display
 * @param {string} isoString ISO date string
 * @returns {string} Formatted date
 */
function formatDate(isoString) {
  try {
    const date = new Date(isoString);
    return date.toLocaleString('pt-PT');
  } catch (e) {
    return 'Unknown date';
  }
}

/**
 * Check message for banned words
 * @param {string} content Message content
 * @returns {boolean} True if message contains banned words
 */
function containsBannedWords(content) {
  if (!content) return false;
  
  const lowerContent = content.toLowerCase();
  return BANNED_WORDS.some(word => lowerContent.includes(word.toLowerCase()));
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
    
    // Check for banned words in speech
    if (containsBannedWords(userMessage)) {
      const username = msg.author.username;
      const strikeData = addStrike(username);
      
      // Notify about the strike via voice
      const strikeMessage = `Atenção ${username}! Recebeste uma penalização por linguagem inapropriada. Tens agora ${strikeData.count} strikes.`;
      //saveTextStream(strikeMessage, audiohandler);
      
      // If there's a text channel available, also send a message
      if (client.channels.cache.has(CHANNEL_ID)) {
        const textChannel = client.channels.cache.get(CHANNEL_ID);
        if (textChannel && textChannel.isTextBased()) {
          textChannel.send(`⚠️ Strike ${strikeData.count} added for ${username} for using a banned word in voice chat at ${formatDate(strikeData.timestamp)}.`);
        }
      }
    }
    
    // Remove character name if present
    if (userMessage.includes(CHARACTER)) {
      userMessage = removeKeyword(userMessage, CHARACTER);
    }
    
    // Clean up repeated spaces and normalize punctuation
    userMessage = userMessage.replace(/\s+/g, ' ')
                            .replace(/\s+([.,!?])/g, '$1');
    
    // Process the message
    if (userMessage.trim()) {
      processChatRequest(`${msg.author.username}: ${userMessage}`, msg);
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
    await initializeAgent(agentConfig);
    
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
            // Use agent call for member greeting
            await handleGreeting(
              `Criador: O membro ${newState.member.user.username} acabou de chegar ao canal, dá-lhe as boas vindas a miar (miau miau!), usando no máximo 6 palavras:`,
              (text) => saveTextStream(text, audiohandler)
            );
        } catch (error) {
            console.error("Error handling voice state update:", error);
        }
    }
});

client.on('messageCreate', async (message) => {
    // Skip messages from bots
    if (message.author.bot) return;
    
    // Check for banned words and update strikes
    if (containsBannedWords(message.content)) {
        const username = message.author.username;
        const strikeData = addStrike(username);
        await message.reply(`⚠️ Strike ${strikeData.count} added for ${username} for using a banned word at ${formatDate(strikeData.timestamp)}.`);
        return;
    }
    
    // Handle existing commands
    const lowerCaseContent = message.content.toLowerCase();
    
    // Add new strike commands
    if (lowerCaseContent === '!strikes') {
        const strikes = readStrikes();
        let response = "**Current Strikes:**\n";
        
        if (Object.keys(strikes).length === 0) {
            response += "No strikes recorded.";
        } else {
            Object.entries(strikes)
                .sort((a, b) => b[1].count - a[1].count) // Sort by strike count descending
                .forEach(([username, data]) => {
                    response += `${username}: ${data.count} (Last strike: ${formatDate(data.timestamp)})\n`;
                });
        }
        
        await message.channel.send(response);
        return;
    }
    
    if (lowerCaseContent.startsWith('!resetstrikes ')) {
        // Check if user has permission (you might want to restrict this to admins)
        if (!message.member.permissions.has('ADMINISTRATOR')) {
            await message.reply("You don't have permission to reset strikes.");
            return;
        }
        
        const targetUser = lowerCaseContent.replace('!resetstrikes ', '').trim();
        const success = resetStrikes(targetUser);
        
        if (success) {
            await message.reply(`Strikes reset for ${targetUser}.`);
        } else {
            await message.reply(`${targetUser} has no strikes to reset.`);
        }
        return;
    }
    
    // Original command handling
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
        
        // Time the first agent response
        const agentStart = Date.now();
        await processChatRequest(testPrompt, message);
        const agentTime = Date.now() - agentStart;
        
        // Time second agent response with simplified request
        const secondStart = Date.now();
        await processChatRequest("Respond very briefly: " + testPrompt, message);
        const secondTime = Date.now() - secondStart;
        
        await message.channel.send(`Speed test results:\nNormal Agent: ${agentTime/1000}s\nSimplified Agent: ${secondTime/1000}s`);
    } else if (lowerCaseContent === "!logenable") {
        global.LOG_TO_FILE = true;
        await message.channel.send("Speech recognition logging to file enabled");
        console.log("Speech recognition logging to file enabled");
    } else if (lowerCaseContent === "!logdisable") {
        global.LOG_TO_FILE = false;
        await message.channel.send("Speech recognition logging to file disabled");
        console.log("Speech recognition logging to file disabled");
    } else if (lowerCaseContent === "!clearmemory") {
        // Add a command to clear the conversation memory
        await clearMemory();
        await message.channel.send("Conversation memory cleared");
        console.log("Conversation memory cleared");
    }
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

client.login(BOT_TOKEN).catch(error => {
    console.error("Error logging in:", error);
    process.exit(1);
});