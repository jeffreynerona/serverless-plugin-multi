/* eslint-env node, mocha */
const chai = require('chai');
const sinon = require('sinon');
const path = require('path');
const { getInstalledPathSync } = require('get-installed-path');
const Multi = require('../index');

const expect = chai.expect;

chai.use(require('sinon-chai'));

const serverlessPath = getInstalledPathSync('serverless', { local: true });
const Serverless = require(`${serverlessPath}/lib/Serverless`); // eslint-disable-line

describe('Serverless Multi', () => {
  let serverless;
  let options;
  let sandbox;
  let plugin;

  before(() => {
    sandbox = sinon.createSandbox();
  });

  beforeEach(() => {
    options = {
      stage: 'myStage',
      region: 'us-east-1',
    };
    serverless = new Serverless(options);
    serverless.cli = new serverless.classes.CLI(serverless);
    serverless.service.service = 'myService';
    serverless.config.servicePath = '';
    serverless.service.package = {};
    serverless.service.functions = {};
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('constructor', () => {
    it('returns Multi object with hook `before:package:initialize`', () => {
      plugin = new Multi(serverless);
      expectedHooks = [
        'multi:add:run',
        'multi:add:symlinks',
        'multi:generate:run',
        'multi:generate:symlinks',
      ];
      expect(plugin.hooks).to.have.all.keys(expectedHooks);
    });
  });

  describe('hook before:package:initialize', () => {
  });
});
