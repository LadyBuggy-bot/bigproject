// Jest 29 cannot natively require ESM dependencies as Node 24 can.
const ts = require('typescript');
module.exports = {
  process(source, filename) {
    return {
      code: ts.transpileModule(source, {
        fileName: filename,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
        },
      }).outputText,
    };
  },
};
