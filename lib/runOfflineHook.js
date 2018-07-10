const path = require('path');
const _ = require('lodash');
const utils = require('./utils');

function runOffline(serverless, options) {
  serverless.cli.log('Attempting to concat all services into current service to then run in Offline');
  return utils.iterateOverServices(serverless, options, (config, name) => {
    // merge yaml together with base config
    // this will not work if independent services are highly differentiated
    // but should be ok for simple functions.
    serverless.cli.log(`Merging functions from ${name}`);
    const basePath = _.get(config, 'custom.customDomain.basePath', _.kebabCase(name));
    const namespacedFunctions = {};
    Object.keys(config.functions).forEach((key) => {
      const func = config.functions[key];
      func.events.forEach((event) => {
        if (event.http) {
          event.http.path = path.join(basePath, event.http.path);
        }
      });
      namespacedFunctions[`${name}-${key}`] = func;
    });
    Object.assign(serverless.service.functions, namespacedFunctions);
    // total hack to ensure variables are translated
    return serverless.variables.populateService(serverless.pluginManager.cliOptions);
  })
    .then(() => serverless.pluginManager.spawn('offline:start'));
}

module.exports = {
  runOffline,
};
