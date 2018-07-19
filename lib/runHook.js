const chalk = require('chalk');

const utils = require('./utils');
const ServerlessProcess = require('./ServerlessProcess');
const CliDrawer = require('./CliDrawer');

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
// ['🕛', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚'];
const SUCCESS = '✓';// '✅';
const FAIL = '×';// '❌';

const executeCommandOnAllServices = (serverless, options) => {
  const commands = serverless.processedInput.commands.slice(1);
  serverless.cli.log(`Executing ${commands} in ${options.parallel ? 'parallel' : 'series'}`);
  const errors = {};
  const drawer = new CliDrawer({ truncate: !!options.parallel });
  // TODO: show pending services while running in series
  return utils.iterateOverServices(serverless, options, (config, name, folder) => {
    const boldname = chalk.bold(name);
    const id = drawer.pushLine(`  ${boldname}: starting service`);
    const processOptions = Object.assign({}, serverless.pluginManager.cliOptions, options);
    return new Promise((resolve) => {
      const sls = new ServerlessProcess(commands, processOptions, folder);
      let spinnerCounter = 0;
      const spinnerId = setInterval(() => {
        spinnerCounter += 1;
        spinnerCounter %= SPINNER_FRAMES.length;
        drawer.overwriteLine(id, 0, SPINNER_FRAMES[spinnerCounter]);
      }, 50);

      sls.start();
      sls.on('error', (err) => {
        clearInterval(spinnerId);
        drawer.updateLine(id, `${FAIL} ${boldname}: ${chalk.red('Failed')}`);
        errors[name] = err;
        resolve();
      });
      sls.on('done', () => {
        clearInterval(spinnerId);
        drawer.updateLine(id, `${SUCCESS} ${boldname}: ${chalk.green('Successful')}`);
        resolve();
      });
      sls.on('data', (data) => {
        drawer.updateLine(id, data.replace('Serverless:', `${SPINNER_FRAMES[spinnerCounter]} ${boldname}:`));
      });
    });
  })
    .then(() => {
      drawer.clear();
      const errorKeys = Object.keys(errors);
      if (errorKeys.length > 0) {
        errorKeys.forEach((key) => {
          serverless.cli.log(`Service ${key} Error:`);
          serverless.cli.log(errors[key]);
        });
        throw new Error('Serverless Multi Failed');
      }
      serverless.cli.log(`Multi ran successfully!`);
    });
};

module.exports = {
  executeCommandOnAllServices,
};
