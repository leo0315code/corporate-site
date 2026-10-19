// QA harness: bundle TS validators via esbuild then run assertions
import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const entry = path.resolve(__dirname, '_entry.ts');

import fs from 'node:fs';
fs.writeFileSync(entry, `
export * from '../src/utils/validate';
export { VALIDATION, MESSAGES } from '../src/constants';
`);

const outfile = path.resolve(__dirname, '_bundle.mjs');
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  alias: { '@': path.resolve(__dirname, '../src') },
  logLevel: 'silent',
});

const V = await import(pathToFileURL(outfile).href);

let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  =>  ${JSON.stringify(actual)}${ok ? '' : '  (expected ' + JSON.stringify(expected) + ')'}`);
  ok ? pass++ : fail++;
}

// validateMessage full-form cases
check('valid mobile only', V.validateMessage({name:'张先生',company:'',phone:'13800000000',email:'',content:'想了解产品报价'}), {});
check('valid email only', V.validateMessage({name:'李女士',company:'示例',phone:'',email:'li@example.com',content:'需要一份方案'}), {});
check('both phone & email empty -> both errors', Object.keys(V.validateMessage({name:'王先生',company:'',phone:'',email:'',content:'测试内容测试'})).sort(), ['email','phone']);
check('name too short', V.validateMessage({name:'张',company:'',phone:'13800000000',email:'',content:'测试内容测试'}).name, '姓名需为 2~30 个字符');
check('name empty required', V.validateMessage({name:'',company:'',phone:'13800000000',email:'',content:'测试内容测试'}).name, '此项为必填');
check('name 31 -> invalid', !!V.validateMessage({name:'张'.repeat(31),company:'',phone:'13800000000',email:'',content:'测试内容测试'}).name, true);
check('name 30 -> valid', V.validateMessage({name:'张'.repeat(30),company:'',phone:'13800000000',email:'',content:'测试内容测试'}).name, undefined);
check('company empty ok (optional)', V.validateMessage({name:'王先生',company:'',phone:'13800000000',email:'',content:'测试内容测试'}).company, undefined);
check('company 51 -> invalid', !!V.validateMessage({name:'王先生',company:'公'.repeat(51),phone:'13800000000',email:'',content:'测试内容测试'}).company, true);
check('content 4 -> invalid', !!V.validateMessage({name:'王先生',company:'',phone:'13800000000',email:'',content:'1234'}).content, true);
check('content 5 -> valid', V.validateMessage({name:'王先生',company:'',phone:'13800000000',email:'',content:'12345'}).content, undefined);
check('content 500 -> valid', V.validateMessage({name:'王先生',company:'',phone:'13800000000',email:'',content:'测'.repeat(500)}).content, undefined);
check('content 501 -> invalid', !!V.validateMessage({name:'王先生',company:'',phone:'13800000000',email:'',content:'测'.repeat(501)}).content, true);
check('invalid mobile 12345', V.validateMessage({name:'王先生',company:'',phone:'12345',email:'',content:'测试内容测试'}).phone, '请填写正确的电话号码');
check('invalid email', V.validateMessage({name:'王先生',company:'',phone:'',email:'bad@',content:'测试内容测试'}).email, '请填写正确的邮箱');
check('valid tel 010-12345678', V.validateMessage({name:'王先生',company:'',phone:'010-12345678',email:'',content:'测试内容测试'}).phone, undefined);
check('valid tel 01012345678', V.validateMessage({name:'王先生',company:'',phone:'01012345678',email:'',content:'测试内容测试'}).phone, undefined);

// isMessageValid
check('isMessageValid empty errors -> true', V.isMessageValid({}), true);
check('isMessageValid with error -> false', V.isMessageValid({name:'x'}), false);

console.log(`\nFRONTEND VALIDATE RESULTS: pass=${pass} fail=${fail}`);
fs.rmSync(entry, {force:true});
process.exit(fail ? 1 : 0);
