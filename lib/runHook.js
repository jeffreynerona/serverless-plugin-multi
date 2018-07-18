const readline = require('readline');
const EventEmitter = require('events');
const spawn = require('child_process').spawn;
const path = require('path');
const { getInstalledPathSync } = require('get-installed-path');
const ansiDiffer = require('ansi-diff');
const _ = require('lodash');
const chalk = require('chalk');

const utils = require('./utils');

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
// ['🕛', '🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚'];
const SUCCESS = '✓';// '✅';
const FAIL = '×';// '❌';

function getServerlessCliPath() {
  try {
    const serverlessLocation = getInstalledPathSync('serverless', { local: true });
    return path.join(serverlessLocation, 'bin/serverless');
  } catch (e) {
    return 'serverless';
  }
}

class ServerlessProcess extends EventEmitter {
  constructor(commands, options, cwd) {
    super();
    const optionsArray = Object.keys(options || {})
      .reduce((prev, key) => {
        if (options[key] === undefined) return prev;
        return prev.concat([`--${key}`, options[key]]);
      }, []);
    this.cli = getServerlessCliPath();
    this.options = [...commands, ...optionsArray];
    this.cwd = cwd;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const slsProcess = spawn(this.cli, this.options, { cwd: this.cwd });
    let error = null;
    slsProcess.on('close', () => {
      if (error) return this.emit('error', error);
      this.running = false;
      this.emit('done');
    });

    // for some reason this is not failing...
    // so instead we are using read line to detect failures
    slsProcess.on('error', e => this.emit('error', e));

    const rl = readline.createInterface({
      input: slsProcess.stdout,
      crlfDelay: Infinity,
    });
    rl.on('line', (line) => {
      if (!error && line.match(/\bServerless Error ---/)) {
        error = new Error('Serverless Multi Error\n');
      }
      if (error) {
        error.message += `${line}\n`;
        return;
      }
      if (line.startsWith('Serverless:')) {
        this.emit('data', line);
      }
    });
  }
}

function callServerless(commands, options, cwd) {
  return new Promise((resolve, reject) => {
    const sls = new ServerlessProcess(commands, options, cwd);
    sls.start();
    sls.on('error', reject);
    sls.on('done', resolve);
    // sls.on('data', data => console.log('multi:', data));
  });
}

class CliDrawer {
  constructor(options) {
    this.tty = process.stdout.isTTY;
    this.diff = ansiDiffer({ width: this.tty ? process.stdout.columns : undefined });
    this.buffer = [];
    this.draw = _.throttle(this._draw.bind(this), 50);
    this.interval = 250;
    this.truncate = options && options.truncate;
  }

  pushLine(str) {
    if (!this.tty) console.log(str);
    this.buffer.push(str);
    this.draw();
    return this.buffer.length - 1;
  }

  updateLine(i, str) {
    if (!this.tty) return console.log(str);
    this.buffer[i] = str;
    this.draw();
  }

  overwriteLine(i, offset, str) {
    if (!this.tty) return console.log(str);
    const prev = this.buffer[i];
    this.buffer[i] = prev.substring(0, offset) + str + prev.substring(offset + str.length);
    this.draw();
  }

  _draw() {
    // do not draw if not tty
    if (!this.tty) return;
    const output = this.buffer.map(line => line.substring(0, this.diff.width - 1)).join('\n');
    const changes = this.diff.update(output);
    process.stdout.write(changes);
  }

  clear() {
    this._draw();
    if (!this.tty) return console.log('');
    process.stdout.write('\u001b[?25h');
    console.log('');
  }
}

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
          console.log(`Service ${key} Error:`);
          console.log(errors[key]);
        });
        throw new Error('Serverless Multi Failed');
      }
      serverless.cli.log(`Multi ran successfully!`);
    });
};

module.exports = {
  executeCommandOnAllServices,
  callServerless,
};
