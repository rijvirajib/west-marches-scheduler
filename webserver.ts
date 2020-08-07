import { config } from 'dotenv';
import * as bodyParser from 'body-parser';
import * as express from 'express';
import { NextFunction, Request, Response } from 'express';
import { discordClient } from './discordClient';
import { TextChannel } from 'discord.js';

config();

export default class WebServer {
  private app: express.Application;

  constructor() {
    this.app = express();
  }

  public async start(): Promise<WebServer> {
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: false }));
    this.app.use((_request: Request, response: Response, next: NextFunction): void => {
      console.log('closing connection');
      response.set('Connection', 'close');
      next();
    });

    // routes
    this.app.route('/schedule').post(async (_request: Request, response: Response, _next: NextFunction) => {
      const fancyboneTestServer = discordClient.guilds.cache.find((guild) => {
        return guild.name === `fancybone's server`;
      });
      if (!fancyboneTestServer) {
        return response.status(404).send(`Unable to find fancybone's server`);
      }

      const testChannel: TextChannel = fancyboneTestServer.channels.cache.find((channel) => {
        return channel.name === `schedule-bot-dev`;
      }) as TextChannel;

      if (!testChannel) {
        return response.status(404).send(`channel not found`);
      }

      testChannel.send('words words words');
      response.status(200).send();
    });

    const asyncListen = () => {
      return new Promise((resolve) => {
        this.app.listen(process.env.PORT, () => {
          console.log(`Listening on port ${process.env.PORT}`);
          resolve();
        });
      });
    };
    await asyncListen();

    return this;
  }
}
