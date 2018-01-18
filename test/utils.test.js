/* eslint-env node, mocha */
const chai = require('chai');
const sinon = require('sinon');
const { getInstalledPathSync } = require('get-installed-path');
const fs = require('fs');
const { iterateOverServices, getServerlessConfigFile } = require('../lib/utils');

const expect = chai.expect;

chai.use(require('sinon-chai'));

const serverlessPath = getInstalledPathSync('serverless', { local: true });
const Serverless = require(`${serverlessPath}/lib/Serverless`); // eslint-disable-line

describe('utils', () => {
  let sandbox;
  before(() => {
    sandbox = sinon.createSandbox();
  });
  afterEach(() => {
    sandbox.restore();
  });
  describe('getServerlessConfigFile()', () => {
    it('throws error if cannot find serverless config', () => {
      expect(() => getServerlessConfigFile()).to.throw(/Cannot find serverless config/);
    });

    it('searches for config file in order from .yml, .yaml, to .json', () => {
      sandbox.stub(process, 'cwd').returns('/');
      const fn = sandbox.stub(fs, 'existsSync').callsFake((name) => {
        return name === '/serverless.json';
      });
      const expected = ['yml', 'yaml', 'json'];
      getServerlessConfigFile();
      expect(fn.calledThrice).to.equal(true);
      fn.getCalls().forEach((call) => {
        expect(call.calledWith(`/serverless.${expected.shift()}`)).to.equal(true);
      });
    });

    it('returns config pathname', () => {
      sandbox.stub(process, 'cwd').returns('/some/path/');
      sandbox.stub(fs, 'existsSync').callsFake((name) => {
        return name === '/some/path/serverless.yml';
      });
      expect(getServerlessConfigFile()).to.equal('/some/path/serverless.yml');
    });
  });

  describe('iterateOverServices(serverless, options, func)', () => {
    let serverless;
    let options;

    let plugin;

    beforeEach(() => {
      options = {
        stage: 'myStage',
        region: 'us-east-1',
      };
      serverless = new Serverless(options);
      serverless.cli = new serverless.classes.CLI(serverless);
      serverless.pluginManager = new serverless.classes.PluginManager(serverless);
      // get an array of commands and options that should be processed
      serverless.service.service = 'myService';
      serverless.config.servicePath = '';
      serverless.service.package = {};
      serverless.service.functions = {};
    });
  });
});
