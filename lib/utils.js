const path = require('path');
const fs = require('fs');
const _ = require('lodash');

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

function promiseSeries(array, fn) {
  return array.reduce((promise, value) => {
    return promise.then(() => fn(value));
  }, Promise.resolve());
}

function promiseSeriesMap(array, fn) {
  const results = [];
  return promiseSeries(array, (v) => {
    return fn(v).then(res => results.push(res));
  }).then(() => results);
}

function getServiceFolders(serverless, options) {
  const services = options.service ? options.service.split(',') : undefined;
  const workingDir = process.cwd();
  const targetFolder = path.resolve(workingDir, _.get(serverless, 'service.custom.multi.location', 'services'));
  let contents;
  try {
    contents = fs.readdirSync(targetFolder).map(file => path.join(targetFolder, file));
  } catch (e) {
    throw new Error(`Target folder ${targetFolder} does not exist.`);
  }
  const serviceFolders = contents.filter((file) => {
    if (!isDirectory(file)) return false;
    if (!fs.existsSync(path.join(file, '/service.yml'))) return false;
    const serviceName = path.basename(file);
    if (services && !services.includes(serviceName)) return false;
    return true;
  });
  // should throw error if services is > service folders
  return serviceFolders;
}

function iterateOverServices(serverless, options, func) {
  const workingDir = process.cwd();
  let serviceFolders;
  try {
    serviceFolders = getServiceFolders(serverless, options);
  } catch (e) {
    if (e.message.startsWith('Target folder')) return Promise.resolve();
    throw e;
  }
  if (!options.parallel) {
    return promiseSeries(serviceFolders, (folder) => {
      const serviceName = path.basename(folder);
      const serviceFilePath = path.join(folder, 'service.yml');
      return Promise.resolve(serverless.yamlParser.parse(serviceFilePath))
        .then((config) => {
          // strangely serverless yaml parser changes the directory.
          process.chdir(workingDir);
          return func(config, serviceName, folder);
        });
    });
  }
  return promiseSeriesMap(serviceFolders, (folder) => {
    const serviceFilePath = path.join(folder, 'service.yml');
    return Promise.resolve(serverless.yamlParser.parse(serviceFilePath))
      .then((config) => {
        process.chdir(workingDir);
        return [folder, config];
      });
  }).then((results) => {
    return Promise.all(results.map(([folder, config]) => {
      const serviceName = path.basename(folder);
      return func(config, serviceName, folder);
    }));
  });
}

module.exports = {
  getServerlessConfigFile,
  iterateOverServices,
};
