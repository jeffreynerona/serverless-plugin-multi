/* eslint-env node, mocha */
const chai = require('chai');
const sinon = require('sinon');
const { getInstalledPathSync } = require('get-installed-path');
const fs = require('fs');
const utils = require('../lib/utils');

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
      expect(() => utils.getServerlessConfigFile()).to.throw(/Cannot find serverless config/);
    });

    it('searches for config file in order from .yml, .yaml, to .json', () => {
      sandbox.stub(process, 'cwd').returns('/');
      const fn = sandbox.stub(fs, 'existsSync').callsFake((name) => {
        return name === '/serverless.json';
      });
      const expected = ['yml', 'yaml', 'json'];
      utils.getServerlessConfigFile();
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
      expect(utils.getServerlessConfigFile()).to.equal('/some/path/serverless.yml');
    });
  });

  describe('iterateOverServices(serverless, options, func)', () => {
    let serverless;
    let options;

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

    it('returns a resolved promise if service directory is not found', (done) => {
      const fn = sinon.stub();
      const promise = utils.iterateOverServices(serverless, options, fn);
      promise.then(() => {
        expect(fn.notCalled).to.equal(true);
        done();
      })
        .catch(done);
    });

    context('without any custom options', () => {
      it('call `func` on each folder with `services` directory', (done) => {
        sandbox.stub(process, 'cwd').returns('/');
        sandbox.stub(process, 'chdir');
        const fn = sinon.stub();
        const exists = sandbox.stub(fs, 'existsSync').returns(true);
        sandbox.stub(fs, 'readdirSync').returns(['foo', 'bar']);
        sandbox.stub(fs, 'statSync').returns({ isDirectory: () => true });
        sandbox.stub(serverless.yamlParser, 'parse')
          .callsFake(name => ({ yamlFor: name }));

        utils.iterateOverServices(serverless, options, fn)
          .then(() => {
            expect(exists.calledWith('/services/foo/service.yml')).to.equal(true);
            expect(exists.calledWith('/services/bar/service.yml')).to.equal(true);
            expect(fn.calledTwice).to.equal(true);
            expect(fn.calledWith({ yamlFor: '/services/bar/service.yml' }, 'bar', '/services/bar')).to.equal(true);
            expect(fn.calledWith({ yamlFor: '/services/foo/service.yml' }, 'foo', '/services/foo')).to.equal(true);
            done();
          })
          .catch(done);
      });
    });

    context('with custom.multi.location set', () => {
      it('call `func` on each folder with `services` directory', (done) => {
        sandbox.stub(process, 'cwd').returns('/');
        sandbox.stub(process, 'chdir');
        const fn = sinon.stub();
        const exists = sandbox.stub(fs, 'existsSync').returns(true);
        sandbox.stub(fs, 'readdirSync').returns(['foo', 'bar']);
        sandbox.stub(fs, 'statSync').returns({ isDirectory: () => true });
        sandbox.stub(serverless.yamlParser, 'parse')
          .callsFake(name => ({ yamlFor: name }));
        serverless.service.custom = {
          multi: { location: 'custom' },
        };
        utils.iterateOverServices(serverless, options, fn)
          .then(() => {
            expect(exists.calledWith('/custom/foo/service.yml')).to.equal(true);
            expect(exists.calledWith('/custom/bar/service.yml')).to.equal(true);
            expect(fn.calledTwice).to.equal(true);
            expect(fn.calledWith({ yamlFor: '/custom/bar/service.yml' }, 'bar', '/custom/bar')).to.equal(true);
            expect(fn.calledWith({ yamlFor: '/custom/foo/service.yml' }, 'foo', '/custom/foo')).to.equal(true);
            done();
          })
          .catch(done);
      });
    });
  });
});
