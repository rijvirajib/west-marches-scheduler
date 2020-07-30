// Run dotenv
import { config } from 'dotenv';
import {
  Client,
  DMChannel,
  MessageEmbed,
  Message,
  MessageReaction,
  User,
  PartialUser,
  EmbedField,
  Permissions,
  DiscordAPIError,
  Channel,
} from 'discord.js';
import * as moment from 'moment';

/* TODO

Create manual for this thing, linked from the scheduling message itself.

A way to finalize the poll and stop reacting to it?
 - either one of the people with the DM role, or one of the required players
   would select the winning date by reacting with the appropriate medal emoji?

Ability for a DM-role player to add themselves as a required player by reacting with an Emoji
 - also, the ability for a DM-role to _remove_ a required player by reacting with a different emoji.


A way to schedule hourly blocks.
  - ok, the PM-the-user idea sucks. For one, we don't have good emojis mapping times-of-day.
    Yes, we have the clocks, but those are hard to read, especially on a tiny screen.
    And I absolutely don't want to make anyone type anything into discord; that's a usability
    disaster on mobile, and you can't edit things, and if you fuck it up, etc., etc.
  - So, here's a new idea: when you type !schedule, you get a link to a static page, which
    works somewhat like Doodle. You pick your start and end date, and you pick out some hour blocks.
    Then the page generates some JSON you can throw back at the robot.
  - A later interaction would submit directly to the robot, via some sort of nonce.

Maybe listing all of the current scheduled things?
 - Maybe give the bot the ability to pin active schedules?
 - Twice a day, ping the channel about responding

Show how many players chose each thing.

 Oh my god, I can add CUSTOM EMOJIs to represent the days-of-the-month!
*/

/* USEFUL STUFF


check if a member is an admin:
`member.hasPermission(Permissions.FLAGS.ADMINISTRATOR`

*/

config();

const intersection = (arrayA: any[], arrayB: any[]): any[] => {
  return arrayA.filter((x) => arrayB.includes(x));
};

const shuffledCopy = (input: any[]): any[] => {
  const array = [...input]; // copy array
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * i);
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
};

const token = process.env.BOT_ENV === 'prod' ? process.env.DISCORD_TOKEN_PROD : process.env.DISCORD_TOKEN_DEV;
if (!token) {
  throw new Error('No token was defined. Check the env variables: BOT_ENV, DISCORD_TOKEN_PROD, DISCORD_TOKEN_DEV');
}

const client = new Client({ partials: ['MESSAGE', 'CHANNEL', 'REACTION'] });
client.login(token);

// TODO - there's a limit to how many reasonably readable emoji reactions we can shove onto a message.
// We need to limit the number of choices; that probably means extracting `emojiOptions` into its own thing
// so that scheduler.html can use it, too.

const emojiOptions = [
  '❤️',
  '🧡',
  '💛',
  '💚',
  '💙',
  '💜',
  '🖤',
  '🅰️',
  '🅱️',
  '🆎',
  '🆑',
  '🅾️',
  '🆘',
  '0️⃣',
  '1️⃣',
  '2️⃣',
  '3️⃣',
  '4️⃣',
  '5️⃣',
  '6️⃣',
  '7️⃣',
  '8️⃣',
  '9️⃣',
  '🔟',
  '🔢',
  '#️⃣',
  '*️⃣',
  '🔤',
  '🔡',
  '🔠',
  '🔴',
  '🔵',
  '⚫️',
  '🔺',
  '🔻',
  '🔶',
  '🔷',
  '♠️',
  '♣️',
  '♥️',
  '♦️',
  '⛎',
  '♈️',
  '♉️',
  '♊️',
  '♋️',
  '♌️',
  '♍️',
  '♎️',
  '♏️',
  '♐️',
  '♑️',
  '♒️',
  '♓️',
];

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
  if (msg.content.startsWith(`<@!${client.user.id}>`) || msg.content.startsWith(`<@${client.user.id}>`)) {
    await generateScheduleEmbed(msg);
  }

  if (msg.content.startsWith('!schedule')) {
    await generateScheduleLink(msg);
  }
});

client.on('messageReactionAdd', async (reaction, user) => {
  try {
    await updateSchedulingMessage(reaction, user);
  } catch (err) {
    console.error('Unable to execute updateSchedulingMessage', {
      event: 'messageReactionAdd',
      message: reaction.message.id,
      reaction: reaction.emoji.id,
      user: user.id,
    });
  }
});

client.on('messageReactionRemove', async (reaction, user) => {
  try {
    await updateSchedulingMessage(reaction, user);
  } catch (err) {
    console.error('Unable to execute updateSchedulingMessage', {
      event: 'messageReactionRemove',
      message: reaction.message.id,
      reaction: reaction.emoji.id,
      user: user.id,
    });
  }
});

const generateScheduleLink = async (msg: Message) => {
  const startDate = moment().add(1, 'week').format('YYYY-MM-DD');
  const endDate = moment().add(3, 'weeks').format('YYYY-MM-DD');
  const guildId = msg.guild.id;
  const channelId = msg.channel.id;
  const memberId = msg.author.id;
  const requiredPlayerIds = msg.mentions.users.map((user) => user.id);
  const sessionTitle = msg.content
    .replace(/^!schedule ?/, '')
    .replace(/<@!?\d+>/g, '')
    .trim();

  const linkData = {
    startDate,
    endDate,
    guildId,
    channelId,
    memberId,
    requiredPlayerIds,
    sessionTitle,
  };

  const encodedData = Buffer.from(JSON.stringify(linkData)).toString('base64');

  const link = `https://pavellishin.github.io/west-marches-scheduler/docs/scheduler.html?data=${encodedData}`;

  try {
    await msg.channel.send(
      `Ok, <@${memberId}> - please follow this link to select the options for the session. Once you're done, please paste the results here, tagging me first: ${link}`
    );
  } catch (err) {
    console.log('Unable to post link to channel', { message: err.message, link });
  }
};

const generateScheduleEmbed = async (msg: Message) => {
  // Remove the @mention, and any possible newlines, in case the copy-and-paste is wonky.
  const robotGibberish = msg.content.replace(new RegExp(`<@!?${client.user.id}> ?`), '').replace('\n', '');
  let jsonString;
  let schedulingData;

  try {
    jsonString = Buffer.from(robotGibberish, 'base64').toString();
  } catch (err) {
    console.log('Unable to base64-decode gibberish', { robotGibberish, errMessage: err.message });
    msg.channel.send('Unable to parse robot gibberish! The base64-decoded data could not be parsed.');
    return;
  }
  try {
    schedulingData = JSON.parse(jsonString);
  } catch (err) {
    console.log('Unable to parse base64-decoded JSON', { jsonString, errMessage: err.message });
    msg.channel.send('Unable to parse robot gibberish! The json data could not be parsed.');
    return;
  }

  console.log(schedulingData);

  const requiredPlayers = schedulingData.requiredPlayers || [];
  const sessionTitle = schedulingData.sessionTitle;
  const options = schedulingData.options;
  const multipleSessions = schedulingData.multipleSessions;
  const sessionLength = schedulingData.sessionLength || 4; // defaults to four hours

  if (!options) {
    console.log('No options were given in scheduling data', { schedulingData });
    msg.channel.send('No options were present in the data!');
  }

  if (options.length > emojiOptions.length) {
    console.log('More options than emoji options');
    msg.channel.send('Well, this is embarassing. There are more options than I have emojis for.');
  }

  const emojiSubset = shuffledCopy(emojiOptions).slice(0, options.length);

  const embedDescription = requiredPlayers.length
    ? `_Required player${requiredPlayers.length === 1 ? '' : 's'} for this session: ${requiredPlayers.join(', ')}_`
    : zeroWidthSpace;
  const embedTitle = sessionTitle || `An Untitled Adventure`;

  const schedulingEmbed = new MessageEmbed()
    .setColor('#0099ff') // left-most bar
    .setFooter(embedFooter)
    .setTitle(embedTitle)
    .setDescription(embedDescription);

  // if (
  //   msg.author.id === client.user.id &&
  //   msg.embeds &&
  //   msg.embeds.length &&
  //   msg.embeds[0].footer &&
  //   msg.embeds[0].footer.text === embedFooter
  // ) {
  //   // This is our own scheduling message; let's pre-populate all the emojis.
  //   for (let emojiOption of emojiOptions) {
  //     msg.react(emojiOption);
  //   }

  //   // Add refresh emoji
  //   msg.react(emojiRefresh);
  // }

  for (const optionIndex in options) {
    const option = moment(options[optionIndex]);
    if (multipleSessions) {
      const dateLabel = option.format('dddd, MMMM Do YYYY');
      const startTime = option.format('h A');
      const endTime = option.clone().add(sessionLength, 'hours').format('h A');

      schedulingEmbed.addField(`${emojiSubset[optionIndex]} ${dateLabel} ${startTime}-${endTime}`, zeroWidthSpace);
    } else {
      const dateLabel = option.format('dddd, MMMM Do YYYY');
      schedulingEmbed.addField(`${emojiSubset[optionIndex]} ${dateLabel}`, zeroWidthSpace);
    }
  }

  schedulingEmbed.addField(`${emojiCalendar} Current best dates`, 'none');

  const sentMessage = await msg.channel.send(schedulingEmbed);
  for (const emoji of emojiSubset) {
    sentMessage.react(emoji);
  }
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
          .sort()
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
  const requiredPlayers = embed.description.match(/<@!?\d+>/g) || [];
  const playableDates = [];
  for (let i = 0; i < embed.fields.length; i++) {
    if (startsWithEmojiOption(embed.fields[i].name)) {
      const players = embed.fields[i].value
        .split(', ')
        .filter((player) => player != zeroWidthSpace)
        .sort();
      const date = embed.fields[i].name;

      if (requiredPlayers.length && intersection(players, requiredPlayers).length === 0) {
        // If there _are_ required players, don't even consider dates that don't include them.
        continue;
      }

      if (players.length > 0) {
        playableDates.push({ date, players });
      }
    }
  }
  playableDates.sort((playableDateA, playableDateB) => {
    // If one date includes a required player, but the other does not, consider it to be weighted higher.
    const requiredPlayersA = intersection(playableDateA.players, requiredPlayers);
    const requiredPlayersB = intersection(playableDateB.players, requiredPlayers);
    if (requiredPlayersA.length !== requiredPlayersB.length) {
      return requiredPlayersB.length - requiredPlayersA.length;
    }
    // otherwise, just go by player count.
    return playableDateB.players.length - playableDateA.players.length;
  });

  const calendarFieldName = requiredPlayers.length
    ? `${emojiCalendar} Current best dates with required players:`
    : `${emojiCalendar} Current best dates`;

  const calendarFieldValue = playableDates
    .slice(0, 5) // trim to top three options
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
