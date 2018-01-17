/* eslint-env node, mocha */
const chai = require('chai');
const sinon = require('sinon');
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
    serverless.pluginManager = new serverless.classes.PluginManager(serverless);
    // get an array of commands and options that should be processed
    serverless.service.service = 'myService';
    serverless.config.servicePath = '';
    serverless.service.package = {};
    serverless.service.functions = {};
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('constructor', () => {
    it('returns Multi object with hooks that extend all other plugins commands', () => {
      serverless.pluginManager.loadCorePlugins();
      const commands = serverless.pluginManager.getCommands();
      // console.log(commands);
      plugin = new Multi(serverless);
      const expectedHooks = [
        'multi:add:run',
        'multi:add:symlinks',
        'multi:generate:run',
        'multi:generate:symlinks',
      ];
      Object.keys(commands).forEach((name) => {
        expectedHooks.push(`multi:${name}:symlinks`);
        expectedHooks.push(`multi:${name}:run`);
      });
      expect(plugin.hooks).to.have.includes.keys(expectedHooks);
    });

    xit('returns Multi object with multi style commands for all other plugins', () => {
      serverless.pluginManager.loadCorePlugins();
    });
  });

  describe('generate command', () => {
    context('without options', () => {
      it('generates serverless config and symlinks for all services');
    });

    context('with service option', () => {
      it('generates serverless config and symlinks for specified service');
    });

    context('with service option as comma seporated list', () => {
      it('generates serverless config and symlinks for specified services');
    });
  });

  describe('run [name] command', () => {
    const commands = ['deploy', 'package', 'print'];

    describe('hook execution order', () => {
      let hooks;
      beforeEach(() => {
        serverless.pluginManager.loadCorePlugins();
        serverless.pluginManager.addPlugin(Multi);
        hooks = serverless.pluginManager.hooks;
      });

      commands.forEach((command) => {
        it(`calls hooks "multi:${command}:symlinks" then "multi:${command}:deploy"`, () => {
          const symlinkHook = hooks[`multi:${command}:symlinks`].find(x => x.pluginName === 'DeployMultiplePlugin');
          const runHook = hooks[`multi:${command}:run`].find(x => x.pluginName === 'DeployMultiplePlugin');
          const symlinksFn = sandbox.stub(symlinkHook, 'hook');
          const runFn = sandbox.stub(runHook, 'hook');
          return serverless.pluginManager.run(['multi', command])
            .then(() => {
              expect(symlinksFn.calledOnce).to.equal(true);
              expect(runFn.calledOnce).to.equal(true);
              expect(runFn.calledAfter(symlinksFn)).to.equal(true);
            });
        });
      });
    });

    context('without options', () => {
      it('runs specified command on for all services');
    });

    context('with service option', () => {
      it('generates serverless config and symlinks for specified service');
      it('runs specified command on for specified service');
    });

    context('with service option as comma seporated list', () => {
      it('generates serverless config and symlinks for specified services');
      it('runs specified command on for specified services');
    });
  });

  describe('run offline command', () => {
    it('runs spawns `offline:start hook`');
  });

  describe('add command (not implemented yet)', () => {
    it('adds a new micro service template');
    it('if no service directory set, uses default');
    it('throws error if no name specified');
  });
});
