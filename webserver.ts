import { config } from 'dotenv';
import * as bodyParser from 'body-parser';
import * as express from 'express';
import { NextFunction, Request, Response } from 'express';
import { generateAndSendScheduleEmbed } from './discordClient';

config();

export default class WebServer {
  private app: express.Application;

  constructor() {
    this.app = express();
  }

  public async start(): Promise<WebServer> {
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: false }));
    this.app.use(express.static('docs')); // TODO - move all this shit out of the docs/ folder
    this.app.use((_request: Request, response: Response, next: NextFunction): void => {
      response.set('Connection', 'close');
      next();
    });

    // routes

    this.app.route('/schedule').post(async (request: Request, response: Response, _next: NextFunction) => {
      try {
        await generateAndSendScheduleEmbed(request.body);
      } catch (err) {
        console.log(`Unable to run generateAndSendScheduleEmbed`, {
          body: request.body,
          err,
        });
        response.status(400).send(err.message);
      }

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
