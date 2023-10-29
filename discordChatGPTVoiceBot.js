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
const { triggerRandomly } = require('./functions');
const { getDateTime } = require('./functions');
const { Client, GatewayIntentBits} = require('discord.js')
const { addSpeechEvent } = require("discord-speech-recognition");
const { joinVoiceChannel } = require('@discordjs/voice');
const { createAudioPlayer } = require('@discordjs/voice');
const { createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const sdk = require("microsoft-cognitiveservices-speech-sdk");
const { ConversationChain  } = require("langchain/chains");
const { ChatOpenAI  } = require("langchain/chat_models/openai");
//Import the Memory module
const { BufferMemory } = require("langchain/memory");
//Import the PromptTemplate module
const { PromptTemplate } = require("langchain/prompts");


voice_female="pt-BR-FranciscaNeural";
voice_male="pt-BR-AntonioNeural";
voice_joao="pt-PT-DuarteNeural";
voice="";
const gptModel="gpt-3.5-turbo-0613"; // update this to use a different model. Available models: https://beta.openai.com/docs/engines
const Temperature=1; // temperature of the bot
const MaxTokens=100; // max tokens of the bot
const VoiceLanguage="pt-PT"; // language of discord voice channel
gTTSLanguage="pt"; // language of the bot
const volume=0.3;
require('dotenv').config()

const VERSION = process.env.npm_package_config_version;
// take this value as script argument
const botDiscId=process.env.botDiscId
const channelId=process.env.channelId
const guildId=process.env.guildId
const speech_key=process.env.SPEECH_KEY


const speechConfig = sdk.SpeechConfig.fromSubscription(speech_key, "eastus");
speechConfig.speechSynthesisLanguage = "pt-PT";
speechConfig.speechSynthesisVoiceName = voice_female; // Use a different voice
//adjust volume
speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio16Khz128KBitRateMonoMp3;
speechConfig.setProfanity(sdk.ProfanityOption.Raw);
speechConfig.speechSynthesisVolume = volume;
const audioConfig = sdk.AudioConfig.fromDefaultSpeakerOutput();
const synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);  

const { PassThrough } = require('stream');

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

addSpeechEvent(client, { lang: VoiceLanguage ,
    profanityFilter: false,
    });

//Start ConversationChain Requirements
const model = new ChatOpenAI({ model: gptModel,
    max_tokens: MaxTokens,
    temperature: Temperature,
    frequencyPenalty: 2.0,
    presencePenalty: 2.0,
    cache: true,
    stop: [" Vanessa:"],
    stream: true });

   const template = `Conversa entre amigos num membros do canal de voz(pessoas) e a IA, chamada Vanessa. A Vanessa é de poucas palavras.
            
                        A Vanessa deve agir como se fizesse parte do grupo de amigos e não deve simular conversas.
                        Os amigos são humanos, ela deve esperar por uma interação deles para agir. 
                        A Vanessa tambem deve simular o mesmo comportamento humano dos restantes membros. 
                        Ela é inteligente mas arrogante e ordinária e responde SEMPRE com respostas curtas e assertivas, usando o mínimo de palavras possivel. 
                        Ela deve sempre incluir na frase o nome da outra pessoa.  
        
        Current conversation:

        {chat_history}
        {input}
        Vanessa:`;
const memory = new BufferMemory({ memoryKey: "chat_history",ai_prefix: "Vanessa:"});
const prompt = PromptTemplate.fromTemplate(template);       
const chain = new ConversationChain({ llm: model, prompt, memory });

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
    //get number of members in the voice channel
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
    // Create a new ReadableStream from the audio stream
    var stream = new PassThrough();
    audioStream.pipe(stream);

    // Play the stream in the current voice connection
    const resource = createAudioResource(stream);
    audioPlayer.play(resource);
    connection.subscribe(audioPlayer);
  }


client.on('messageCreate', (msg) => {
  // Check if the message is from the bot itself to avoid an infinite loop
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
      
      //bot trigger word
      let result_message = msg.content.includes(character);   
      mensagem_user=removeKeyword(msg.content,character);
      
      if (result_message) {
          //wait 2 seconds before replying
          //setTimeout(function() {
              chatgpt("Carlos: "  + mensagem_user + ".",msg);
        //    }, 15000);
       }
      }
      else {          
          return;
      }  
  }
  );

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

  
   mensagem_user=removeKeyword(msg.content,character);
    if (result_responde) {
        console.log("ChatGPT request:" + mensagem_user)
       

chatgpt(msg.author.username +": "  + mensagem_user + ".",msg);

    }
});




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
    if (message.content.toLowerCase().includes("!version")) { 
        message.channel.send(VERSION)
    }
})

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

client.login(process.env.BOT_TOKEN);
