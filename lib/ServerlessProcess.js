const readline = require('readline');
const EventEmitter = require('events');
const spawn = require('child_process').spawn;
const path = require('path');
const { getInstalledPathSync } = require('get-installed-path');

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
      if (!error && line.match(/Error ---/)) {
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

module.exports = ServerlessProcess;
