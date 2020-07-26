// Run dotenv
import { config } from 'dotenv';
import { Client, MessageEmbed, Message } from 'discord.js';
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

  if (msg.author.id === client.user.id && msg.embeds && msg.embeds.length && msg.embeds[0].title === embedTitle) {
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
  if (user.id === client.user.id) {
    console.log('Bot reaction detected.');
    return; // This is the bot pre-filling reactions, ignore.
  }
  if (reaction.message.author.id !== client.user.id) {
    console.log(`Reaction was to another user's message`);
    return; // This is a reaction to someone else's message
  }
  if (!reaction.message.embeds || !reaction.message.embeds.length) {
    console.log(`Message has no embeds.`);
    return; // This is somehow not a scheduling message
  }

  const emoji = reaction.emoji.name; // literal emoji
  const embed = reaction.message.embeds[0];

  for (let i = 0; i < embed.fields.length; i++) {
    if (embed.fields[i].name.includes(emoji)) {
      const users = embed.fields[i].value.split(', ').filter((userId) => userId != '\u200B');
      users.push(`<@${user.id}>`);
      embed.fields[i].value = Array.from(new Set(users)).join(', ');
    }
  }

  reaction.message.edit(embed);
});

client.on('messageReactionRemove', async (reaction, user) => {
  // a reaction has been removed.
});

client.login(process.env.DISCORD_TOKEN);
