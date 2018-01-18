const { executeCommandOnAllServices } = require('./lib/runHook');
const { runOffline } = require('./lib/runOfflineHook');
const { generateYamlAndSymlinks } = require('./lib/symlinkHook');

class DeployMultiplePlugin {
  constructor(serverless, options) {
    const acceptedCommands = serverless.pluginManager.getCommands();
    const names = Object.keys(acceptedCommands);
    const defaultCommands = {
      add: {
        usage: 'create new micro service folder',
        lifecycleEvents: ['add'],
      },
      generate: {
        usage: 'generate serverless.yml and symlinks',
        lifecycleEvents: ['symlinks'],
      },
    };
    const commonOptions = {
      service: {
        usage: 'specify which services to target',
      },
    };
    this.commands = {
      multi: {
        usage: 'run serverless commands on multiple mirco services',
        commands: names.reduce((cmds, name) => {
          cmds[name] = {
            options: Object.assign({}, commonOptions, acceptedCommands[name].options),
            usage: `calls serverless ${name} [options] on each managed micro service`,
            lifecycleEvents: ['symlinks', 'run'],
          };
          return cmds;
        }, defaultCommands),
      },
    };


    const boundExecFn = executeCommandOnAllServices.bind(null, serverless, options);
    const boundOfflineFn = runOffline.bind(null, serverless, options);
    const boundGenerateSymlinks = generateYamlAndSymlinks.bind(null, serverless, options);

    names.push(...Object.keys(defaultCommands));
    this.hooks = names.reduce((hks, name) => {
      hks[`multi:${name}:symlinks`] = boundGenerateSymlinks;
      hks[`multi:${name}:run`] = (name !== 'offline') ? boundExecFn : boundOfflineFn;
      return hks;
    }, {});
  }
}

module.exports = DeployMultiplePlugin;
