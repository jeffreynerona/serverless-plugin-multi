const path = require('path');
const fs = require('fs');

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

module.exports = {
  getServerlessConfigFile,
  iterateOverServices,
};
