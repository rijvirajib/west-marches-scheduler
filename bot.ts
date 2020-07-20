// Run dotenv
import { config } from 'dotenv';
import { Client, MessageEmbed } from 'discord.js';
import * as moment from 'moment';

config();
const client = new Client({ partials: ['MESSAGE', 'CHANNEL', 'REACTION'] });

const emojiOptions = [`0️⃣`, `1️⃣`, `2️⃣`, `3️⃣`, `4️⃣`, `5️⃣`, `6️⃣`, `7️⃣`, `8️⃣`, `9️⃣`, `🔟`, `#️⃣`, `*️⃣`, `🔤`];
const embedTitle = `React with the associated emojis to indicate your availability for those dates.`;

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', (msg) => {
  // console.log(msg);

  if (msg.content === 'ping') {
    msg.reply('pong');
  }

  if (msg.content.includes('!schedule')) {
    const nextWeek = moment().add(7, 'days');

    const exampleEmbed = new MessageEmbed()
      .setColor('#0099ff') // left-most bar
      .setTitle(embedTitle);
    for (let i = 0; i < 14; i++) {
      exampleEmbed.addField(
        `${emojiOptions[i]} ${moment(nextWeek).add(i, 'days').format('dddd, MMMM Do YYYY')}`,
        '\u200B'
      );
    }

    msg.channel.send(exampleEmbed);
  }

  if (msg.author.id === process.env.BOT_USER_ID && msg.embeds && msg.embeds[0].title === embedTitle) {
    // This is our own scheduling message; let's pre-populate all the emojis.
    for (let emojiOption of emojiOptions) {
      msg.react(emojiOption);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
