# chatgptvoicediscbot ![Prettier Code Formatting](https://img.shields.io/badge/code_style-prettier-brightgreen.svg)

> Discord bot that uses chatGPT under the hood. Written in NodeJS.Prompts and answers using voice with google text-to-speech(gTTS), OpenAI and Discord.
> This is my first nodeJS attempt, only possible because of GitHub co-pilot.

## Installation

```sh
$ npm install --save chatgptvoicediscbot
```

## Features

- Uses official Discord and OpenAI modules
- Continuous conversation in the same session(removed due to high token usage)
- prompts by Voice
- Replies by Voice
- Works with multiple languages
## Usage

```js
var chatgptvoicediscbot = require("chatgptvoicediscbot");
chatgptvoicediscbot();
node discordChatGPTVoiceBot.js

Environment variables:
- BOT_TOKEN
- OPENAI_API_KEY
- botDiscId
- channelId
- guildId
```
 
## Credits

- [includez](https://github.com/include) for sponsoring GitHub co-pilot :D
- The original version was using an unoffical API: [chatgpt-api](https://github.com/transitive-bullshit/chatgpt-api/) by [transitive-bullshit](https://github.com/transitive-bullshit). I no longer use it but was useful to understand how openai module works. Thanks!
- [OpenAI](https://openai.com) for providing [ChatGPT](https://openai.com/blog/chatgpt/)

## License

ISC © [Quskia](https://github.com/antjpcdrogas)
