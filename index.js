const fs = require('fs');
const path = require('path');
const spawn = require('child_process').spawn;
const _ = require('lodash');
const yaml = require('js-yaml');

const isDirectory = (file) => {
  const stat = fs.statSync(file);
  return stat.isDirectory();
};

function getServerlessConfigFile() {
  const potentialFiles = ['serverless.yml', 'serverless.yaml', 'serverless.json'];
  for (let i = 0; i < potentialFiles.length; i++) {
    const filepath = path.join(process.cwd(), potentialFiles[i]);
    if (fs.existsSync(filepath)) return filepath;
  }
  throw new Error('Cannot find serverless config');
}

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

function createSymLinks(service, destination) {
  const workingDir = process.cwd();
  const symlinks = ['node_modules'].concat(service.custom.multi.symlinks);
  const relative = path.relative(destination, workingDir);
  process.chdir(destination);
  symlinks.forEach((link) => {
    const target = path.resolve(relative, link);
    try {
      fs.symlinkSync(target, path.join('./', link));
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
  });
  process.chdir(workingDir);
}

function writeTempServerlessConfig(folder, name, service, config) {
  const plugins = [...service.plugins];
  if (plugins) {
    const index = plugins.indexOf('serverless-multi');
    if (index >= 0) {
      plugins.splice(index, 1);
    }
  }
  const tmpYamlData = _.merge({
    custom: service.custom,
    package: service.package,
    provider: _.omit(service.provider, 'iamRoleStatements'),
    service: service.serviceObject,
    resources: service.resources,
    plugins,
  }, config);
  if (tmpYamlData.provider.iamRoleStatements) {
    const roles = service.provider.iamRoleStatements;
    roles.forEach((role) => {
      const exists = tmpYamlData.provider.iamRoleStatements.find(existingRole => _.isEqual(existingRole, role));
      if (!exists) {
        tmpYamlData.provider.iamRoleStatements.push(role);
      }
    });
  }
  // for custom domain names plugin
  if (tmpYamlData.custom.customDomain && !_.get(config, 'custom.customDomain.basePath')) {
    tmpYamlData.custom.customDomain.basePath = _.kebabCase(name);
  }
  // rename based on directory and base config
  const mainServiceName = typeof service.service === 'string' ? service.service : service.service.name;
  tmpYamlData.service = `${mainServiceName}-${name}`;
  const tempYamlPath = path.join(folder, 'serverless.yaml');
  fs.writeFileSync(tempYamlPath, yaml.safeDump(tmpYamlData, { skipInvalid: true }));
}

function iterateOverServices(serverless, options, func) {
  const services = options.service ? options.service.split(',') : undefined;
  const workingDir = process.cwd();
  const targetFolder = path.resolve(workingDir, serverless.service.custom.multi.location || 'services');
  console.log('trying to get services', targetFolder);
  let contents;
  try {
    contents = fs.readdirSync(targetFolder).map(file => path.join(targetFolder, file));
  } catch (e) {
    return Promise.resolve();
  }
  const serviceFolders = contents.filter(file => isDirectory(file) && fs.existsSync(path.join(file, '/service.yml')));
  return serviceFolders.reduce((promise, folder) => {
    const serviceName = path.basename(folder);
    // should throw error if serviceFolders do not include service specified in options
    if (services && !services.includes(serviceName)) return promise;
    const serviceFilePath = path.join(folder, 'service.yml');
    return promise.then(() => serverless.yamlParser.parse(serviceFilePath))
      .then((config) => {
        // strangely serverless yaml parser changes the directory.
        process.chdir(workingDir);
        return func(config, serviceName, folder);
      });
  }, Promise.resolve());
}

const generateYamlAndSymlinks = (serverless, options) => {
  serverless.cli.log(`Generating serviceless.yml and symlinks for service`);
  const mainService = serverless.service;
  const serviceFilePath = getServerlessConfigFile();
  return serverless.yamlParser.parse(serviceFilePath)
    .then((primaryConfig) => {
      return iterateOverServices(serverless, options, (config, name, folder) => {
        serverless.cli.log(`Generating serviceless.yml and symlinks for service ${name}`);
        // make links from this service to the main service
        createSymLinks(mainService, folder);
        writeTempServerlessConfig(folder, name, primaryConfig, config);
      });
    });
};

const executeCommandOnAllServices = (serverless, options) => {
  // get commands to execute for each micro service
  const commands = serverless.processedInput.commands.slice(1);
  return iterateOverServices(serverless, options, (config, name, folder) => {
    serverless.cli.log(`Attempting to run '${commands}' on service ${name}`);
    const processOptions = Object.assign({}, serverless.pluginManager.cliOptions, options);
    return callServerless(commands, processOptions, folder);
  });
};

function runOffline(serverless, options) {
  serverless.cli.log('Attempting to concat all services into current service to then run in Offline');
  return iterateOverServices(serverless, options, (config, name) => {
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
      namespacedFunctions[`${name}${key}`] = func;
    });
    Object.assign(serverless.service.functions, namespacedFunctions);
    // total hack to ensure variables are translated
    return serverless.variables.populateService(serverless.pluginManager.cliOptions);
  })
    .then(() => serverless.pluginManager.spawn('offline:start'));
}

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
