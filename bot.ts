// Run dotenv
import { config } from 'dotenv';
import { Client, MessageEmbed, Message, MessageReaction, User, PartialUser } from 'discord.js';
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
  await updateSchedulingMessage(reaction, user);
});

client.on('messageReactionRemove', async (reaction, user) => {
  await updateSchedulingMessage(reaction, user);
});

const updateSchedulingMessage = async (reaction: MessageReaction, user: User | PartialUser) => {
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

  const embed = reaction.message.embeds[0];

  // My brain is fucking mush, there must be a better way to asynchronously iterate through a Map
  await Promise.all(
    reaction.message.reactions.cache.map(async (messageReaction, emoji) => {
      return new Promise(async (resolve) => {
        try {
          await messageReaction.users.fetch();
        } catch (error) {
          console.error(`Unable to fetch users for message reaction.`);
        }

        const userMentions = messageReaction.users.cache
          .filter((user) => user.id != client.user.id)
          .map((user) => `<@${user.id}>`);

        if (!userMentions.length) {
          userMentions.push('\u200B');
        }

        for (let i = 0; i < embed.fields.length; i++) {
          if (embed.fields[i].name.includes(emoji)) {
            embed.fields[i].value = userMentions.join(', ');
            console.log(`Setting field with ${emoji} to ${userMentions}`);
          }
        }

        resolve();
      });
    })
  );

  reaction.message.edit(embed);
};

client.login(process.env.DISCORD_TOKEN);
