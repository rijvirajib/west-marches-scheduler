import WebServer from './webserver';
import { login } from './discordClient';

// TODO - verify that we're running under node 12!

const run = async () => {
  await login();

  const webServer = new WebServer();
  await webServer.start();
};

run();
