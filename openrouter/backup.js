const { triggerRandomly, getDateTime } = require('../functions/functions');
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
// Add LangChain memory imports
const { BufferMemory, ConversationSummaryMemory } = require("langchain/memory");
const { ConversationChain } = require("langchain/chains");
const axios = require("axios");
const fs = require('fs');
const path = require('path');
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

// Initialize LangChain memory with appropriate configuration
const memory = new BufferMemory({
  returnMessages: true,
  memoryKey: "chat_history",
  inputKey: "input",
  outputKey: "output",
});

// Alternative memory option with summarization (commented out)
// const memory = new ConversationSummaryMemory({
//   memoryKey: "chat_history",
//   llm: model,
//   returnMessages: true,
//   inputKey: "input", 
//   outputKey: "output",
//   maxTokenLimit: 1000
// });

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
  // Update Strike Management Tool with more robust input handling
  new DynamicStructuredTool({
    name: "manageStrikes",
    description: "Check or manage user strikes in the system",
    schema: z.object({
      action: z.enum(["check", "list", "reset"]).default("list").describe("The action to perform: check a specific user's strikes, list all users with strikes, or reset strikes for a user"),
      username: z.string().optional().describe("The Discord username to check or reset strikes for (required for check and reset actions)"),
    }),
    func: async (input, runManager) => {
      try {
        // Handle string input or empty object by parsing it
        let action, username;

        if (typeof input === 'string') {
          // Try to parse string input as JSON
          try {
            const parsed = JSON.parse(input);
            action = parsed.action;
            username = parsed.username;
          } catch (e) {
            // If can't parse as JSON, assume it's a username for checking
            username = input;
            action = "check";
          }
        } else {
          // Object input - extract properties
          action = input.action;
          username = input.username;
        }

        // Get requestor information if available through runManager
        const requestingUser = runManager?.metadata?.requestingUser || null;
        
        // Handle empty or invalid inputs
        if (!action || (action !== "list" && !username)) {
          // If no action specified, default to list
          action = action || "list";
          
          // If action requires username but none provided, try to use the requestor's name
          if (action === "check" && !username && requestingUser) {
            username = requestingUser;
            console.log(`Using requestor's username: ${username}`);
          } else if (action === "check" && !username) {
            // Extract username from conversation context if possible
            const lastMessage = memory.chatHistory?.messages?.slice(-1)?.[0]?.content;
            if (lastMessage && lastMessage.includes(":")) {
              const possibleUsername = lastMessage.split(":")[0].trim();
              if (possibleUsername) {
                username = possibleUsername;
                console.log(`Extracted username from message: ${username}`);
              }
            }
          }
        }

        console.log(`Strike tool called with action: ${action}, username: ${username || "none"}`);

        switch (action) {
          case "check": {
            if (!username) return "Please specify which user's strikes you want to check.";
            
            const strikeData = getStrikes(username);
            if (!strikeData) return `${username} has no strikes.`;
            
            const readableDate = formatDate(strikeData.timestamp);
            return `${username} has ${strikeData.count} strike${strikeData.count > 1 ? 's' : ''}. Last strike received on ${readableDate}.`;
          }
          case "list": {
            const allStrikes = readStrikes();
            const users = Object.keys(allStrikes);
            
            if (users.length === 0) return "No users have strikes at the moment.";
            
            let response = `**Strike Record (${users.length} users):**\n\n`;
            
            Object.entries(allStrikes)
              .sort((a, b) => b[1].count - a[1].count) // Sort by strike count descending
              .forEach(([user, data]) => {
                response += `- ${user}: ${data.count} strike${data.count > 1 ? 's' : ''} (Last: ${formatDate(data.timestamp)})\n`;
              });
            
            return response;
          }
          case "reset": {
            if (!username) return "Please specify which user's strikes you want to reset.";
            
            const hadStrikes = resetStrikes(username);
            return hadStrikes 
              ? `Strikes for ${username} have been reset to zero.` 
              : `${username} had no strikes to reset.`;
          }
          default:
            return "Invalid action. Use 'check', 'list', or 'reset'.";
        }
      } catch (error) {
        console.error("Error in strike management tool:", error);
        return `Error managing strikes: ${error.message}`;
      }
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
        memory: memory, // Add the memory component to the agent
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

// Replace a dedicated greeting function that uses the agent instead of direct LLM calls
async function handleGreeting(greetingPrompt) {
  console.log("Processing greeting with agent call:", greetingPrompt);
  const startTime = Date.now();
  
  try {
    // Initialize agent if not already done
    if (!agentExecutor) {
      await initializeAgent();
    }
    
    // Use agent for the greeting
    const response = await agentExecutor.call({
      input: greetingPrompt,
      metadata: { requestingUser: "system" }
    });
    
    console.log(`Greeting response time: ${(Date.now() - startTime) / 1000}s`);
    
    // Extract the response text
    let responseText;
    if (response && typeof response === 'object') {
      if (response.output && response.output.output) {
        responseText = response.output.output;
      } else if (response.output) {
        responseText = typeof response.output === 'string' 
          ? response.output 
          : JSON.stringify(response.output);
      } else if (response.text) {
        responseText = response.text;
      } else {
        responseText = JSON.stringify(response);
      }
    } else if (response) {
      responseText = String(response);
    } else {
      responseText = "Olá! Como estão?"; // Fallback greeting
    }
    
    // Handle text-to-speech for the greeting
    saveTextStream(responseText, audiohandler);
    
    return responseText;
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
        // Use agent call for initial greeting
        await handleGreeting("Criador: A Vanessa acabou de aterrar num canal de voz e deve saudar os membros:");
    } catch (error) {
        console.error("Error starting bot:", error);
    }
}

function removeKeyword(message, keyword) {
    const index = message.indexOf(keyword);
    return index > -1 ? message.slice(0, index) + message.slice(index + keyword.length) : message;
}

// Replace the chatgpt function with improved agent-only version
async function chatgpt(message, msg) {
  console.log("Agent request:", message);
  const startTime = Date.now(); // Add timing measurement
  
  try {
    // Initialize agent if not already done
    if (!agentExecutor) {
      await initializeAgent();
    }
    
    // Extract username from message if available
    let username = null;
    if (message && message.includes(':')) {
      username = message.split(':')[0].trim();
    }
    
    console.log("Starting LLM call using agent executor...");
    
    // Try using agent with better error handling
    let response;
    try {
      response = await agentExecutor.call({
        input: message,
        metadata: { requestingUser: username }
      });
    } catch (error) {
      console.warn("Agent executor error:", error.message);
      
      // Better error handling with agent retry
      console.log("Agent error detected. Attempting simplified agent call as fallback...");
      
      // Simplify the request and try again with the agent
      try {
        const simplifiedPrompt = `${message}\nPlease respond in a simple, conversational way.`;
        response = await agentExecutor.call({
          input: simplifiedPrompt,
          metadata: { requestingUser: username }
        });
      } catch (secondError) {
        console.error("Second agent attempt also failed:", secondError);
        // Ultimate fallback for critical failures
        response = { output: "Desculpe, estou com problemas técnicos neste momento." };
      }
    }
    
    const endTime = Date.now();
    console.log(`Response time: ${(endTime - startTime) / 1000}s`);
    console.log("Response:", response);
    
    // Extract the response text - Fix the nested output structure issue
    let responseText;
    
    // Handle different response structures that might come from the agent
    if (response && typeof response === 'object') {
      // First check for nested output structure (which seems to be happening)
      if (response.output && response.output.output) {
        responseText = response.output.output;
      }
      // Then check for direct output property
      else if (response.output) {
        responseText = typeof response.output === 'string' 
          ? response.output 
          : JSON.stringify(response.output);
      }
      // If response itself is the answer
      else if (response.text) {
        responseText = response.text;
      }
      // Last resort, stringify the whole response
      else {
        responseText = JSON.stringify(response);
      }
    } else if (response) {
      responseText = String(response);
    } else {
      responseText = "Sorry, I couldn't generate a response.";
    }
    
    // Make sure we have a non-empty response
    if (!responseText || responseText.trim() === '') {
      responseText = "Desculpe, ocorreu um problema ao gerar uma resposta.";
    }
    
    // Handle case where the response is still in JSON format
    if (responseText.includes('"action":') && responseText.includes('"action_input":')) {
      try {
        const jsonResponse = JSON.parse(responseText);
        if (jsonResponse.action === "Final Answer" && jsonResponse.action_input) {
          responseText = jsonResponse.action_input;
        }
      } catch (e) {
        // Not valid JSON or not in the expected format, ignore
      }
    }
    
    // Log the extracted response
    console.log(`Extracted response text: "${responseText}"`);
    
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

// Keep a simplified version only as ultimate fallback for critical errors
async function directLLMCall(message) {
  console.warn("WARNING: Using direct LLM call as emergency fallback!");
  const startTime = Date.now();
  try {
    const result = await model.invoke(message);
    console.log(`Emergency direct LLM call time: ${(Date.now() - startTime) / 1000}s`);
    return result.content;
  } catch (error) {
    console.error("Error in emergency direct LLM call:", error);
    return "Erro crítico no processamento da mensagem.";
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
            // Use agent call for member greeting instead of direct LLM call
            await handleGreeting(`Criador: O membro ${newState.member.user.username} acabou de chegar ao canal, dá-lhe as boas vindas a miar (miau miau!), usando no máximo 6 palavras:`);
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
        await chatgpt(testPrompt);
        const agentTime = Date.now() - agentStart;
        
        // Time second agent response with simplified request
        const secondStart = Date.now();
        await chatgpt("Respond very briefly: " + testPrompt);
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
        await memory.clear();
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