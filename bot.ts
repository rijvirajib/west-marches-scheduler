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
  if (msg.content.includes('!schedule')) {
    const nextWeek = moment().add(7, 'days');

    const schedulingEmbed = new MessageEmbed()
      .setColor('#0099ff') // left-most bar
      .setTitle(embedTitle);
    for (let i = 0; i < 14; i++) {
      schedulingEmbed.addField(
        `${emojiOptions[i]} ${moment(nextWeek).add(i, 'days').format('dddd, MMMM Do YYYY')}`,
        '\u200B'
      );
    }

    msg.channel.send(schedulingEmbed);
  }

  if (msg.author.id === client.user.id && msg.embeds && msg.embeds[0].title === embedTitle) {
    // This is our own scheduling message; let's pre-populate all the emojis.
    for (let emojiOption of emojiOptions) {
      msg.react(emojiOption);
    }
  }
});

client.on('messageReactionAdd', async (reaction, user) => {
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.log('Something went wrong when fetching the message: ', error);
      return;
    }
  }
  if (reaction.me) {
    //    return; // This is the bot pre-filling reactions, ignore.
  }
  console.log(reaction);

  // get that message, and add the author to the value
  const emoji = reaction.emoji.name; // literal emoji
  // get the messages's embed, add the person's name to the value of the field, and cram it in there. I guess reaction.message.fetch() might be a thing?
  // field = schedulingEmbed.fields.find(field => field.value.includes(emoji));
  // https://discordjs.guide/popular-topics/embeds.html#editing-the-embedded-message-content

  console.log(`${reaction.message.author}'s message "${reaction.message.content}" gained a reaction!`);
  console.log(`${reaction.count} user(s) have given the same reaction to this message!`);
});

client.on('messageReactionRemove', async (reaction, user) => {
  // a reaction has been removed.
});

client.login(process.env.DISCORD_TOKEN);
