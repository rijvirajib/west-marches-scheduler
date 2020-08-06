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
  Role,
} from 'discord.js';
import * as moment from 'moment';
import { stringify } from 'querystring';

/* TODO

Console output should include timestamps

Create manual for this thing, linked from the scheduling message itself.

A way to schedule hourly blocks.
  - new workflow
    [x] 1) Only DMs can create a schedule event
    [x] 2) DM gets link, picks up to 18 date/time combinations sometime with the span of the next 7-21 days
    [x] 3) Link generates a Discord post calling for votes
      - for now, this is a base64-encoded string to paste back into the channel
    [x] 4) Players vote on their available dates via emoji
    [x] 5) After 2-3 days, DM uses special emoji to close vote, and choose the date.
    [x] 6) The bot pings everyone who is attending on that date to inform them.
  - todo - run webserver alongside static page and bot, and automatically send the schedule block without
    needing to copy-and-paste robot gibberish.

Maybe listing all of the current scheduled things?
 - Maybe give the bot the ability to pin active schedules?
 - Twice a day, ping the channel about responding

TODO: don't need required players anymore, rip that out.

Feat request from Cameron:
 - Something I have thought of, if workable and if others agree it is a good idea.  An option the DM can trigger indicating size of session. For example, if Scott chooses "4" no more than 4 people can vote for a date. So you don't have 8 people vote for a date, It wins, and then you have to kick half of them out anyways.

*/

/* USEFUL STUFF


check if a member is an admin:
`member.hasPermission(Permissions.FLAGS.ADMINISTRATOR`

*/

config();

const MAX_OPTIONS = 17;
const DM_ROLE_NAMES = ['DMs'];
const ADVENTURER_ROLE_NAMES = ['Adventurers'];
const FANCYBONE_USER_ID = 'ZZZZ' + '226540847158525953'; // I'm magic!

const SCHEDULER_URL =
  process.env.BOT_ENV === 'prod'
    ? 'https://pavellishin.github.io/west-marches-scheduler/docs/scheduler.html'
    : 'http://lishin.org/docs/scheduler.html';

const intersection = (arrayA: any[], arrayB: any[]): any[] => {
  return arrayA.filter((x) => arrayB.includes(x));
};

interface IPlayableDate {
  date: String;
  players: String[];
}

const token = process.env.BOT_ENV === 'prod' ? process.env.DISCORD_TOKEN_PROD : process.env.DISCORD_TOKEN_DEV;
if (!token) {
  throw new Error('No token was defined. Check the env variables: BOT_ENV, DISCORD_TOKEN_PROD, DISCORD_TOKEN_DEV');
}

const client = new Client({ partials: ['MESSAGE', 'CHANNEL', 'REACTION'] });
client.login(token);

const emojiOptions = [
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
  '#️⃣',
  '*️⃣',
  'ℹ️',
  '🔢',
  '🔠',
  '⏹',
  '⏺',
];

const emojiCalendar = '📅';
const emojiLock = '🔒';
const emojiMedals = ['🥇', '🥈', '🥉'];
const zeroWidthSpace = `\u200B`;
const embedDescription = (dmUserId) =>
  `<@${dmUserId}>: React with one of the medals (${emojiMedals.join(
    ', '
  )}) to close the poll and select the final date.`;
const embedFooter = `React with the associated emojis to indicate your availability for those dates.
The medal emojis are for the DM's use only.`;
const embedClosedFooter = `The date has been chosen`;

const startsWithEmojiOption = (str: String): boolean => {
  return emojiOptions.some((emojiOption) => str.startsWith(emojiOption));
};

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('message', async (msg) => {
  if (msg.content.startsWith('test')) {
    console.log(client.emojis.resolveIdentifier('♍️'));
    msg.react(client.emojis.resolveIdentifier('♍️'));
  }

  if (msg.content.startsWith(`<@!${client.user.id}>`) || msg.content.startsWith(`<@${client.user.id}>`)) {
    await generateAndSendScheduleEmbed(msg);
  }

  if (msg.content.startsWith('!schedule')) {
    if (await canGenerateScheduleLink(msg)) {
      await generateAndSendScheduleLink(msg);
    } else {
      msg.channel.send(`I'm sorry, but you're not authorized to schedule events.`);
    }
  }
});

enum ReactionActions {
  ADD = 'ADD',
  REMOVE = 'REMOVE',
}

client.on('messageReactionAdd', async (reaction, user) => {
  try {
    await updateSchedulingMessage(reaction, user, ReactionActions.ADD);
  } catch (err) {
    console.error('Unable to execute updateSchedulingMessage', {
      event: 'messageReactionAdd',
      message: reaction.message.id,
      reaction: reaction,
      user: user.id,
      error: err,
    });
  }
});

client.on('messageReactionRemove', async (reaction, user) => {
  try {
    await updateSchedulingMessage(reaction, user, ReactionActions.REMOVE);
  } catch (err) {
    console.error('Unable to execute updateSchedulingMessage', {
      event: 'messageReactionRemove',
      message: reaction.message.id,
      reaction: reaction,
      user: user.id,
      error: err,
    });
  }
});

const canGenerateScheduleLink = async (msg: Message) => {
  // is the author a DM?
  const isAuthorDM = msg.member.roles.cache.some((role: Role) => {
    return DM_ROLE_NAMES.includes(role.name);
  });
  const isAuthorFancybone = msg.member.id === FANCYBONE_USER_ID;

  return isAuthorDM || isAuthorFancybone;
};

const generateAndSendScheduleLink = async (msg: Message) => {
  // The default schedule includes a full week, one week out from today
  const startDate = moment().add(1, 'week').format('YYYY-MM-DD');
  const endDate = moment().add(2, 'weeks').format('YYYY-MM-DD');
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

  const link = `${SCHEDULER_URL}?data=${encodedData}`;

  try {
    await msg.channel.send(
      `Ok, <@${memberId}> - please follow this link to select the options for the session. Once you're done, please paste the results here, tagging me first: ${link}`
    );
  } catch (err) {
    console.log('Unable to post link to channel', { message: err.message, link });
  }
};

const generateAndSendScheduleEmbed = async (msg: Message) => {
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
  const memberId = schedulingData.memberId;

  if (!options) {
    console.log('No options were given in scheduling data', { schedulingData });
    msg.channel.send('No options were present in the data!');
    return;
  }

  if (options.length > MAX_OPTIONS) {
    console.log('More options than emoji options');
    msg.channel.send(
      `Only up to ${MAX_OPTIONS} schedule slots are supported, and you seem to be submitting ${options.length}`
    );
    return;
  }

  const embedTitle = sessionTitle || `An Untitled Adventure`;

  const schedulingEmbed = new MessageEmbed()
    .setColor('#0099ff') // left-most bar
    .setFooter(embedFooter)
    .setTitle(embedTitle)
    .setDescription(embedDescription(memberId));

  for (const optionIndex in options) {
    const option = moment(options[optionIndex]);
    if (multipleSessions) {
      const dateLabel = option.format('dddd, MMMM Do YYYY');
      const startTime = option.format('h a');
      const endTime = option.clone().add(sessionLength, 'hours').format('h a');

      schedulingEmbed.addField(`${emojiOptions[optionIndex]} ${dateLabel}, ${startTime} - ${endTime}`, zeroWidthSpace);
    } else {
      const dateLabel = option.format('dddd, MMMM Do YYYY');
      schedulingEmbed.addField(`${emojiOptions[optionIndex]} ${dateLabel}`, zeroWidthSpace);
    }
  }

  schedulingEmbed.addField(`${emojiCalendar} Current best dates`, 'none');

  const sentMessage = await msg.channel.send(schedulingEmbed);

  for (var emoji of [...emojiOptions.slice(0, options.length), ...emojiMedals]) {
    try {
      await sentMessage.react(client.emojis.resolveIdentifier(emoji));
    } catch (err) {
      console.error(`Unable to react to scheduling message with emoji ${emoji}`, err.message);
    }
  }
};

const updateSchedulingMessage = async (
  reaction: MessageReaction,
  user: User | PartialUser,
  reactionAction: ReactionActions
) => {
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (error) {
      console.log('Something went wrong when fetching the message: ', error);
      return;
    }
  }

  if (user.id === client.user.id) {
    return; // This is the bot pre-filling reactions, ignore.
  }
  if (reaction.message.author.id !== client.user.id) {
    return; // This is a reaction to someone else's message
  }
  if (!reaction.message.embeds || !reaction.message.embeds.length) {
    return; // This is somehow not a scheduling message
  }

  const embed = reaction.message.embeds[0];
  const requiredPlayers = embed.description.match(/<@!?\d+>/g) || [];
  const requiredPlayerIds = requiredPlayers.map((requiredPlayerMention) =>
    requiredPlayerMention.replace(/<@!?(\d+)>/, '$1')
  );
  const calendarField = embed.fields.find((field) => field.name.startsWith(emojiCalendar));

  // Is voting closed for this schedule?
  if (embed.title.startsWith(emojiLock)) {
    return;
  }

  // If this is the original DM who scheduled this, and they're reacting with
  // one of the `emojiMedals`, that means they're making their selection.
  if (
    reactionAction === ReactionActions.ADD &&
    requiredPlayerIds.includes(`${user.id}`) &&
    emojiMedals.includes(reaction.emoji.name)
  ) {
    const chosenDateLine = calendarField.value.split('\n').find((line) => line.startsWith(reaction.emoji.name));
    // if the user chose a medal vote that doesn't have any available players -
    // e.g., if one player reacted with one date, and the DM chose the third medal -
    // tell them they can't do that.
    if (!chosenDateLine) {
      await reaction.message.channel.send(
        `<@!${user.id}> - ${reaction.emoji.name} is not a valid selection for this adventure.`
      );
      return;
    }

    // Otherwise, update the scheduling embed with the chosen date, and ping
    // all the players.
    const originalTitle = embed.title;
    embed.setTitle(`${emojiLock} ${originalTitle}`);
    embed.setDescription(chosenDateLine);
    embed.setFooter(embedClosedFooter);
    await reaction.message.edit(embed);

    await reaction.message.channel.send(
      `A date has been chosen for **${originalTitle}**, run by ${requiredPlayers.join(',')}: ${chosenDateLine}`
    );

    return;
  }

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
  const playableDates: IPlayableDate[] = [];
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
      // strip out the voting emoji... which turns out to actually be rather annoying.
      // `emojiOptions` apparently each take up three bytes.
      const justTheDate = date.substring(3);
      // convert object into nice human-readable thing
      return `**${players.length}** 👥 ${justTheDate}: ${players.join(', ')}`;
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
  if (calendarField) {
    calendarField.name = calendarFieldName;
    calendarField.value = calendarFieldValue;
  } else {
    embed.addField(calendarFieldName, calendarFieldValue);
  }

  reaction.message.edit(embed);
};
