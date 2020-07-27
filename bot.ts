// Run dotenv
import { config } from 'dotenv';
import { Client, MessageEmbed, Message, MessageReaction, User, PartialUser, EmbedField } from 'discord.js';
import * as moment from 'moment';

/* TODO

When deciding which dates are winning, weigh those including the DM more heavily than those without.

A way to finalize the poll and stop reacting to it.

*/

config();

const token = process.env.BOT_ENV === 'prod' ? process.env.DISCORD_TOKEN_PROD : process.env.DISCORD_TOKEN_DEV;
if (!token) {
  throw new Error('No token was defined. Check the env variables: BOT_ENV, DISCORD_TOKEN_PROD, DISCORD_TOKEN_DEV');
}

const client = new Client({ partials: ['MESSAGE', 'CHANNEL', 'REACTION'] });
client.login(token);

const emojiOptions = [`0️⃣`, `1️⃣`, `2️⃣`, `3️⃣`, `4️⃣`, `5️⃣`, `6️⃣`, `7️⃣`, `8️⃣`, `9️⃣`, `🔟`, `#️⃣`, `*️⃣`, `🔤`];
const emojiRefresh = '🔄';
const emojiCalendar = '📅';
const emojiMedals = ['🥇', '🥈', '🥉'];
const zeroWidthSpace = `\u200B`;
const embedFooter = `React with the associated emojis to indicate your availability for those dates.\nReact with ${emojiRefresh} to refresh the list.`;

const startsWithEmojiOption = (str: String): boolean => {
  return emojiOptions.some((emojiOption) => str.startsWith(emojiOption));
};

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', async (msg) => {
  if (msg.content.includes('!schedule')) {
    await scheduleSession(msg);
  }

  if (
    msg.author.id === client.user.id &&
    msg.embeds &&
    msg.embeds.length &&
    msg.embeds[0].footer &&
    msg.embeds[0].footer.text === embedFooter
  ) {
    // This is our own scheduling message; let's pre-populate all the emojis.
    for (let emojiOption of emojiOptions) {
      msg.react(emojiOption);
    }

    // Add refresh emoji
    msg.react(emojiRefresh);
  }
});

client.on('messageReactionAdd', async (reaction, user) => {
  await updateSchedulingMessage(reaction, user);
});

client.on('messageReactionRemove', async (reaction, user) => {
  await updateSchedulingMessage(reaction, user);
});

const scheduleSession = async (msg: Message) => {
  const nextWeek = moment().add(7, 'days');

  const mentions = msg.mentions.users.map((user) => `<@${user.id}>`);
  const requiredPlayers = mentions.length
    ? `_Required players for this session: ${mentions.join(', ')}_`
    : zeroWidthSpace;
  const embedTitle = msg.content.replace(/^!schedule ?/, zeroWidthSpace).replace(/<@!\d+>/g, zeroWidthSpace);

  const schedulingEmbed = new MessageEmbed()
    .setColor('#0099ff') // left-most bar
    .setFooter(embedFooter)
    .setTitle(embedTitle)
    .setDescription(requiredPlayers);

  for (let i = 0; i < 14; i++) {
    schedulingEmbed.addField(
      `${emojiOptions[i]} ${moment(nextWeek).add(i, 'days').format('dddd, MMMM Do YYYY')}`,
      zeroWidthSpace
    );
  }

  schedulingEmbed.addField(`${emojiCalendar} Current best dates`, 'none');

  msg.channel.send(schedulingEmbed);
};

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
  // TODO - do these even run asynchronously? Based on the console.logs, they sure don't
  // eeeeh, testing this with some toy asyncs, it seems to run these in parallel; i'd bet
  // money that it's slow because Discord is throttling us.
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
          userMentions.push(zeroWidthSpace);
        }

        for (let i = 0; i < embed.fields.length; i++) {
          if (embed.fields[i].name.includes(emoji)) {
            embed.fields[i].value = userMentions.join(', ');
          }
        }

        resolve();
      });
    })
  );

  // Calculate best current dates
  const playableDates = [];
  for (let i = 0; i < embed.fields.length; i++) {
    if (startsWithEmojiOption(embed.fields[i].name)) {
      const players = embed.fields[i].value.split(', ').filter((player) => player != zeroWidthSpace);
      const date = embed.fields[i].name;

      if (players.length > 0) {
        playableDates.push({ date, players });
      }
    }
  }
  playableDates.sort((playableDateA, playableDateB) => {
    return playableDateB.players.length - playableDateA.players.length;
  });

  const calendarFieldName = `${emojiCalendar} Current best dates`;
  const calendarFieldValue = playableDates
    .slice(0, 3) // trim to top three options
    .map(({ date: date, players: players }) => {
      // convert object into nice human-readable thing
      return `${date}: ${players.join(', ')}`;
    })
    .map((value) => {
      // strip out the voting emoji... which turns out to actually be rather annoying.
      // `emojiOptions` apparently each take up three bytes.
      return value.substring(3);
    })
    .map((value, index) => {
      // add nice medals
      if (index < emojiMedals.length) {
        return `${emojiMedals[index]} ${value}`;
      }
      return value;
    })
    .join('\n');

  // backwards compatibility - old schedulers may not have a calendar field pre-set.
  const calendarField = embed.fields.find((field) => field.name.startsWith(emojiCalendar));
  if (calendarField) {
    calendarField.name = calendarFieldName;
    calendarField.value = calendarFieldValue;
  } else {
    embed.addField(calendarFieldName, calendarFieldValue);
  }

  reaction.message.edit(embed);
};
