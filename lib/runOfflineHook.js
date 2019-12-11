const path = require('path');
const _ = require('lodash');
const utils = require('./utils');

function runOffline(serverless, options) {
  serverless.cli.log('Attempting to concat all services into current service to then run in Offline');
  return utils.iterateOverServices(serverless, options, (config, name) => {
    // merge yaml together with base config
    // this will not work if independent services are highly differentiated
    // but should be ok for simple functions.
    if (!config.functions) {
      serverless.cli.log(`Skipping ${name} as there are no functions`);
      return;
    }
    serverless.cli.log(`Merging functions from ${name}`);
    const basePath = _.get(config, 'custom.customDomain.basePath', _.kebabCase(name));
    const namespacedFunctions = {};
    Object.keys(config.functions).forEach((key) => {
      const func = config.functions[key];
      if (func.events) {
        console.log('1', func.events);
        func.events.forEach((event) => {
          if (event.http) {
            console.log('2', event);
            const slashPath = path.join(basePath, event.http.path);
            event.http.path = slashPath.replace(/\\/g, '/');
          }
        });
      }
      namespacedFunctions[`${name}-${key}`] = func;
    });
    console.log('3', namespacedFunctions);
    Object.assign(serverless.service.functions, namespacedFunctions);
    // total hack to ensure variables are translated
    return serverless.variables.populateService(serverless.pluginManager.cliOptions);
  })
    .then(() => serverless.pluginManager.spawn('offline:start'));
}

module.exports = {
  runOffline,
};
