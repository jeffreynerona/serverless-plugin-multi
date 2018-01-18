const spawn = require('child_process').spawn;
const utils = require('./utils');

const executeCommandOnAllServices = (serverless, options) => {
  // get commands to execute for each micro service
  const commands = serverless.processedInput.commands.slice(1);
  return utils.iterateOverServices(serverless, options, (config, name, folder) => {
    serverless.cli.log(`Attempting to run '${commands}' on service ${name}`);
    const processOptions = Object.assign({}, serverless.pluginManager.cliOptions, options);
    return utils.callServerless(commands, processOptions, folder);
  });
};

function callServerless(commands, options, cwd) {
  return new Promise((resolve, reject) => {
    const optionsArray = Object.keys(options || {})
      .reduce((prev, key) => {
        if (options[key] === undefined) return prev;
        return prev.concat([`--${key}`, options[key]]);
      }, []);
    console.log('Calling new serverless process with', optionsArray);
    const serverlessProcess = spawn('serverless', [...commands, ...optionsArray], { cwd });
    serverlessProcess.on('close', resolve);
    // for some reason this is not failing...
    serverlessProcess.on('error', reject);
    serverlessProcess.stdout.pipe(process.stdout);
    serverlessProcess.stderr.pipe(process.stderr);
  });
}

module.exports = {
  executeCommandOnAllServices,
  callServerless,
};
