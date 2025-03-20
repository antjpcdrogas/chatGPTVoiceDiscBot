const { ChatOpenAI } = require("langchain/chat_models/openai");
const { initializeAgentExecutorWithOptions } = require("langchain/agents");
const { DynamicTool, DynamicStructuredTool } = require("langchain/tools");
const { z } = require("zod");
const { BufferMemory } = require("langchain/memory");
const axios = require("axios");
const fs = require('fs');
const path = require('path');

// Initialize LangChain memory with appropriate configuration
const memory = new BufferMemory({
  returnMessages: true,
  memoryKey: "chat_history",
  inputKey: "input",
  outputKey: "output",
});

// Create agent executor (outside of functions to initialize once)
let agentExecutor = null;

const setupAgent = (config) => {
  const {
    OPENROUTER_MODEL,
    OPENROUTER_API_KEY,
    OPENROUTER_BASE_URL,
    TEMPERATURE,
    MAX_TOKENS,
    SYSTEM_PROMPT,
    GUILD_ID,
    CHANNEL_ID,
    client,
    YOUTUBE_API_KEY
  } = config;

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
              
              const strikeData = config.getStrikes(username);
              if (!strikeData) return `${username} has no strikes.`;
              
              const readableDate = config.formatDate(strikeData.timestamp);
              return `${username} has ${strikeData.count} strike${strikeData.count > 1 ? 's' : ''}. Last strike received on ${readableDate}.`;
            }
            case "list": {
              const allStrikes = config.readStrikes();
              const users = Object.keys(allStrikes);
              
              if (users.length === 0) return "No users have strikes at the moment.";
              
              let response = `**Strike Record (${users.length} users):**\n\n`;
              
              Object.entries(allStrikes)
                .sort((a, b) => b[1].count - a[1].count) // Sort by strike count descending
                .forEach(([user, data]) => {
                  response += `- ${user}: ${data.count} strike${data.count > 1 ? 's' : ''} (Last: ${config.formatDate(data.timestamp)})\n`;
                });
              
              return response;
            }
            case "reset": {
              if (!username) return "Please specify which user's strikes you want to reset.";
              
              const hadStrikes = config.resetStrikes(username);
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

  return { model, tools };
};

// Replace Ollama connection check with OpenRouter check
async function checkOpenRouterConnection(OPENROUTER_BASE_URL, OPENROUTER_API_KEY) {
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

async function initializeAgent(config) {
  if (agentExecutor) return agentExecutor;
  
  try {
    // Update connection check for OpenRouter
    const openRouterAvailable = await checkOpenRouterConnection(config.OPENROUTER_BASE_URL, config.OPENROUTER_API_KEY);
    if (!openRouterAvailable) {
      console.log("OpenRouter connection failed. Check your API key and account status.");
      // Could add a retry mechanism here
    }
    
    const { model, tools } = setupAgent(config);
    
    agentExecutor = await initializeAgentExecutorWithOptions(
      tools,
      model,
      {
        agentType: "chat-conversational-react-description",
        verbose: true,
        memory: memory, // Add the memory component to the agent
        agentArgs: {
          systemMessage: config.SYSTEM_PROMPT
        }
      }
    );
    console.log("Agent initialized successfully with OpenRouter model:", config.OPENROUTER_MODEL);
    return agentExecutor;
  } catch (error) {
    console.error("Error initializing agent:", error);
    return null;
  }
}

// Replace a dedicated greeting function that uses the agent instead of direct LLM calls
async function handleGreeting(greetingPrompt, audioCallback) {
  console.log("Processing greeting with agent call:", greetingPrompt);
  const startTime = Date.now();
  
  try {
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
    if (audioCallback) {
      audioCallback(responseText);
    }
    
    return responseText;
  } catch (error) {
    console.error("Error in greeting:", error);
    return "Olá! Como estão?"; // Fallback greeting
  }
}

// Replace the chatgpt function with improved agent-only version
async function chatgpt(message, msg, audioCallback, sendToChannel) {
  console.log("Agent request:", message);
  const startTime = Date.now(); // Add timing measurement
  
  try {
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
    if (audioCallback) {
      audioCallback(responseText);
    }
    
    // Send to Discord if in a channel
    if (sendToChannel && msg && msg.channel) {
      await sendToChannel(msg, responseText);
    }
    
    return responseText;
  } catch (error) {
    console.error("Error in agent function:", error);
    
    // Send error message to Discord if possible
    if (sendToChannel && msg && msg.channel) {
      await sendToChannel(msg, "Desculpa, estou com um problema técnico neste momento.");
    }
    
    return "Desculpa, estou com um problema técnico neste momento.";
  }
}

// Keep a simplified version only as ultimate fallback for critical errors
async function directLLMCall(message, model) {
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

// Clear memory function
async function clearMemory() {
  try {
    await memory.clear();
    return true;
  } catch (error) {
    console.error("Error clearing memory:", error);
    return false;
  }
}

module.exports = {
  initializeAgent,
  handleGreeting,
  chatgpt,
  directLLMCall,
  clearMemory
};
