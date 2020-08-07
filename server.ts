import WebServer from './webserver';
import { login } from './discordClient';

const run = async () => {
  await login();

  const webServer = new WebServer();
  await webServer.start();
};

run();
