if (!process.argv.includes('--confirm-read-only-production')) { console.error('Pass --confirm-read-only-production to run this read-only inventory.'); process.exit(1); }
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const ts = require(path.join(process.cwd(), 'node_modules/typescript'));
const child = spawn(process.execPath, ['node_modules/convex/bin/main.js', 'mcp', 'start', '--project-dir', process.cwd(), '--prod', '--dangerously-enable-production-deployments', '--disable-tools', 'data,tables,functionSpec,run,envList,envGet,envSet,envRemove,logs'], {stdio:['pipe','pipe','pipe'], windowsHide:true});
let seq=0, buffer=''; const pending=new Map();
child.stdout.on('data', chunk=>{buffer+=chunk; let i; while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);try{const msg=JSON.parse(line);if(pending.has(msg.id)){pending.get(msg.id)(msg);pending.delete(msg.id);}}catch{}}});
child.stderr.on('data', ()=>{});
const request=(method,params)=>new Promise(resolve=>{const id=++seq;pending.set(id,resolve);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');});
const timeout=setTimeout(()=>{console.log('Inventory incomplete: read-only connection timed out.');child.kill();process.exitCode=1;},55000);
const read=p=>fs.readFileSync(path.join(process.cwd(),p),'utf8');
const helpers=read('convex/lib/founderEmails.ts')+'\n'+read('convex/lib/stripeSubscriptionCompatibility.ts');
const diagnostic=read('convex/legacyBillingInventory.ts').replace(/^import .*;\r?\n/gm,'').replace(/export const page = internalQuery\(\{[\s\S]*?handler: async \(ctx, args\) => \{/, 'export default query({ handler: async (ctx) => { const args = INVENTORY_ARGS;');

(async()=>{try{
  await request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'scrub-read-only-inventory',version:'1'}});
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  const statusResponse=await request('tools/call',{name:'status',arguments:{projectDir:process.cwd()}});
  if(statusResponse.error||statusResponse.result?.isError)throw Error('authentication');
  const selector=JSON.parse(statusResponse.result.content[0].text).availableDeployments.find(d=>d.kind==='prod')?.deploymentSelector;
  if(!selector)throw Error('production unavailable');
  const asOf=Date.now();let cursor=null,done=false,pages=0;const rows=new Map();
  while(!done){
    if(++pages>10000)throw Error('page bound');
    const args={asOf,paginationOpts:{cursor,numItems:50}};
    const source='import { query } from "convex:/_system/repl/wrappers.js";\n'+helpers.replace(/^export /gm,'')+'\n'+diagnostic.replace('INVENTORY_ARGS',JSON.stringify(args));
    const query=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
    const response=await request('tools/call',{name:'runOneoffQuery',arguments:{deploymentSelector:selector,query}});
    if(response.error||response.result?.isError)throw Error('query rejected');
    const value=JSON.parse(response.result.content[0].text).result;
    if(!value||!Array.isArray(value.page)||typeof value.isDone!=='boolean')throw Error('unexpected result');
    for(const row of value.page){
      if(Object.keys(row).sort().join(',')!=='companyId,complimentaryEntitlement,operationalAccessChange,subscriptionStatus')throw Error('projection');
      const previous=rows.get(row.companyId);if(previous&&JSON.stringify(previous)!==JSON.stringify(row))throw Error('concurrent change');rows.set(row.companyId,row);
    }
    cursor=value.continueCursor;done=value.isDone;
  }
  const report={asOf,complete:true,pages,companies:[...rows.values()]};

  console.log(JSON.stringify(report));
}catch{console.log('Inventory incomplete: sandboxed production query failed; no customer records or configuration values displayed.');process.exitCode=1;}finally{clearTimeout(timeout);child.kill();}})();
